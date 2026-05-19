import { supabase } from './supabase'

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) throw error
  return data as T
}

export interface UploadStaffRow {
  emp_no: string
  name: string
  department: string
  duty_quota_break?: number | string | null
  duty_quota_lunch?: number | string | null
}

export interface UploadResult {
  created: number
  updated: number
  errors: Array<{ emp_no: string; message: string }>
}

export const uploadStaff = (rows: UploadStaffRow[]) =>
  invoke<UploadResult>('staff-upload', { rows: rows as unknown as Record<string, unknown>[] })

export const adminResetPassword = (staff_id: string) =>
  invoke<{ ok: true }>('admin-reset-password', { staff_id })

export const deleteStaff = (staff_id: string) =>
  invoke<{ ok: true }>('staff-delete', { staff_id })
