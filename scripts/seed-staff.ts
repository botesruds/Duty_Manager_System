// Seed the staff table + create Supabase Auth accounts from a CSV.
// Usage:  npx tsx scripts/seed-staff.ts path/to/staff.csv
//
// CSV columns (header row required):
//   emp_no,name,department,duty_quota_break,duty_quota_lunch
//
// Same behavior as the Admin Portal upload:
//   - upsert by emp_no (no deletes)
//   - new staff get a Wso2026! auth account + must_change_password=true
//   - missing departments are auto-created with zero quotas
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or the environment).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv() // fall back to .env

const DEFAULT_PASSWORD = 'Wso2026!'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example)')
  process.exit(1)
}

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: npx tsx scripts/seed-staff.ts path/to/staff.csv')
  process.exit(1)
}

interface CsvRow {
  emp_no: string
  name: string
  department: string
  duty_quota_break?: string
  duty_quota_lunch?: string
}

const csv = readFileSync(resolve(csvPath), 'utf8')
const parsed = Papa.parse<CsvRow>(csv, { header: true, skipEmptyLines: true })
if (parsed.errors.length) {
  console.error('CSV parse errors:', parsed.errors)
  process.exit(1)
}
const rows = parsed.data

const svc = createClient(url, key, { auth: { persistSession: false } })

const toIntOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

const deptNames = Array.from(new Set(rows.map((r) => r.department?.trim()).filter(Boolean)))
const { data: existingDepts } = await svc
  .from('departments')
  .select('id, name')
  .in('name', deptNames)
const deptByName = new Map<string, string>((existingDepts ?? []).map((d) => [d.name, d.id]))
const missing = deptNames.filter((n) => !deptByName.has(n))
if (missing.length) {
  const { data: inserted, error } = await svc
    .from('departments')
    .insert(missing.map((name) => ({ name })))
    .select('id, name')
  if (error) {
    console.error('Failed to create departments:', error.message)
    process.exit(1)
  }
  inserted?.forEach((d) => deptByName.set(d.name, d.id))
}

let created = 0
let updated = 0
const errors: Array<{ emp_no: string; message: string }> = []

for (const row of rows) {
  const emp_no = String(row.emp_no ?? '').trim()
  const name = String(row.name ?? '').trim()
  const department = String(row.department ?? '').trim()
  if (!/^[0-9]+$/.test(emp_no)) {
    errors.push({ emp_no, message: 'emp_no must be numeric' })
    continue
  }
  if (!name) {
    errors.push({ emp_no, message: 'name is required' })
    continue
  }
  const fields = {
    emp_no,
    name,
    department_id: department ? deptByName.get(department) ?? null : null,
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
    if (error) errors.push({ emp_no, message: error.message })
    else updated++
    continue
  }

  const email = `${emp_no}@duty.internal`
  const { data: userData, error: userErr } = await svc.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { emp_no, name },
  })
  if (userErr || !userData?.user) {
    errors.push({ emp_no, message: userErr?.message ?? 'auth user create failed' })
    continue
  }
  const userId = userData.user.id

  const { data: staffRow, error: staffErr } = await svc
    .from('staff')
    .insert({ ...fields, must_change_password: true })
    .select('id')
    .single()
  if (staffErr || !staffRow) {
    await svc.auth.admin.deleteUser(userId)
    errors.push({ emp_no, message: staffErr?.message ?? 'staff insert failed' })
    continue
  }

  const { error: profErr } = await svc
    .from('profiles')
    .insert({ id: userId, staff_id: staffRow.id, is_admin: false })
  if (profErr) {
    await svc.from('staff').delete().eq('id', staffRow.id)
    await svc.auth.admin.deleteUser(userId)
    errors.push({ emp_no, message: profErr.message })
    continue
  }
  created++
}

console.log(`Created: ${created}  Updated: ${updated}  Errors: ${errors.length}`)
if (errors.length) {
  console.log('First 20 errors:')
  errors.slice(0, 20).forEach((e) => console.log(`  ${e.emp_no}: ${e.message}`))
}
