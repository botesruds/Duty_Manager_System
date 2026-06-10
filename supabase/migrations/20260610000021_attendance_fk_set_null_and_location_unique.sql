-- 1) Deleting a staff member used to fail if they had ever self-marked or
--    monitor-confirmed attendance (FK with no delete rule). Keep the attendance
--    record but drop the author link instead.
alter table public.attendance_records
  drop constraint attendance_records_self_marked_by_staff_id_fkey,
  add constraint attendance_records_self_marked_by_staff_id_fkey
    foreign key (self_marked_by_staff_id) references public.staff(id) on delete set null;

alter table public.attendance_records
  drop constraint attendance_records_monitor_marked_by_staff_id_fkey,
  add constraint attendance_records_monitor_marked_by_staff_id_fkey
    foreign key (monitor_marked_by_staff_id) references public.staff(id) on delete set null;

-- 2) One person per location per slot, enforced at the database level so even
--    simultaneous admin assignments can't double-book a location.
create unique index if not exists bookings_slot_location_unique
  on public.bookings(duty_slot_id, location_id)
  where location_id is not null;
