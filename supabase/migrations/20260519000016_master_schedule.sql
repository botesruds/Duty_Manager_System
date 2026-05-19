-- Full week grid for the admin's read-only master view.
-- Every (in-season location × duty_slot) cell, left-joined to bookings/staff,
-- so empty cells appear as rows with null staff. Admin-only.

create or replace function public.master_schedule()
returns table (
  duty_slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  location_id uuid,
  location_name text,
  booking_id uuid,
  staff_id uuid,
  staff_name text,
  emp_no text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  return query
    select
      ds.id, ds.duty_type, ds.day_of_week,
      l.id, l.name,
      b.id, st.id, st.name, st.emp_no
    from public.duty_slots ds
    cross join public.locations l
    left join public.bookings b on b.duty_slot_id = ds.id and b.location_id = l.id
    left join public.staff st on st.id = b.staff_id
    where l.category = (select current_season from public.app_settings where id = 1)
    order by ds.duty_type, l.name, ds.day_of_week;
end;
$$;
grant execute on function public.master_schedule() to authenticated;
