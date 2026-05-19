-- Teachers don't have RLS write access to staff (admin-only). The first-login
-- password change needs to flip staff.must_change_password = false, so route it
-- through a SECURITY DEFINER function that only flips the flag for the calling user.

create or replace function public.complete_password_change()
returns void language sql security definer set search_path = public as $$
  update public.staff
  set must_change_password = false
  where id = public.current_staff_id();
$$;
grant execute on function public.complete_password_change() to authenticated;
