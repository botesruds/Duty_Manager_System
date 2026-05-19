-- All in-season locations are now active for every valid (day, duty type)
-- combination. The slot_locations join table is no longer needed.
-- Capacity per (day, type) = count of in-season locations.

-- assign_booking_to_location no longer reads slot_locations; rewrite first so we can drop the table.
create or replace function public.assign_booking_to_location(
  p_booking_id uuid, p_location_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid;
  v_used int;
  v_category text;
  v_season text;
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;

  select duty_slot_id into v_slot from public.bookings where id = p_booking_id for update;
  if v_slot is null then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;

  select category into v_category from public.locations where id = p_location_id;
  if v_category is null then
    raise exception 'Location not found.' using errcode = 'P0001';
  end if;

  select current_season into v_season from public.app_settings where id = 1;
  if v_category <> v_season then
    raise exception 'Location is not in the current season (%).', v_season using errcode = 'P0001';
  end if;

  -- One person per location per (slot). Block double-up.
  select count(*)::int into v_used
  from public.bookings
  where duty_slot_id = v_slot and location_id = p_location_id and id <> p_booking_id;
  if v_used >= 1 then
    raise exception 'That location is already taken for this slot.' using errcode = 'P0001';
  end if;

  update public.bookings set location_id = p_location_id where id = p_booking_id;
end;
$$;
grant execute on function public.assign_booking_to_location(uuid, uuid) to authenticated;

-- Drop the obsolete join table + its admin RPC.
drop function if exists public.set_slot_location_capacity(uuid, uuid, int);
drop table if exists public.slot_locations cascade;

-- schedule_day_locations: cross-join in-season locations with this day's duty_slots.
drop function if exists public.schedule_day_locations(public.day_of_week);
create or replace function public.schedule_day_locations(p_day public.day_of_week)
returns table (
  duty_slot_id uuid,
  duty_type public.duty_type,
  location_id uuid,
  location_name text,
  capacity int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  return query
    select ds.id, ds.duty_type, l.id, l.name, 1 as capacity
    from public.duty_slots ds
    cross join public.locations l
    where ds.day_of_week = p_day
      and l.category = (select current_season from public.app_settings where id = 1)
    order by ds.duty_type, l.name;
end;
$$;
grant execute on function public.schedule_day_locations(public.day_of_week) to authenticated;

-- Booking-phase capacity = count of in-season locations. Replaces duty_slot.capacity for
-- the booking flow; the column itself is left in place but no longer authoritative.

create or replace function public.book_slot(p_slot_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid := public.current_staff_id();
  v_duty_type public.duty_type;
  v_capacity int;
  v_taken int;
  v_quota int;
  v_used int;
  v_open boolean;
  v_booking_id uuid;
begin
  if v_staff_id is null then
    raise exception 'No staff record linked to this account.' using errcode = 'P0001';
  end if;
  if public.is_monitor() then
    raise exception 'Monitors do not book duties.' using errcode = 'P0001';
  end if;

  select booking_window_open into v_open from public.app_settings where id = 1;
  if not v_open then
    raise exception 'Booking window is closed.' using errcode = 'P0001';
  end if;

  select duty_type into v_duty_type
  from public.duty_slots where id = p_slot_id for update;
  if v_duty_type is null then
    raise exception 'Slot not found.' using errcode = 'P0001';
  end if;

  select count(*)::int into v_capacity
  from public.locations
  where category = (select current_season from public.app_settings where id = 1);
  if v_capacity = 0 then
    raise exception 'No locations are configured for the current season yet.' using errcode = 'P0001';
  end if;

  select count(*)::int into v_taken from public.bookings where duty_slot_id = p_slot_id;
  if v_taken >= v_capacity then
    raise exception 'Slot is full.' using errcode = 'P0001';
  end if;

  v_quota := public.effective_quota(v_staff_id, v_duty_type);
  select count(*)::int into v_used
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  where b.staff_id = v_staff_id
    and public.duty_category(s.duty_type) = public.duty_category(v_duty_type);
  if v_used >= v_quota then
    raise exception 'You have already booked your % duty quota (%).',
      public.duty_category(v_duty_type), v_quota using errcode = 'P0001';
  end if;

  insert into public.bookings (staff_id, duty_slot_id) values (v_staff_id, p_slot_id)
    returning id into v_booking_id;
  return v_booking_id;
end;
$$;

-- Teacher slot browser: capacity now equals in-season location count.
create or replace function public.get_browsable_slots()
returns table (
  id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  capacity int,
  spots_taken int,
  already_booked boolean
) language sql stable security definer set search_path = public as $$
  select
    s.id, s.duty_type, s.day_of_week,
    (select count(*)::int from public.locations
       where category = (select current_season from public.app_settings where id = 1)) as capacity,
    (select count(*)::int from public.bookings b where b.duty_slot_id = s.id) as spots_taken,
    exists (
      select 1 from public.bookings b
      where b.duty_slot_id = s.id and b.staff_id = public.current_staff_id()
    ) as already_booked
  from public.duty_slots s
  order by s.day_of_week, s.duty_type;
$$;
grant execute on function public.get_browsable_slots() to authenticated;
