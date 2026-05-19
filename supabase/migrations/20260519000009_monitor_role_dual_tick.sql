-- 1) Add the monitor role on profiles.
-- 2) Track teacher self-tick and monitor confirmation as two independent fields
--    on attendance_records so both can be recorded for the same booking/date.

alter table public.profiles add column if not exists is_monitor boolean not null default false;

create or replace function public.is_monitor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_monitor from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_monitor() to authenticated;

-- Attendance: dual-tick columns.
alter table public.attendance_records add column if not exists self_marked_at timestamptz;
alter table public.attendance_records add column if not exists self_marked_by_staff_id uuid references public.staff(id);
alter table public.attendance_records add column if not exists monitor_marked_at timestamptz;
alter table public.attendance_records add column if not exists monitor_marked_by_staff_id uuid references public.staff(id);

-- Backfill from old columns if they still exist (this migration is idempotent).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'attendance_records'
               and column_name = 'marked_by_monitor') then
    update public.attendance_records
    set monitor_marked_at = marked_at,
        monitor_marked_by_staff_id = marked_by_staff_id
    where marked_present and marked_by_monitor and monitor_marked_at is null;

    update public.attendance_records
    set self_marked_at = marked_at,
        self_marked_by_staff_id = marked_by_staff_id
    where marked_present and not marked_by_monitor and self_marked_at is null;
  end if;
end$$;

alter table public.attendance_records drop column if exists marked_present;
alter table public.attendance_records drop column if exists marked_at;
alter table public.attendance_records drop column if exists marked_by_staff_id;
alter table public.attendance_records drop column if exists marked_by_monitor;

-- mark_attendance: separate self vs monitor; only monitors+admins can monitor-tick.
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

  if p_by_monitor then
    if not (public.is_monitor() or public.is_admin()) then
      raise exception 'Only monitors can confirm attendance for others.' using errcode = 'P0001';
    end if;
  else
    if v_owner <> v_caller_staff then
      raise exception 'You can only self-report your own attendance.' using errcode = 'P0001';
    end if;
  end if;

  -- Upsert so both signals can coexist on one row.
  insert into public.attendance_records (booking_id, date) values (p_booking_id, current_date)
  on conflict (booking_id, date) do nothing;

  if p_by_monitor then
    update public.attendance_records
    set monitor_marked_at = now(),
        monitor_marked_by_staff_id = v_caller_staff
    where booking_id = p_booking_id and date = current_date
    returning id into v_id;
  else
    update public.attendance_records
    set self_marked_at = now(),
        self_marked_by_staff_id = v_caller_staff
    where booking_id = p_booking_id and date = current_date
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
grant execute on function public.mark_attendance(uuid, boolean) to authenticated;

-- Monitors don't book duties.
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

-- todays_duties / my_todays_duties: return both tick signals.
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
  self_marked_at timestamptz,
  self_marked_by_staff_id uuid,
  monitor_marked_at timestamptz,
  monitor_marked_by_staff_id uuid,
  monitor_name text
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week, b.assigned_location,
    st.id, st.emp_no, st.name,
    ar.self_marked_at, ar.self_marked_by_staff_id,
    ar.monitor_marked_at, ar.monitor_marked_by_staff_id, m.name
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  join public.staff st on st.id = b.staff_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  left join public.staff m on m.id = ar.monitor_marked_by_staff_id
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
  self_marked_at timestamptz,
  monitor_marked_at timestamptz,
  monitor_name text
) language sql stable security definer set search_path = public as $$
  select
    b.id, s.id, s.duty_type, s.day_of_week, b.assigned_location,
    ar.self_marked_at, ar.monitor_marked_at, m.name
  from public.bookings b
  join public.duty_slots s on s.id = b.duty_slot_id
  left join public.attendance_records ar on ar.booking_id = b.id and ar.date = current_date
  left join public.staff m on m.id = ar.monitor_marked_by_staff_id
  where b.staff_id = public.current_staff_id()
    and s.day_of_week::text = to_char(current_date, 'Dy')
    and (select schedule_published from public.app_settings where id = 1);
$$;
grant execute on function public.my_todays_duties() to authenticated;
