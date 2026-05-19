-- Migrate existing 'lunch' rows to 'lunch_a', expand quota logic to share between
-- lunch_a + lunch_b, add per-booking location assignment and schedule publish flag,
-- and create admin_schedule() RPC.

update public.duty_slots set duty_type = 'lunch_a' where duty_type = 'lunch';

alter table public.duty_slots drop constraint if exists lunch_not_friday;
alter table public.duty_slots add constraint lunch_not_friday
  check (duty_type = 'break' or day_of_week <> 'Fri');

-- Helper: collapse duty_type → quota category ('break' or 'lunch').
create or replace function public.duty_category(t public.duty_type)
returns text language sql immutable as $$
  select case when t = 'break' then 'break' else 'lunch' end;
$$;
grant execute on function public.duty_category(public.duty_type) to authenticated;

-- effective_quota: lunch_a + lunch_b share the lunch quota.
create or replace function public.effective_quota(p_staff_id uuid, p_duty_type public.duty_type)
returns int language sql stable security definer set search_path = public as $$
  select case public.duty_category(p_duty_type)
    when 'break' then coalesce(s.duty_quota_break, d.duty_quota_break, 0)
    when 'lunch' then coalesce(s.duty_quota_lunch, d.duty_quota_lunch, 0)
  end
  from public.staff s
  left join public.departments d on d.id = s.department_id
  where s.id = p_staff_id;
$$;

-- book_slot: quota check counts lunch_a + lunch_b together via duty_category.
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

-- Per-booking location assignment.
alter table public.bookings add column if not exists assigned_location text;

-- Schedule publish flag.
alter table public.app_settings add column if not exists schedule_published boolean not null default false;

-- Update today RPCs to expose assigned_location and respect the flag.
drop function if exists public.todays_duties();
create or replace function public.todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  assigned_location text,
  staff_id uuid,
  emp_no text,
  staff_name text,
  marked_present boolean,
  marked_by_monitor boolean,
  marked_by_staff_id uuid,
  marked_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week, b.assigned_location,
    st.id, st.emp_no, st.name,
    ar.marked_present, ar.marked_by_monitor, ar.marked_by_staff_id, ar.marked_at
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  join public.staff st on st.id = b.staff_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  where s.day_of_week::text = to_char(current_date, 'Dy')
    and (select schedule_published from public.app_settings where id = 1)
  order by s.duty_type, st.name;
$$;
grant execute on function public.todays_duties() to authenticated;

drop function if exists public.my_todays_duties();
create or replace function public.my_todays_duties()
returns table (
  booking_id uuid,
  slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  assigned_location text,
  marked_present boolean,
  marked_by_monitor boolean,
  marked_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week, b.assigned_location,
    ar.marked_present, ar.marked_by_monitor, ar.marked_at
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  where b.staff_id = public.current_staff_id()
    and s.day_of_week::text = to_char(current_date, 'Dy')
    and (select schedule_published from public.app_settings where id = 1);
$$;
grant execute on function public.my_todays_duties() to authenticated;

-- Admin: list every booking with the slot info + staff + currently assigned location.
create or replace function public.admin_schedule()
returns table (
  booking_id uuid,
  duty_slot_id uuid,
  duty_type public.duty_type,
  day_of_week public.day_of_week,
  staff_id uuid,
  emp_no text,
  staff_name text,
  assigned_location text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  return query
    select
      b.id, s.id, s.duty_type, s.day_of_week,
      st.id, st.emp_no, st.name,
      b.assigned_location
    from public.bookings b
    join public.duty_slots s on s.id = b.duty_slot_id
    join public.staff st on st.id = b.staff_id
    order by s.day_of_week, s.duty_type, st.name;
end;
$$;
grant execute on function public.admin_schedule() to authenticated;
