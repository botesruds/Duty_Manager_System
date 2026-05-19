-- Enable realtime on attendance_records so monitor ticks sync across devices.
alter publication supabase_realtime add table public.attendance_records;
