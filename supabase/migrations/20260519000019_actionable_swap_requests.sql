-- Return the open swap requests that the calling teacher could actually take
-- (has at least one eligible booking to offer). Used by the Dashboard banner so
-- teachers are prompted to action incoming swap requests right on sign-in.

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
