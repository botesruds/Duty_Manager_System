-- Teacher's own schedule across the whole week: every booking, the day, the
-- duty type, and (if published and the location is in-season) the assigned
-- location name. Off-season locations resolve to null so the UI can say
-- "awaiting location" instead of showing a confusing off-season name.

create or replace function public.my_schedule()
returns table (
  booking_id uuid,
  day_of_week public.day_of_week,
  duty_type public.duty_type,
  location_name text
) language sql stable security definer set search_path = public as $$
  select
    b.id, ds.day_of_week, ds.duty_type, l.name
  from public.bookings b
  join public.duty_slots ds on ds.id = b.duty_slot_id
  left join public.locations l
    on l.id = b.location_id
    and l.category = (select current_season from public.app_settings where id = 1)
  where b.staff_id = public.current_staff_id()
  order by
    case ds.day_of_week
      when 'Mon' then 1 when 'Tue' then 2 when 'Wed' then 3
      when 'Thu' then 4 when 'Fri' then 5
    end,
    ds.duty_type;
$$;
grant execute on function public.my_schedule() to authenticated;
