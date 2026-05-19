-- Duty Manager: initial schema.
-- Run via Supabase CLI (`supabase db push`) or paste into the SQL Editor.

create extension if not exists "pgcrypto";

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  duty_quota_break int not null default 0 check (duty_quota_break >= 0),
  duty_quota_lunch int not null default 0 check (duty_quota_lunch >= 0)
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  emp_no text not null unique check (emp_no ~ '^[0-9]+$'),
  name text not null,
  department_id uuid references public.departments(id) on delete set null,
  duty_quota_break int check (duty_quota_break is null or duty_quota_break >= 0),
  duty_quota_lunch int check (duty_quota_lunch is null or duty_quota_lunch >= 0),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);
create index staff_department_idx on public.staff(department_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  staff_id uuid unique references public.staff(id) on delete set null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_staff_idx on public.profiles(staff_id);

create type public.duty_type as enum ('break', 'lunch');
create type public.day_of_week as enum ('Mon', 'Tue', 'Wed', 'Thu', 'Fri');

create table public.duty_slots (
  id uuid primary key default gen_random_uuid(),
  duty_type public.duty_type not null,
  day_of_week public.day_of_week not null,
  zone text not null,
  location text not null,
  capacity int not null check (capacity > 0),
  created_at timestamptz not null default now(),
  -- Lunch duties only Mon-Thu.
  constraint lunch_not_friday check (duty_type <> 'lunch' or day_of_week <> 'Fri')
);
create index duty_slots_day_type_idx on public.duty_slots(day_of_week, duty_type);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  duty_slot_id uuid not null references public.duty_slots(id) on delete cascade,
  booked_at timestamptz not null default now(),
  unique (staff_id, duty_slot_id)
);
create index bookings_staff_idx on public.bookings(staff_id);
create index bookings_slot_idx on public.bookings(duty_slot_id);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  date date not null default current_date,
  marked_present boolean not null default true,
  marked_at timestamptz not null default now(),
  marked_by_staff_id uuid not null references public.staff(id),
  marked_by_monitor boolean not null,
  unique (booking_id, date)
);
create index attendance_date_idx on public.attendance_records(date);

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  booking_window_open boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id, booking_window_open) values (1, true);
