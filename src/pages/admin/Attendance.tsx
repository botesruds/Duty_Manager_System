import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '../../components/ui'
import { DUTY_TYPE_LABEL, type DutyType } from '../../lib/database.types'

interface AttRow {
  id: string
  date: string
  self_marked_at: string | null
  monitor_marked_at: string | null
  bookings: {
    staff: { emp_no: string; name: string }
    duty_slots: { duty_type: DutyType; day_of_week: string }
  }
  self_marker: { emp_no: string; name: string } | null
  monitor_marker: { emp_no: string; name: string } | null
}

interface StaffOption {
  id: string
  emp_no: string
  name: string
}

const SELECT_COLUMNS = `
  id, date, self_marked_at, monitor_marked_at,
  bookings!inner(
    staff_id,
    staff:staff_id(emp_no, name),
    duty_slots:duty_slot_id(duty_type, day_of_week)
  ),
  self_marker:self_marked_by_staff_id(emp_no, name),
  monitor_marker:monitor_marked_by_staff_id(emp_no, name)
`

export default function AdminAttendance() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [staffId, setStaffId] = useState<string>('')
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [rows, setRows] = useState<AttRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void supabase
      .from('staff')
      .select('id, emp_no, name')
      .order('name')
      .then(({ data }) => setStaffList((data ?? []) as StaffOption[]))
  }, [])

  const load = async () => {
    setLoading(true)
    // Pick a teacher to see their full history across all dates;
    // otherwise show everyone for the chosen date.
    let q = supabase.from('attendance_records').select(SELECT_COLUMNS)
    if (staffId) q = q.eq('bookings.staff_id', staffId).order('date', { ascending: false })
    else q = q.eq('date', date)
    const { data } = await q
    setRows((data ?? []) as unknown as AttRow[])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [date, staffId])

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`
    const lines = [
      ['Date', 'Employee no', 'Name', 'Duty', 'Day', 'Self check', 'Monitor confirm', 'Confirmed by'].join(','),
      ...rows.map((r) =>
        [
          r.date,
          r.bookings.staff.emp_no,
          esc(r.bookings.staff.name),
          DUTY_TYPE_LABEL[r.bookings.duty_slots.duty_type],
          r.bookings.duty_slots.day_of_week,
          r.self_marked_at ? new Date(r.self_marked_at).toLocaleTimeString() : '',
          r.monitor_marked_at ? new Date(r.monitor_marked_at).toLocaleTimeString() : '',
          r.monitor_marker ? esc(`${r.monitor_marker.name} (${r.monitor_marker.emp_no})`) : '',
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const who = staffId ? staffList.find((s) => s.id === staffId)?.emp_no ?? 'staff' : date
    a.download = `attendance-${who}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <PageHeader
        title="Attendance report"
        subtitle="Self and monitor confirmations for each duty."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Teacher"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="max-w-xs"
          >
            <option value="">All staff (single day)</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.emp_no})
              </option>
            ))}
          </Select>
          {!staffId && (
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-xs"
            />
          )}
          {staffId && (
            <p className="pb-2 text-xs text-slate-500">
              Showing this teacher's full history, most recent first.
            </p>
          )}
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={staffId ? 'No attendance records for this teacher' : 'No attendance records for that date'}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {staffId && <th className="px-4 py-2">Date</th>}
                <th className="px-4 py-2">Staff</th>
                <th className="px-4 py-2">Duty</th>
                <th className="px-4 py-2">Self check</th>
                <th className="px-4 py-2">Monitor confirm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  {staffId && <td className="px-4 py-2 text-slate-700">{r.date}</td>}
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.bookings.staff.name}</div>
                    <div className="font-mono text-xs text-slate-500">{r.bookings.staff.emp_no}</div>
                  </td>
                  <td className="px-4 py-2">
                    {DUTY_TYPE_LABEL[r.bookings.duty_slots.duty_type]} · {r.bookings.duty_slots.day_of_week}
                  </td>
                  <td className="px-4 py-2">
                    {r.self_marked_at ? (
                      <div className="flex flex-col">
                        <Badge tone="green">✓</Badge>
                        <span className="mt-0.5 text-xs text-slate-500">
                          {new Date(r.self_marked_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ) : (
                      <Badge tone="slate">—</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {r.monitor_marked_at ? (
                      <div className="flex flex-col">
                        <Badge tone="indigo">✓</Badge>
                        <span className="mt-0.5 text-xs text-slate-500">
                          {r.monitor_marker ? `${r.monitor_marker.name} (${r.monitor_marker.emp_no})` : '—'}
                          {' · '}
                          {new Date(r.monitor_marked_at).toLocaleTimeString()}
                        </span>
                      </div>
                    ) : (
                      <Badge tone="slate">—</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
