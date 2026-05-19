-- Categorize locations as indoor/outdoor (summer = indoor, cooler = outdoor)
-- and add a current_season toggle on app_settings so the Schedule page can
-- focus on the locations that apply right now.

alter table public.locations
  add column if not exists category text not null default 'outdoor'
  check (category in ('indoor', 'outdoor'));

alter table public.app_settings
  add column if not exists current_season text not null default 'outdoor'
  check (current_season in ('indoor', 'outdoor'));

-- schedule_day_locations now filters by current_season so the admin only sees
-- the in-season locations on the Schedule page.
drop function if exists public.schedule_day_locations(public.day_of_week);
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
      and l.category = (select current_season from public.app_settings where id = 1)
    order by ds.duty_type, l.name;
end;
$$;
grant execute on function public.schedule_day_locations(public.day_of_week) to authenticated;
