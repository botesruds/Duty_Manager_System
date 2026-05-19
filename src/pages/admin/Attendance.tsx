import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Card, EmptyState, Input, PageHeader } from '../../components/ui'
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

export default function AdminAttendance() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<AttRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attendance_records')
      .select(`
        id, date, self_marked_at, monitor_marked_at,
        bookings!inner(
          staff:staff_id(emp_no, name),
          duty_slots:duty_slot_id(duty_type, day_of_week)
        ),
        self_marker:self_marked_by_staff_id(emp_no, name),
        monitor_marker:monitor_marked_by_staff_id(emp_no, name)
      `)
      .eq('date', date)
      .order('date', { ascending: false })
    setRows((data ?? []) as unknown as AttRow[])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [date])

  return (
    <div>
      <PageHeader title="Attendance report" subtitle="Self and monitor confirmations for each duty." />
      <Card className="mb-4">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
      </Card>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No attendance records for that date" />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Staff</th>
                <th className="px-4 py-2">Duty</th>
                <th className="px-4 py-2">Self check</th>
                <th className="px-4 py-2">Monitor confirm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
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
