-- Promote locations from free-text per-booking to a first-class entity.
-- Admin defines a catalog of locations once, then enables them per duty slot with
-- a capacity. Each booking is assigned to one location.

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- (slot, location) → capacity. Absence = location not used for that slot.
create table public.slot_locations (
  duty_slot_id uuid not null references public.duty_slots(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  capacity int not null check (capacity > 0),
  sort_order int not null default 0,
  primary key (duty_slot_id, location_id)
);
create index slot_locations_slot_idx on public.slot_locations(duty_slot_id);

-- Bookings now point at a structured location instead of free text.
alter table public.bookings drop column if exists assigned_location;
alter table public.bookings add column if not exists location_id uuid
  references public.locations(id) on delete set null;
create index bookings_location_idx on public.bookings(location_id);

alter table public.locations enable row level security;
alter table public.slot_locations enable row level security;

create policy locations_read on public.locations for select to authenticated using (true);
create policy locations_admin_write on public.locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy slot_locations_read on public.slot_locations for select to authenticated using (true);
create policy slot_locations_admin_write on public.slot_locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- RPC: enable a location for a duty slot or update its capacity.
create or replace function public.set_slot_location_capacity(
  p_duty_slot_id uuid, p_location_id uuid, p_capacity int
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  if p_capacity is null or p_capacity < 0 then
    raise exception 'Capacity must be 0 or positive.' using errcode = 'P0001';
  end if;
  if p_capacity = 0 then
    -- Remove + unassign any bookings sitting on this (slot, location).
    update public.bookings b
    set location_id = null
    where b.duty_slot_id = p_duty_slot_id and b.location_id = p_location_id;
    delete from public.slot_locations
    where duty_slot_id = p_duty_slot_id and location_id = p_location_id;
  else
    insert into public.slot_locations (duty_slot_id, location_id, capacity)
    values (p_duty_slot_id, p_location_id, p_capacity)
    on conflict (duty_slot_id, location_id) do update set capacity = excluded.capacity;
  end if;
end;
$$;
grant execute on function public.set_slot_location_capacity(uuid, uuid, int) to authenticated;

-- RPC: assign a booking to a location. Validates the location is enabled on the
-- booking's slot and that capacity isn't already full.
create or replace function public.assign_booking_to_location(
  p_booking_id uuid, p_location_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid;
  v_capacity int;
  v_used int;
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;

  select duty_slot_id into v_slot from public.bookings where id = p_booking_id for update;
  if v_slot is null then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;

  select capacity into v_capacity
  from public.slot_locations
  where duty_slot_id = v_slot and location_id = p_location_id;
  if v_capacity is null then
    raise exception 'That location is not configured for this duty slot.' using errcode = 'P0001';
  end if;

  select count(*)::int into v_used
  from public.bookings
  where duty_slot_id = v_slot and location_id = p_location_id and id <> p_booking_id;
  if v_used >= v_capacity then
    raise exception 'That location is already full.' using errcode = 'P0001';
  end if;

  update public.bookings set location_id = p_location_id where id = p_booking_id;
end;
$$;
grant execute on function public.assign_booking_to_location(uuid, uuid) to authenticated;

create or replace function public.unassign_booking_location(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  update public.bookings set location_id = null where id = p_booking_id;
end;
$$;
grant execute on function public.unassign_booking_location(uuid) to authenticated;

-- All slot_locations for a given day, with their capacities and location names.
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
    select ds.id, ds.duty_type, l.id, l.name, sl.capacity
    from public.duty_slots ds
    join public.slot_locations sl on sl.duty_slot_id = ds.id
    join public.locations l on l.id = sl.location_id
    where ds.day_of_week = p_day
    order by ds.duty_type, l.name;
end;
$$;
grant execute on function public.schedule_day_locations(public.day_of_week) to authenticated;

-- All bookings for a given day, with staff info and current location_id (nullable).
create or replace function public.schedule_day_bookings(p_day public.day_of_week)
returns table (
  booking_id uuid,
  duty_slot_id uuid,
  duty_type public.duty_type,
  staff_id uuid,
  staff_name text,
  emp_no text,
  location_id uuid
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  return query
    select b.id, ds.id, ds.duty_type, s.id, s.name, s.emp_no, b.location_id
    from public.bookings b
    join public.duty_slots ds on ds.id = b.duty_slot_id
    join public.staff s on s.id = b.staff_id
    where ds.day_of_week = p_day
    order by s.name;
end;
$$;
grant execute on function public.schedule_day_bookings(public.day_of_week) to authenticated;

-- Update the today RPCs to return location.name from join (the structured field).
drop function if exists public.todays_duties();
create or replace function public.todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  location_name text,
  staff_id uuid,
  emp_no text,
  staff_name text,
  self_marked_at timestamptz,
  self_marked_by_staff_id uuid,
  monitor_marked_at timestamptz,
  monitor_marked_by_staff_id uuid,
  monitor_name text
) language sql stable security definer set search_path = public as $$
  select
    b.id, ds.id, ds.duty_type, ds.day_of_week, l.name,
    st.id, st.emp_no, st.name,
    ar.self_marked_at, ar.self_marked_by_staff_id,
    ar.monitor_marked_at, ar.monitor_marked_by_staff_id, m.name
  from public.bookings b
  join public.duty_slots ds on ds.id = b.duty_slot_id
  join public.staff st on st.id = b.staff_id
  left join public.locations l on l.id = b.location_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  left join public.staff m on m.id = ar.monitor_marked_by_staff_id
  where ds.day_of_week::text = to_char(current_date, 'Dy')
    and (select schedule_published from public.app_settings where id = 1)
  order by ds.duty_type, st.name;
$$;
grant execute on function public.todays_duties() to authenticated;

drop function if exists public.my_todays_duties();
create or replace function public.my_todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  location_name text,
  self_marked_at timestamptz,
  monitor_marked_at timestamptz,
  monitor_name text
) language sql stable security definer set search_path = public as $$
  select
    b.id, ds.id, ds.duty_type, ds.day_of_week, l.name,
    ar.self_marked_at, ar.monitor_marked_at, m.name
  from public.bookings b
  join public.duty_slots ds on ds.id = b.duty_slot_id
  left join public.locations l on l.id = b.location_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  left join public.staff m on m.id = ar.monitor_marked_by_staff_id
  where b.staff_id = public.current_staff_id()
    and ds.day_of_week::text = to_char(current_date, 'Dy')
    and (select schedule_published from public.app_settings where id = 1);
$$;
grant execute on function public.my_todays_duties() to authenticated;

-- The old admin_schedule() is replaced by schedule_day_* above; drop it.
drop function if exists public.admin_schedule();
