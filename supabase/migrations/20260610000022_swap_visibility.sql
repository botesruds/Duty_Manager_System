-- Swaps execute instantly when two teachers agree; these views make that
-- visible after the fact. Every completed swap leaves one completed request
-- row per participant (manual takes get a synthetic row), so "my completed
-- requests" = "swaps I was part of".

-- Teacher: swaps involving me in the last 7 days — what I gave, what I got, with whom.
create or replace function public.my_recent_swaps()
returns table (
  completed_at timestamptz,
  gave_day public.day_of_week,
  gave_type public.duty_type,
  got_day public.day_of_week,
  got_type public.duty_type,
  with_name text
) language sql stable security definer set search_path = public as $$
  select
    sr.completed_at,
    s_gave.day_of_week, s_gave.duty_type,
    s_got.day_of_week, s_got.duty_type,
    st.name
  from public.swap_requests sr
  join public.bookings b_gave on b_gave.id = sr.source_booking_id
  join public.duty_slots s_gave on s_gave.id = b_gave.duty_slot_id
  join public.swap_requests sr2 on sr2.id = sr.matched_with_request_id
  join public.bookings b_got on b_got.id = sr2.source_booking_id
  join public.duty_slots s_got on s_got.id = b_got.duty_slot_id
  join public.staff st on st.id = sr2.requester_staff_id
  where sr.requester_staff_id = public.current_staff_id()
    and sr.status = 'completed'
    and sr.completed_at > now() - interval '7 days'
  order by sr.completed_at desc;
$$;
grant execute on function public.my_recent_swaps() to authenticated;

-- Admin: recent completed swaps as deduplicated pairs (each swap shown once).
create or replace function public.admin_recent_swaps()
returns table (
  completed_at timestamptz,
  teacher_a text,
  a_day public.day_of_week,
  a_type public.duty_type,
  teacher_b text,
  b_day public.day_of_week,
  b_type public.duty_type
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only.' using errcode = 'P0001';
  end if;
  return query
    select
      sr.completed_at,
      st_a.name,
      s_a.day_of_week, s_a.duty_type,
      st_b.name,
      s_b.day_of_week, s_b.duty_type
    from public.swap_requests sr
    join public.swap_requests sr2 on sr2.id = sr.matched_with_request_id
    join public.staff st_a on st_a.id = sr.requester_staff_id
    join public.staff st_b on st_b.id = sr2.requester_staff_id
    join public.bookings b_a on b_a.id = sr.source_booking_id
    join public.duty_slots s_a on s_a.id = b_a.duty_slot_id
    join public.bookings b_b on b_b.id = sr2.source_booking_id
    join public.duty_slots s_b on s_b.id = b_b.duty_slot_id
    where sr.status = 'completed'
      -- Each pair has two symmetric rows; keep one.
      and sr.id < sr.matched_with_request_id
    order by sr.completed_at desc
    limit 30;
end;
$$;
grant execute on function public.admin_recent_swaps() to authenticated;
