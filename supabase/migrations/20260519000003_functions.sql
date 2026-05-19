-- Business-logic RPCs. SECURITY DEFINER so they can enforce rules atomically
-- without needing broad RLS grants on the underlying tables.

-- Effective quota for a staff member: per-person override, else department default, else 0.
create or replace function public.effective_quota(p_staff_id uuid, p_duty_type public.duty_type)
returns int language sql stable security definer set search_path = public as $$
  select case p_duty_type
    when 'break' then coalesce(s.duty_quota_break, d.duty_quota_break, 0)
    when 'lunch' then coalesce(s.duty_quota_lunch, d.duty_quota_lunch, 0)
  end
  from public.staff s
  left join public.departments d on d.id = s.department_id
  where s.id = p_staff_id;
$$;
grant execute on function public.effective_quota(uuid, public.duty_type) to authenticated;

-- Slot list for teachers: includes capacity, spots taken, and whether the caller has booked it.
-- Crucially does NOT return zone or location.
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
    s.id, s.duty_type, s.day_of_week, s.capacity,
    (select count(*)::int from public.bookings b where b.duty_slot_id = s.id) as spots_taken,
    exists (
      select 1 from public.bookings b
      where b.duty_slot_id = s.id and b.staff_id = public.current_staff_id()
    ) as already_booked
  from public.duty_slots s
  order by s.day_of_week, s.duty_type;
$$;
grant execute on function public.get_browsable_slots() to authenticated;

-- Book a slot for the calling staff member. Enforces:
--   - booking window open
--   - slot not full
--   - caller has not exceeded quota for that duty type
-- Admins can bypass via direct insert (permitted by RLS).
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

  select booking_window_open into v_open from public.app_settings where id = 1;
  if not v_open then
    raise exception 'Booking window is closed.' using errcode = 'P0001';
  end if;

  -- Lock the slot row to serialize capacity checks.
  select duty_type, capacity into v_duty_type, v_capacity
  from public.duty_slots where id = p_slot_id for update;
  if v_duty_type is null then
    raise exception 'Slot not found.' using errcode = 'P0001';
  end if;

  select count(*)::int into v_taken from public.bookings where duty_slot_id = p_slot_id;
  if v_taken >= v_capacity then
    raise exception 'Slot is full.' using errcode = 'P0001';
  end if;

  v_quota := public.effective_quota(v_staff_id, v_duty_type);
  select count(*)::int into v_used
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  where b.staff_id = v_staff_id and s.duty_type = v_duty_type;
  if v_used >= v_quota then
    raise exception 'You have already booked your % duty quota (%).', v_duty_type, v_quota
      using errcode = 'P0001';
  end if;

  insert into public.bookings (staff_id, duty_slot_id) values (v_staff_id, p_slot_id)
    returning id into v_booking_id;
  return v_booking_id;
end;
$$;
grant execute on function public.book_slot(uuid) to authenticated;

-- Cancel one of the caller's own bookings. Blocked when the window is closed.
create or replace function public.cancel_booking(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_staff_id uuid := public.current_staff_id();
  v_owner uuid;
  v_open boolean;
begin
  select staff_id into v_owner from public.bookings where id = p_booking_id;
  if v_owner is null then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;
  if v_owner <> v_staff_id then
    raise exception 'You can only cancel your own bookings.' using errcode = 'P0001';
  end if;

  select booking_window_open into v_open from public.app_settings where id = 1;
  if not v_open then
    raise exception 'Booking window is closed.' using errcode = 'P0001';
  end if;

  delete from public.bookings where id = p_booking_id;
end;
$$;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- Mark attendance. p_by_monitor=true allows any authenticated staff member to mark someone present;
-- p_by_monitor=false requires the caller to be the booking owner.
-- Upserts on (booking_id, date) so re-taps just refresh marked_at/marked_by.
create or replace function public.mark_attendance(p_booking_id uuid, p_by_monitor boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller_staff uuid := public.current_staff_id();
  v_owner uuid;
  v_id uuid;
begin
  if v_caller_staff is null then
    raise exception 'No staff record linked to this account.' using errcode = 'P0001';
  end if;

  select staff_id into v_owner from public.bookings where id = p_booking_id;
  if v_owner is null then
    raise exception 'Booking not found.' using errcode = 'P0001';
  end if;

  if not p_by_monitor and v_owner <> v_caller_staff then
    raise exception 'You can only self-report your own attendance.' using errcode = 'P0001';
  end if;

  insert into public.attendance_records
    (booking_id, date, marked_present, marked_at, marked_by_staff_id, marked_by_monitor)
  values
    (p_booking_id, current_date, true, now(), v_caller_staff, p_by_monitor)
  on conflict (booking_id, date) do update
    set marked_present = true,
        marked_at = now(),
        marked_by_staff_id = excluded.marked_by_staff_id,
        marked_by_monitor = excluded.marked_by_monitor
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.mark_attendance(uuid, boolean) to authenticated;

-- Today's duty list for the Monitor view. Includes location/zone since monitors are physically
-- walking the building.
create or replace function public.todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  zone text,
  location text,
  staff_id uuid,
  emp_no text,
  staff_name text,
  marked_present boolean,
  marked_by_monitor boolean,
  marked_by_staff_id uuid,
  marked_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week, s.zone, s.location,
    st.id, st.emp_no, st.name,
    ar.marked_present, ar.marked_by_monitor, ar.marked_by_staff_id, ar.marked_at
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  join public.staff st on st.id = b.staff_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  where s.day_of_week::text = to_char(current_date, 'Dy')
  order by s.zone, s.location, st.name;
$$;
grant execute on function public.todays_duties() to authenticated;

-- The caller's own duties for today (self-report screen).
create or replace function public.my_todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  marked_present boolean,
  marked_by_monitor boolean,
  marked_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week,
    ar.marked_present, ar.marked_by_monitor, ar.marked_at
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  where b.staff_id = public.current_staff_id()
    and s.day_of_week::text = to_char(current_date, 'Dy');
$$;
grant execute on function public.my_todays_duties() to authenticated;
