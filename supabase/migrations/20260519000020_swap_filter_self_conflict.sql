-- A teacher who already has a booking on the requester's source slot can't take
-- the swap (it would put them on that slot twice). Filter such requests out of
-- both the Dashboard notification and the eligible-offers modal so they never
-- appear as actionable. Also reword the fallback error messages from _do_swap
-- so they read correctly regardless of which side called the swap.

drop function if exists public.actionable_swap_requests();
create or replace function public.actionable_swap_requests()
returns table (
  request_id uuid,
  requester_name text,
  source_day public.day_of_week,
  source_duty_type public.duty_type,
  target_day public.day_of_week,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select sr.id, st.name, s.day_of_week, s.duty_type, sr.target_day, sr.created_at
  from public.swap_requests sr
  join public.staff st on st.id = sr.requester_staff_id
  join public.bookings b_src on b_src.id = sr.source_booking_id
  join public.duty_slots s on s.id = b_src.duty_slot_id
  where sr.status = 'open'
    and sr.requester_staff_id <> public.current_staff_id()
    and not exists (
      select 1 from public.bookings bx
      where bx.staff_id = public.current_staff_id()
        and bx.duty_slot_id = b_src.duty_slot_id
    )
    and exists (
      select 1 from public.bookings b
      join public.duty_slots ds on ds.id = b.duty_slot_id
      where b.staff_id = public.current_staff_id()
        and public.duty_category(ds.duty_type) = public.duty_category(s.duty_type)
        and ds.day_of_week <> s.day_of_week
        and (sr.target_day is null or ds.day_of_week = sr.target_day)
        and not exists (
          select 1 from public.swap_requests sr2
          where sr2.source_booking_id = b.id and sr2.status = 'open'
        )
    )
  order by sr.created_at desc;
$$;
grant execute on function public.actionable_swap_requests() to authenticated;

drop function if exists public.eligible_takes_for(uuid);
create or replace function public.eligible_takes_for(p_request_id uuid)
returns table (
  booking_id uuid,
  day_of_week public.day_of_week,
  duty_type public.duty_type,
  location_name text
) language sql stable security definer set search_path = public as $$
  with req as (
    select sr.target_day,
           s.id as source_slot_id,
           s.duty_type as source_duty_type,
           s.day_of_week as source_day,
           sr.requester_staff_id
    from public.swap_requests sr
    join public.bookings b on b.id = sr.source_booking_id
    join public.duty_slots s on s.id = b.duty_slot_id
    where sr.id = p_request_id and sr.status = 'open'
  )
  select b.id, s.day_of_week, s.duty_type, l.name
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  left join public.locations l on l.id = b.location_id, req
  where b.staff_id = public.current_staff_id()
    and req.requester_staff_id <> public.current_staff_id()
    and public.duty_category(s.duty_type) = public.duty_category(req.source_duty_type)
    and s.day_of_week <> req.source_day
    and (req.target_day is null or s.day_of_week = req.target_day)
    and not exists (
      select 1 from public.swap_requests sr2
      where sr2.source_booking_id = b.id and sr2.status = 'open'
    )
    -- Caller mustn't already have a booking on the requester's source slot,
    -- or the swap would create a duplicate.
    and not exists (
      select 1 from public.bookings bx, req
      where bx.staff_id = public.current_staff_id()
        and bx.duty_slot_id = req.source_slot_id
    );
$$;
grant execute on function public.eligible_takes_for(uuid) to authenticated;

-- Reword the _do_swap conflict errors so they're accurate regardless of caller perspective.
create or replace function public._do_swap(p_req_a uuid, p_req_b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking_a uuid;
  v_booking_b uuid;
  v_staff_a uuid;
  v_staff_b uuid;
  v_slot_a uuid;
  v_slot_b uuid;
begin
  select source_booking_id into v_booking_a from public.swap_requests where id = p_req_a for update;
  select source_booking_id into v_booking_b from public.swap_requests where id = p_req_b for update;
  if v_booking_a is null or v_booking_b is null then
    raise exception 'Swap request missing.' using errcode = 'P0001';
  end if;

  select staff_id, duty_slot_id into v_staff_a, v_slot_a from public.bookings where id = v_booking_a for update;
  select staff_id, duty_slot_id into v_staff_b, v_slot_b from public.bookings where id = v_booking_b for update;

  if exists (
    select 1 from public.bookings
    where staff_id = v_staff_b and duty_slot_id = v_slot_a and id <> v_booking_a
  ) or exists (
    select 1 from public.bookings
    where staff_id = v_staff_a and duty_slot_id = v_slot_b and id <> v_booking_b
  ) then
    raise exception 'Swap blocked: one of the teachers already has a duty on that slot, so the swap would create a duplicate.'
      using errcode = 'P0001';
  end if;

  update public.bookings set staff_id = v_staff_b where id = v_booking_a;
  update public.bookings set staff_id = v_staff_a where id = v_booking_b;

  update public.swap_requests
    set status = 'completed', completed_at = now(), matched_with_request_id = p_req_b
    where id = p_req_a;
  update public.swap_requests
    set status = 'completed', completed_at = now(), matched_with_request_id = p_req_a
    where id = p_req_b;
end;
$$;
