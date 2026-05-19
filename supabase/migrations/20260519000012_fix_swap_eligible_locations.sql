-- eligible_takes_for previously returned the free-text assigned_location column,
-- which migration 11 dropped. Re-create it to join on the new locations table.

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
    );
$$;
grant execute on function public.eligible_takes_for(uuid) to authenticated;
