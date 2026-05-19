import { supabase, empNoToEmail, DEFAULT_PASSWORD } from './supabase'

export async function signInWithEmpNo(empNo: string, password: string) {
  if (!/^[0-9]+$/.test(empNo)) {
    return { error: { message: 'Emp No must contain only digits.' } }
  }
  return supabase.auth.signInWithPassword({
    email: empNoToEmail(empNo),
    password,
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function changePassword(newPassword: string, staffId: string | null) {
  if (newPassword.length < 8) {
    return { error: { message: 'Password must be at least 8 characters.' } }
  }
  if (newPassword === DEFAULT_PASSWORD) {
    return { error: { message: 'Pick a password different from the default.' } }
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error }
  if (staffId) {
    // Goes through a SECURITY DEFINER RPC because teachers don't have RLS write access on staff.
    const { error: flagErr } = await supabase.rpc('complete_password_change')
    if (flagErr) return { error: flagErr }
  }
  return { error: null }
}
