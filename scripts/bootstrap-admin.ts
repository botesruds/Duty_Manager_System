// Create the first admin account. Run once after applying migrations.
// Usage:  npx tsx scripts/bootstrap-admin.ts <emp_no>
//
// The given emp_no is used to build the constructed email and (if needed) create the auth user.
// The account is given an admin profile but no staff row — admin-only.
// Sets the password to Wso2026! and must_change_password is irrelevant for admins
// (the password-change gate only runs against staff records).

import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv() // fall back to .env

const DEFAULT_PASSWORD = 'Wso2026!'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const empNo = process.argv[2]
if (!empNo || !/^[0-9]+$/.test(empNo)) {
  console.error('Usage: npx tsx scripts/bootstrap-admin.ts <numeric-emp-no>')
  process.exit(1)
}

const svc = createClient(url, key, { auth: { persistSession: false } })
const email = `${empNo}@duty.internal`

// Reuse the auth user if it already exists (e.g. someone uploaded via CSV first).
const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
let userId = list?.users.find((u) => u.email === email)?.id
if (!userId) {
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  })
  if (error || !data?.user) {
    console.error('createUser failed:', error?.message)
    process.exit(1)
  }
  userId = data.user.id
} else {
  await svc.auth.admin.updateUserById(userId, { password: DEFAULT_PASSWORD })
}

const { error: upErr } = await svc
  .from('profiles')
  .upsert({ id: userId, staff_id: null, is_admin: true })
if (upErr) {
  console.error('profile upsert failed:', upErr.message)
  process.exit(1)
}

console.log(`Admin bootstrapped. Log in with emp_no=${empNo}, password=${DEFAULT_PASSWORD}`)
