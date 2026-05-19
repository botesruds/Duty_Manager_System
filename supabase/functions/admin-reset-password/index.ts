// POST { staff_id: uuid }
// Admin only. Resets the linked auth user's password to Duties2026! and flips
// must_change_password back to true so the teacher is forced to change it on next login.

import {
  CORS_HEADERS,
  HttpError,
  handleError,
  jsonResponse,
  requireAdmin,
} from '../_shared/admin.ts'

const DEFAULT_PASSWORD = 'Duties2026!'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  try {
    const { svc } = await requireAdmin(req)
    const { staff_id } = (await req.json().catch(() => ({}))) as { staff_id?: string }
    if (!staff_id) throw new HttpError(400, 'staff_id required')

    const { data: profile, error: profErr } = await svc
      .from('profiles')
      .select('id')
      .eq('staff_id', staff_id)
      .maybeSingle()
    if (profErr) throw new HttpError(500, profErr.message)
    if (!profile?.id) throw new HttpError(404, 'No account linked to that staff record')

    const { error: pwErr } = await svc.auth.admin.updateUserById(profile.id, {
      password: DEFAULT_PASSWORD,
    })
    if (pwErr) throw new HttpError(500, pwErr.message)

    const { error: flagErr } = await svc
      .from('staff')
      .update({ must_change_password: true })
      .eq('id', staff_id)
    if (flagErr) throw new HttpError(500, flagErr.message)

    return jsonResponse({ ok: true })
  } catch (e) {
    return handleError(e)
  }
})
