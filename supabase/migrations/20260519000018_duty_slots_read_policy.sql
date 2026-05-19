-- duty_slots only contains day_of_week + duty_type metadata now (no zone/location).
-- Teachers already see all (day, type) combinations via get_browsable_slots(), so
-- letting them read the table directly exposes nothing new and unblocks embedded
-- joins like bookings.select('id, duty_slots(...)') on the Swap page.

create policy duty_slots_read on public.duty_slots
  for select to authenticated using (true);
