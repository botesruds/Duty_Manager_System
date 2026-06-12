import { type FormEvent, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import {
  adminResetPassword,
  deleteStaff,
  previewUploadStaff,
  uploadStaff,
  type UploadPreview,
  type UploadResult,
  type UploadStaffRow,
} from '../../lib/edgeFunctions'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '../../components/ui'

interface Dept {
  id: string
  name: string
}

interface StaffRow {
  id: string
  emp_no: string
  name: string
  must_change_password: boolean
  duty_quota_break: number | null
  duty_quota_lunch: number | null
  departments: { name: string } | null
  profile: { id: string; is_admin: boolean; is_monitor: boolean } | null
  active_bookings: number
}

export default function AdminStaff() {
  const [rows, setRows] = useState<StaffRow[]>([])
  const [departments, setDepartments] = useState<Dept[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [pending, setPending] = useState<{ rows: UploadStaffRow[]; preview: UploadPreview } | null>(
    null,
  )
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const [staffRes, profilesRes, bookingsRes, deptRes] = await Promise.all([
      supabase
        .from('staff')
        .select('id, emp_no, name, must_change_password, duty_quota_break, duty_quota_lunch, departments(name)')
        .order('emp_no'),
      supabase.from('profiles').select('id, staff_id, is_admin, is_monitor'),
      supabase.from('bookings').select('staff_id'),
      supabase.from('departments').select('id, name').order('name'),
    ])
    setDepartments((deptRes.data ?? []) as Dept[])
    if (staffRes.error) {
      setErr(staffRes.error.message)
      return
    }
    const profileByStaff = new Map<string, { id: string; is_admin: boolean; is_monitor: boolean }>()
    for (const p of profilesRes.data ?? []) {
      if (p.staff_id) profileByStaff.set(p.staff_id, { id: p.id, is_admin: p.is_admin, is_monitor: p.is_monitor })
    }
    const bookingsByStaff = new Map<string, number>()
    for (const b of bookingsRes.data ?? []) {
      bookingsByStaff.set(b.staff_id, (bookingsByStaff.get(b.staff_id) ?? 0) + 1)
    }
    setRows(
      ((staffRes.data ?? []) as unknown as StaffRow[]).map((r) => ({
        ...r,
        profile: profileByStaff.get(r.id) ?? null,
        active_bookings: bookingsByStaff.get(r.id) ?? 0,
      })),
    )
  }

  useEffect(() => {
    void load()
  }, [])

  // Standard WSO staff sheet headers → the fields this platform uses.
  // Extra columns (subject, performance manager, …) fall through untouched
  // and are ignored by the upload function.
  const HEADER_ALIASES: Record<string, string> = {
    emp_no: 'emp_no',
    empno: 'emp_no',
    employment_number: 'emp_no',
    employee_number: 'emp_no',
    staff_number: 'emp_no',
    name: 'name',
    full_name: 'name',
    teacher: 'name',
    teacher_name: 'name',
    staff_name: 'name',
    department: 'department',
    dept: 'department',
    year_group: 'year_group',
    yeargroup: 'year_group',
    year: 'year_group',
    duty_quota_break: 'duty_quota_break',
    break_quota: 'duty_quota_break',
    duty_quota_lunch: 'duty_quota_lunch',
    lunch_quota: 'duty_quota_lunch',
  }

  const onFile = (file: File) => {
    setErr(null)
    setResult(null)
    setPending(null)
    Papa.parse<UploadStaffRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => {
        const key = h.trim().toLowerCase().replace(/[\s-]+/g, '_')
        return HEADER_ALIASES[key] ?? key
      },
      complete: async (parsed) => {
        if (parsed.errors.length) {
          setErr('CSV parse error: ' + parsed.errors[0].message)
          return
        }
        setUploading(true)
        try {
          // Dry run first so the admin can review what will happen before it does.
          const preview = await previewUploadStaff(parsed.data)
          setPending({ rows: parsed.data, preview })
        } catch (e) {
          setErr(e instanceof Error ? e.message : 'Upload failed')
        } finally {
          setUploading(false)
          if (fileRef.current) fileRef.current.value = ''
        }
      },
    })
  }

  const applyUpload = async () => {
    if (!pending) return
    setUploading(true)
    setErr(null)
    try {
      const res = await uploadStaff(pending.rows)
      setResult(res)
      setPending(null)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onReset = async (staff_id: string) => {
    if (!confirm('Reset this teacher’s password back to the default?')) return
    setResetting(staff_id)
    try {
      await adminResetPassword(staff_id)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(null)
    }
  }

  const onDeleteRow = async (row: StaffRow) => {
    const bookingMsg =
      row.active_bookings > 0
        ? `\n\nThey have ${row.active_bookings} booking${row.active_bookings === 1 ? '' : 's'} which will also be deleted.`
        : ''
    if (
      !confirm(
        `Delete ${row.name} (${row.emp_no})?\n\nThis removes their account, their login, and all related records (bookings, attendance, swaps).${bookingMsg}\n\nThis cannot be undone.`,
      )
    )
      return
    setErr(null)
    setInfo(null)
    setDeleting(row.id)
    try {
      await deleteStaff(row.id)
      setInfo(`Removed ${row.name}.`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const onToggleMonitor = async (row: StaffRow) => {
    if (!row.profile) {
      alert('This staff member has no linked account yet.')
      return
    }
    const next = !row.profile.is_monitor
    if (next && row.active_bookings > 0) {
      if (
        !confirm(
          `${row.name} has ${row.active_bookings} existing booking(s). Monitors don't book new duties, but their existing bookings will be kept. Continue?`,
        )
      )
        return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ is_monitor: next })
      .eq('id', row.profile.id)
    if (error) alert(error.message)
    else await load()
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Add or upload staff, promote teachers to monitors, and remove people who've left."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload CSV'}
            </Button>
            <Button onClick={() => setAddOpen(true)}>Add staff</Button>
          </>
        }
      />

      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            <strong className="mr-1">{rows.filter((r) => r.profile?.is_admin).length}</strong> admin
          </span>
          <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-1 text-brand-800">
            <strong className="mr-1">{rows.filter((r) => r.profile?.is_monitor).length}</strong> monitor{rows.filter((r) => r.profile?.is_monitor).length === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            <strong className="mr-1">{rows.filter((r) => r.profile && !r.profile.is_admin && !r.profile.is_monitor).length}</strong> teachers
          </span>
        </div>
      )}

      <Card className="mb-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Standard WSO staff sheet</p>
        <code className="mt-1 block text-xs">
          Employment number, Name, Department, Year group, Subject, Performance manager,
          Duty quota break, Duty quota lunch
        </code>
        <p className="mt-1 text-xs text-slate-500">
          Save the shared staff sheet as CSV and upload it — this platform reads the employment
          number, name, and duty group (department if set, otherwise year group) and ignores the
          rest. Quotas are optional per row — blank inherits from the group default. New staff are
          created with the default password and forced to change it on first login; re-uploads
          update existing staff by employment number.
        </p>
      </Card>

      {pending && (
        <Card className="mb-4 border-brand-300 bg-brand-50">
          <p className="text-sm font-medium text-slate-900">Review before applying</p>
          <p className="mt-1 text-sm text-slate-700">
            This file will add <strong>{pending.preview.created}</strong> new staff and update{' '}
            <strong>{pending.preview.updated}</strong> existing.
            {pending.preview.new_departments.length > 0 && (
              <>
                {' '}New department{pending.preview.new_departments.length === 1 ? '' : 's'} will be
                created: <strong>{pending.preview.new_departments.join(', ')}</strong>.
              </>
            )}
          </p>
          {pending.preview.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-rose-700">
                {pending.preview.errors.length} row{pending.preview.errors.length === 1 ? '' : 's'} will
                be skipped:
              </p>
              <ul className="mt-1 max-h-32 overflow-auto text-xs text-rose-700">
                {pending.preview.errors.map((e, i) => (
                  <li key={i}>
                    {e.emp_no || '(blank)'}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button onClick={applyUpload} disabled={uploading}>
              {uploading ? 'Applying…' : 'Apply changes'}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={uploading}>
              Discard
            </Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="mb-4">
          <p className="text-sm">
            Created: <strong>{result.created}</strong> · Updated: <strong>{result.updated}</strong> ·
            Errors: <strong>{result.errors.length}</strong>
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-rose-700">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.emp_no}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}
      {info && <Card className="mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800">{info}</Card>}

      {rows.length === 0 ? (
        <EmptyState title="No staff yet" body="Upload a CSV to get started." />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Emp No</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Break</th>
                <th className="px-4 py-2">Lunch</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-mono text-xs">{s.emp_no}</td>
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2 text-slate-600">{s.departments?.name ?? '—'}</td>
                  <td className="px-4 py-2">{s.duty_quota_break ?? <span className="text-slate-400">inherit</span>}</td>
                  <td className="px-4 py-2">{s.duty_quota_lunch ?? <span className="text-slate-400">inherit</span>}</td>
                  <td className="px-4 py-2">
                    {s.profile?.is_admin ? (
                      <Badge tone="indigo">Admin</Badge>
                    ) : (
                      <button
                        onClick={() => onToggleMonitor(s)}
                        disabled={!s.profile}
                        title={
                          s.profile?.is_monitor
                            ? 'Click to revert to teacher'
                            : 'Click to promote to monitor (they can tick off duty attendance)'
                        }
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          s.profile?.is_monitor
                            ? 'bg-brand-100 text-brand-800 hover:bg-brand-200'
                            : 'bg-slate-100 text-slate-700 hover:bg-brand-100 hover:text-brand-800'
                        }`}
                      >
                        {s.profile?.is_monitor ? '✓ Monitor' : 'Teacher'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {s.must_change_password ? <Badge tone="amber">Default pw</Badge> : <Badge tone="green">Active</Badge>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => onReset(s.id)}
                        disabled={resetting === s.id}
                      >
                        {resetting === s.id ? '…' : 'Reset password'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => onDeleteRow(s)}
                        disabled={deleting === s.id || s.profile?.is_admin}
                        title={s.profile?.is_admin ? 'Admins cannot be deleted here' : 'Delete this staff member'}
                      >
                        {deleting === s.id ? '…' : 'Delete'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {addOpen && (
        <AddStaffModal
          departments={departments}
          onClose={() => setAddOpen(false)}
          onAdded={async (message) => {
            setAddOpen(false)
            setInfo(message)
            await load()
          }}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  )
}

function AddStaffModal({
  departments,
  onClose,
  onAdded,
  onError,
}: {
  departments: Dept[]
  onClose: () => void
  onAdded: (message: string) => void
  onError: (m: string) => void
}) {
  const [empNo, setEmpNo] = useState('')
  const [name, setName] = useState('')
  const [departmentName, setDepartmentName] = useState(departments[0]?.name ?? '')
  const [breakQuota, setBreakQuota] = useState('')
  const [lunchQuota, setLunchQuota] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLocalErr(null)
    if (!/^[0-9]+$/.test(empNo)) {
      setLocalErr('Emp No must contain only digits.')
      return
    }
    if (!name.trim()) {
      setLocalErr('Name is required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await uploadStaff([
        {
          emp_no: empNo.trim(),
          name: name.trim(),
          department: departmentName,
          duty_quota_break: breakQuota === '' ? null : Number(breakQuota),
          duty_quota_lunch: lunchQuota === '' ? null : Number(lunchQuota),
        },
      ])
      if (res.errors.length > 0) {
        setLocalErr(res.errors[0].message)
        return
      }
      onAdded(
        res.created === 1
          ? `Added ${name} (${empNo}). Default password: Duties2026!`
          : `Updated existing record for ${name} (${empNo}).`,
      )
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Add failed')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Add staff member</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ×
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Creates an account with the default password <code>Duties2026!</code>. The new staff member is
          prompted to change it on first login. If the emp_no already exists, their record will be
          updated instead.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Input
            label="Emp No"
            inputMode="numeric"
            pattern="[0-9]*"
            value={empNo}
            onChange={(e) => setEmpNo(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Select
            label="Department"
            value={departmentName}
            onChange={(e) => setDepartmentName(e.target.value)}
          >
            <option value="">(none)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Break quota override"
              type="number"
              min={0}
              value={breakQuota}
              onChange={(e) => setBreakQuota(e.target.value)}
              hint="Blank inherits from department"
            />
            <Input
              label="Lunch quota override"
              type="number"
              min={0}
              value={lunchQuota}
              onChange={(e) => setLunchQuota(e.target.value)}
              hint="Blank inherits from department"
            />
          </div>
          {localErr && <p className="text-sm text-rose-600">{localErr}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add staff'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
