-- Row-level security policies.
-- Teachers: own bookings + attendance only. Admins: everything.
-- Slot zone/location is hidden from teachers via SECURITY DEFINER functions in 003_functions.sql,
-- so duty_slots has no SELECT grant for non-admins here.

alter table public.profiles enable row level security;
alter table public.staff enable row level security;
alter table public.departments enable row level security;
alter table public.duty_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.attendance_records enable row level security;
alter table public.app_settings enable row level security;

-- Helper: is the calling user an admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
grant execute on function public.is_admin() to authenticated;

-- Helper: caller's staff_id (null for admin-only accounts).
create or replace function public.current_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select staff_id from public.profiles where id = auth.uid();
$$;
grant execute on function public.current_staff_id() to authenticated;

-- profiles: read own or admin reads all; only admin writes.
create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- departments: any authenticated can read; admin writes.
create policy departments_read on public.departments for select to authenticated using (true);
create policy departments_admin_write on public.departments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- staff: any authenticated can read (monitors need names); admin writes.
create policy staff_read on public.staff for select to authenticated using (true);
create policy staff_admin_write on public.staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- duty_slots: admin reads + writes directly. Teachers go through get_browsable_slots()
-- so they never see zone/location.
create policy duty_slots_admin_all on public.duty_slots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- bookings: read own or admin reads all. No direct insert/delete — go through
-- book_slot()/cancel_booking() so quota/capacity/window are enforced atomically.
-- Admin can insert/update/delete directly for manual override.
create policy bookings_read_own on public.bookings for select to authenticated
  using (staff_id = public.current_staff_id() or public.is_admin());
create policy bookings_admin_write on public.bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- attendance_records: read own or admin reads all. No direct write —
-- mark_attendance() handles both self and monitor with auth checks.
create policy attendance_read_own on public.attendance_records for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = attendance_records.booking_id
        and b.staff_id = public.current_staff_id()
    )
  );
create policy attendance_admin_write on public.attendance_records for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- app_settings: any authenticated reads (clients need to know window state); admin writes.
create policy app_settings_read on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
