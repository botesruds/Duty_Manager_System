-- Duty swap requests: teacher A posts they want out of a booking and prefers a different day.
-- Auto-match: if another open request mirrors theirs (same category, swapped source/target days), pair instantly.
-- Manual take: if no auto-match, any teacher with a compatible booking can take it.

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_staff_id uuid not null references public.staff(id) on delete cascade,
  source_booking_id uuid not null references public.bookings(id) on delete cascade,
  -- Day the requester wants to move TO. null = any day is fine.
  target_day public.day_of_week,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  matched_with_request_id uuid references public.swap_requests(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index swap_requests_status_idx on public.swap_requests(status);
-- Only one OPEN request per booking. Cancelled/completed don't block re-posting.
create unique index swap_requests_one_open_per_booking
  on public.swap_requests(source_booking_id) where status = 'open';

alter table public.swap_requests enable row level security;
-- Any authenticated teacher can read the board.
create policy swap_requests_read on public.swap_requests for select to authenticated using (true);
-- No direct writes; everything goes through RPCs.

-- Atomic swap helper: swaps staff_ids on two bookings and marks both swap requests completed.
-- Inner function — assumes caller has already validated authorization and category compatibility.
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
  -- Lock requests
  select source_booking_id into v_booking_a from public.swap_requests where id = p_req_a for update;
  select source_booking_id into v_booking_b from public.swap_requests where id = p_req_b for update;
  if v_booking_a is null or v_booking_b is null then
    raise exception 'Swap request missing.' using errcode = 'P0001';
  end if;

  -- Lock bookings, capture staff + slot
  select staff_id, duty_slot_id into v_staff_a, v_slot_a from public.bookings where id = v_booking_a for update;
  select staff_id, duty_slot_id into v_staff_b, v_slot_b from public.bookings where id = v_booking_b for update;

  -- Guard against duplicate-slot conflict: if either teacher already has a booking on the other's slot
  -- (because that slot has capacity > 1), the swap would create a duplicate (staff_id, duty_slot_id) row.
  if exists (
    select 1 from public.bookings
    where staff_id = v_staff_b and duty_slot_id = v_slot_a and id <> v_booking_a
  ) then
    raise exception 'Swap blocked: the other teacher already has a duty on that slot.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.bookings
    where staff_id = v_staff_a and duty_slot_id = v_slot_b and id <> v_booking_b
  ) then
    raise exception 'Swap blocked: you already have a duty on that slot.' using errcode = 'P0001';
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

-- Create a swap request. Validates ownership and category match for target_day if specified.
-- If a mirror open request already exists (same category, swapped days), auto-execute and return completed.
create or replace function public.create_swap_request(
  p_source_booking_id uuid,
  p_target_day public.day_of_week
) returns table (request_id uuid, matched boolean) language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid := public.current_staff_id();
  v_owner uuid;
  v_source_slot record;
  v_new_request_id uuid;
  v_match record;
begin
  if v_staff_id is null then
    raise exception 'No staff record linked to this account.' using errcode = 'P0001';
  end if;

  select b.staff_id, s.duty_type, s.day_of_week
    into v_source_slot
    from public.bookings b
    join public.duty_slots s on s.id = b.duty_slot_id
    where b.id = p_source_booking_id;
  v_owner := v_source_slot.staff_id;
  if v_owner is null then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;
  if v_owner <> v_staff_id then
    raise exception 'You can only request swaps for your own bookings.' using errcode = 'P0001';
  end if;
  if p_target_day is not null and p_target_day = v_source_slot.day_of_week then
    raise exception 'Target day must differ from the current duty day.' using errcode = 'P0001';
  end if;

  insert into public.swap_requests (requester_staff_id, source_booking_id, target_day)
  values (v_staff_id, p_source_booking_id, p_target_day)
  returning id into v_new_request_id;

  -- Look for a mirror: another open request from a different teacher whose source booking is on
  -- our desired target_day (or anything if we said "any"), same category, and whose own target_day
  -- matches our source day (or is null).
  select sr.id as req_id, b.id as booking_id, s.day_of_week, s.duty_type
    into v_match
    from public.swap_requests sr
    join public.bookings b on b.id = sr.source_booking_id
    join public.duty_slots s on s.id = b.duty_slot_id
    where sr.status = 'open'
      and sr.id <> v_new_request_id
      and sr.requester_staff_id <> v_staff_id
      and public.duty_category(s.duty_type) = public.duty_category(v_source_slot.duty_type)
      and (p_target_day is null or s.day_of_week = p_target_day)
      and (sr.target_day is null or sr.target_day = v_source_slot.day_of_week)
    limit 1;

  if v_match.req_id is not null then
    perform public._do_swap(v_new_request_id, v_match.req_id);
    return query select v_new_request_id, true;
  else
    return query select v_new_request_id, false;
  end if;
end;
$$;
grant execute on function public.create_swap_request(uuid, public.day_of_week) to authenticated;

-- Cancel: requester only, open only.
create or replace function public.cancel_swap_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := public.current_staff_id();
  v_owner uuid;
  v_status text;
begin
  select requester_staff_id, status into v_owner, v_status
    from public.swap_requests where id = p_request_id;
  if v_owner is null then
    raise exception 'Swap request not found.' using errcode = 'P0001';
  end if;
  if v_owner <> v_caller then
    raise exception 'You can only cancel your own swap requests.' using errcode = 'P0001';
  end if;
  if v_status <> 'open' then
    raise exception 'Swap request is no longer open.' using errcode = 'P0001';
  end if;
  update public.swap_requests set status = 'cancelled' where id = p_request_id;
end;
$$;
grant execute on function public.cancel_swap_request(uuid) to authenticated;

-- Take an open request: caller offers one of their own bookings as the trade.
-- Validates category match and target_day constraint. Then executes swap atomically.
create or replace function public.take_swap_request(p_request_id uuid, p_taker_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := public.current_staff_id();
  v_req record;
  v_source_slot record;
  v_taker_slot record;
  v_taker_request_id uuid;
begin
  if v_caller is null then
    raise exception 'No staff record linked to this account.' using errcode = 'P0001';
  end if;

  select sr.*, b.duty_slot_id as source_slot_id
    into v_req
    from public.swap_requests sr
    join public.bookings b on b.id = sr.source_booking_id
    where sr.id = p_request_id
    for update;
  if v_req.id is null then
    raise exception 'Swap request not found.' using errcode = 'P0001';
  end if;
  if v_req.status <> 'open' then
    raise exception 'Swap request is no longer open.' using errcode = 'P0001';
  end if;
  if v_req.requester_staff_id = v_caller then
    raise exception 'You can''t take your own swap request.' using errcode = 'P0001';
  end if;

  -- Source slot info
  select s.duty_type, s.day_of_week into v_source_slot
    from public.duty_slots s where s.id = v_req.source_slot_id;

  -- Taker's offered booking
  select b.staff_id, s.duty_type, s.day_of_week
    into v_taker_slot
    from public.bookings b
    join public.duty_slots s on s.id = b.duty_slot_id
    where b.id = p_taker_booking_id;
  if v_taker_slot.staff_id is null then
    raise exception 'Offered booking not found.' using errcode = 'P0001';
  end if;
  if v_taker_slot.staff_id <> v_caller then
    raise exception 'You can only offer your own booking.' using errcode = 'P0001';
  end if;

  if public.duty_category(v_taker_slot.duty_type) <> public.duty_category(v_source_slot.duty_type) then
    raise exception 'Swap must be within the same duty category (break or lunch).' using errcode = 'P0001';
  end if;
  -- Requester's target_day must match (or be null = any).
  if v_req.target_day is not null and v_req.target_day <> v_taker_slot.day_of_week then
    raise exception 'The requester wants a % duty; your offered booking is on %.',
      v_req.target_day, v_taker_slot.day_of_week using errcode = 'P0001';
  end if;
  -- Taker effectively wants the requester's day, so their day must differ.
  if v_taker_slot.day_of_week = v_source_slot.day_of_week then
    raise exception 'Your offered booking must be on a different day than the requester''s.' using errcode = 'P0001';
  end if;
  -- Block if taker already has an open swap on the same booking.
  if exists (
    select 1 from public.swap_requests
    where source_booking_id = p_taker_booking_id and status = 'open'
  ) then
    raise exception 'You already have an open swap request on the offered booking. Cancel it first.' using errcode = 'P0001';
  end if;

  -- Create a synthetic completed-immediately request for the taker so audit trail is symmetric.
  insert into public.swap_requests
    (requester_staff_id, source_booking_id, target_day)
    values (v_caller, p_taker_booking_id, v_source_slot.day_of_week)
  returning id into v_taker_request_id;

  perform public._do_swap(v_req.id, v_taker_request_id);
end;
$$;
grant execute on function public.take_swap_request(uuid, uuid) to authenticated;

-- Board: all open swap requests with helpful joined info.
create or replace function public.list_swap_board()
returns table (
  request_id uuid,
  requester_staff_id uuid,
  requester_name text,
  requester_emp_no text,
  source_booking_id uuid,
  source_day public.day_of_week,
  source_duty_type public.duty_type,
  target_day public.day_of_week,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    sr.id, st.id, st.name, st.emp_no,
    sr.source_booking_id, s.day_of_week, s.duty_type,
    sr.target_day, sr.created_at
  from public.swap_requests sr
  join public.staff st on st.id = sr.requester_staff_id
  join public.bookings b on b.id = sr.source_booking_id
  join public.duty_slots s on s.id = b.duty_slot_id
  where sr.status = 'open'
  order by sr.created_at desc;
$$;
grant execute on function public.list_swap_board() to authenticated;

-- The caller's own bookings that would be valid offers to take the given request.
create or replace function public.eligible_takes_for(p_request_id uuid)
returns table (
  booking_id uuid,
  day_of_week public.day_of_week,
  duty_type public.duty_type,
  assigned_location text
) language sql stable security definer set search_path = public as $$
  with req as (
    select sr.target_day,
           s.duty_type as source_duty_type,
           s.day_of_week as source_day,
           sr.requester_staff_id
    from public.swap_requests sr
    join public.bookings b on b.id = sr.source_booking_id
    join public.duty_slots s on s.id = b.duty_slot_id
    where sr.id = p_request_id and sr.status = 'open'
  )
  select b.id, s.day_of_week, s.duty_type, b.assigned_location
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id, req
  where b.staff_id = public.current_staff_id()
    and req.requester_staff_id <> public.current_staff_id()
    and public.duty_category(s.duty_type) = public.duty_category(req.source_duty_type)
    and s.day_of_week <> req.source_day
    and (req.target_day is null or s.day_of_week = req.target_day)
    and not exists (
      select 1 from public.swap_requests sr2
      where sr2.source_booking_id = b.id and sr2.status = 'open'
    );
$$;
grant execute on function public.eligible_takes_for(uuid) to authenticated;

-- The caller's own swap requests across all statuses, for the "My requests" section.
create or replace function public.my_swap_requests()
returns table (
  request_id uuid,
  status text,
  source_booking_id uuid,
  source_day public.day_of_week,
  source_duty_type public.duty_type,
  target_day public.day_of_week,
  matched_with_request_id uuid,
  created_at timestamptz,
  completed_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    sr.id, sr.status, sr.source_booking_id,
    s.day_of_week, s.duty_type,
    sr.target_day, sr.matched_with_request_id, sr.created_at, sr.completed_at
  from public.swap_requests sr
  join public.bookings b on b.id = sr.source_booking_id
  join public.duty_slots s on s.id = b.duty_slot_id
  where sr.requester_staff_id = public.current_staff_id()
  order by sr.created_at desc;
$$;
grant execute on function public.my_swap_requests() to authenticated;
