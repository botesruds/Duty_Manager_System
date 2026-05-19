-- The 13 valid (day, duty_type) combinations are fixed by school rules:
-- Break runs Mon-Fri, Lunch A and Lunch B run Mon-Thu. Make them exist
-- automatically and add a unique constraint so duplicates can't sneak in.

-- Idempotent seed.
insert into public.duty_slots (day_of_week, duty_type, capacity)
select d.value::public.day_of_week, t.value::public.duty_type, 1
from (values ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')) as d(value)
cross join (values ('break')) as t(value)
where not exists (
  select 1 from public.duty_slots ds
  where ds.day_of_week::text = d.value and ds.duty_type::text = t.value
);

insert into public.duty_slots (day_of_week, duty_type, capacity)
select d.value::public.day_of_week, t.value::public.duty_type, 1
from (values ('Mon'), ('Tue'), ('Wed'), ('Thu')) as d(value)
cross join (values ('lunch_a'), ('lunch_b')) as t(value)
where not exists (
  select 1 from public.duty_slots ds
  where ds.day_of_week::text = d.value and ds.duty_type::text = t.value
);

-- Prevent admin duplicates from ever being created via direct SQL or the API.
alter table public.duty_slots
  add constraint duty_slots_day_type_unique unique (day_of_week, duty_type);
