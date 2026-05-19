// POST { staff_id: uuid }
// Admin only. Deletes the staff row (cascades bookings, attendance, swap requests)
// and then deletes the linked Supabase Auth user (cascades the profile row).
// Refuses to delete a profile flagged as admin.

import {
  CORS_HEADERS,
  HttpError,
  handleError,
  jsonResponse,
  requireAdmin,
} from '../_shared/admin.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  try {
    const { svc } = await requireAdmin(req)
    const { staff_id } = (await req.json().catch(() => ({}))) as { staff_id?: string }
    if (!staff_id) throw new HttpError(400, 'staff_id required')

    const { data: profile } = await svc
      .from('profiles')
      .select('id, is_admin')
      .eq('staff_id', staff_id)
      .maybeSingle()

    if (profile?.is_admin) {
      throw new HttpError(400, 'Cannot delete an admin account from here.')
    }

    // Delete the staff row first — cascades bookings → attendance + swap_requests,
    // and sets profile.staff_id to null (the profile row stays until we kill the auth user).
    const { error: staffErr } = await svc.from('staff').delete().eq('id', staff_id)
    if (staffErr) throw new HttpError(500, `staff delete failed: ${staffErr.message}`)

    // Now remove the auth user, which cascades the profile via FK.
    if (profile?.id) {
      const { error: authErr } = await svc.auth.admin.deleteUser(profile.id)
      if (authErr) {
        // Staff row is already gone but the auth user remains. Surface a partial-success error
        // so admin knows to clean up manually via the Supabase dashboard if needed.
        throw new HttpError(
          500,
          `Staff record deleted, but auth user could not be removed: ${authErr.message}`,
        )
      }
    }

    return jsonResponse({ ok: true })
  } catch (e) {
    return handleError(e)
  }
})
