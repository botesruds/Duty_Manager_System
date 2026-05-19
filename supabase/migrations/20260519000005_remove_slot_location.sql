-- Slots are now just "this day + this duty type has N spots". Zone and location
-- live outside the platform (admin assigns physical posts to names externally).
-- todays_duties() return type changes, so it has to be dropped before recreated.

drop function if exists public.todays_duties();

alter table public.duty_slots drop column if exists zone;
alter table public.duty_slots drop column if exists location;

create or replace function public.todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  staff_id uuid,
  emp_no text,
  staff_name text,
  marked_present boolean,
  marked_by_monitor boolean,
  marked_by_staff_id uuid,
  marked_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week,
    st.id, st.emp_no, st.name,
    ar.marked_present, ar.marked_by_monitor, ar.marked_by_staff_id, ar.marked_at
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  join public.staff st on st.id = b.staff_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  where s.day_of_week::text = to_char(current_date, 'Dy')
  order by s.duty_type, st.name;
$$;
grant execute on function public.todays_duties() to authenticated;
