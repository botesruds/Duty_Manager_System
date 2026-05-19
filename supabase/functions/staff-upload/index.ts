// POST { rows: Array<{ emp_no, name, department, duty_quota_break?, duty_quota_lunch? }> }
// Admin only. Upserts staff by emp_no. For new staff, creates a Supabase Auth user
// (email = `${emp_no}@duty.internal`, password = Duties2026!) and a profile linking them.
// Existing staff have their fields updated but auth accounts and passwords are left alone.

import {
  CORS_HEADERS,
  HttpError,
  handleError,
  jsonResponse,
  requireAdmin,
} from '../_shared/admin.ts'

const DEFAULT_PASSWORD = 'Duties2026!'

interface CsvRow {
  emp_no: string
  name: string
  department: string
  duty_quota_break?: number | string | null
  duty_quota_lunch?: number | string | null
}

interface UploadResult {
  created: number
  updated: number
  errors: Array<{ emp_no: string; message: string }>
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  try {
    const { svc } = await requireAdmin(req)
    const body = await req.json().catch(() => null)
    const rows: CsvRow[] = body?.rows ?? []
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new HttpError(400, 'Body must include a non-empty rows array')
    }

    const result: UploadResult = { created: 0, updated: 0, errors: [] }

    // Resolve department names → ids in one query.
    const deptNames = Array.from(new Set(rows.map((r) => r.department?.trim()).filter(Boolean)))
    const { data: deptRows } = await svc
      .from('departments')
      .select('id, name')
      .in('name', deptNames)
    const deptByName = new Map<string, string>((deptRows ?? []).map((d) => [d.name, d.id]))

    // Auto-create departments that don't exist yet (with zero quotas — admin can edit later).
    const missing = deptNames.filter((n) => !deptByName.has(n))
    if (missing.length) {
      const { data: inserted, error } = await svc
        .from('departments')
        .insert(missing.map((name) => ({ name })))
        .select('id, name')
      if (error) throw new HttpError(500, `Department create failed: ${error.message}`)
      inserted?.forEach((d) => deptByName.set(d.name, d.id))
    }

    for (const row of rows) {
      const emp_no = String(row.emp_no ?? '').trim()
      const name = String(row.name ?? '').trim()
      const department = String(row.department ?? '').trim()
      if (!/^[0-9]+$/.test(emp_no)) {
        result.errors.push({ emp_no, message: 'emp_no must be numeric' })
        continue
      }
      if (!name) {
        result.errors.push({ emp_no, message: 'name is required' })
        continue
      }

      const department_id = department ? deptByName.get(department) ?? null : null
      const fields = {
        emp_no,
        name,
        department_id,
        duty_quota_break: toIntOrNull(row.duty_quota_break),
        duty_quota_lunch: toIntOrNull(row.duty_quota_lunch),
      }

      const { data: existing } = await svc
        .from('staff')
        .select('id')
        .eq('emp_no', emp_no)
        .maybeSingle()

      if (existing) {
        const { error } = await svc.from('staff').update(fields).eq('id', existing.id)
        if (error) {
          result.errors.push({ emp_no, message: error.message })
          continue
        }
        result.updated++
        continue
      }

      // New staff: create auth user, staff row, and profile.
      const email = `${emp_no}@duty.internal`
      const { data: userData, error: userErr } = await svc.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { emp_no, name },
      })
      if (userErr || !userData?.user) {
        result.errors.push({ emp_no, message: userErr?.message ?? 'auth user create failed' })
        continue
      }
      const userId = userData.user.id

      const { data: staffRow, error: staffErr } = await svc
        .from('staff')
        .insert({ ...fields, must_change_password: true })
        .select('id')
        .single()
      if (staffErr || !staffRow) {
        // Roll back the auth user so the next attempt can succeed.
        await svc.auth.admin.deleteUser(userId)
        result.errors.push({ emp_no, message: staffErr?.message ?? 'staff insert failed' })
        continue
      }

      const { error: profErr } = await svc
        .from('profiles')
        .insert({ id: userId, staff_id: staffRow.id, is_admin: false })
      if (profErr) {
        await svc.from('staff').delete().eq('id', staffRow.id)
        await svc.auth.admin.deleteUser(userId)
        result.errors.push({ emp_no, message: profErr.message })
        continue
      }
      result.created++
    }

    return jsonResponse(result)
  } catch (e) {
    return handleError(e)
  }
})
