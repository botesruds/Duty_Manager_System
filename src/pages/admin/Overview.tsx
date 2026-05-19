import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Card, PageHeader } from '../../components/ui'

interface Counts {
  staff: number
  slots: number
  bookings: number
  attendanceToday: number
}

export default function AdminOverview() {
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [{ data: settings }, staff, slots, bookings, attendance] = await Promise.all([
      supabase.from('app_settings').select('booking_window_open').eq('id', 1).single(),
      supabase.from('staff').select('*', { count: 'exact', head: true }),
      supabase.from('duty_slots').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('date', new Date().toISOString().slice(0, 10)),
    ])
    setWindowOpen(settings?.booking_window_open ?? null)
    setCounts({
      staff: staff.count ?? 0,
      slots: slots.count ?? 0,
      bookings: bookings.count ?? 0,
      attendanceToday: attendance.count ?? 0,
    })
  }

  useEffect(() => {
    void load()
  }, [])

  const toggleWindow = async () => {
    if (windowOpen === null) return
    setSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ booking_window_open: !windowOpen, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSaving(false)
    if (!error) setWindowOpen(!windowOpen)
  }

  return (
    <div>
      <PageHeader title="Overview" subtitle="Booking window state and at-a-glance counts." />
      <Card className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Booking window</p>
          <p className="text-sm text-slate-500">
            When closed, teachers cannot make or cancel bookings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {windowOpen === null ? (
            <span className="text-sm text-slate-400">…</span>
          ) : (
            <Badge tone={windowOpen ? 'green' : 'rose'}>{windowOpen ? 'Open' : 'Closed'}</Badge>
          )}
          <Button onClick={toggleWindow} disabled={saving || windowOpen === null} variant="secondary">
            {windowOpen ? 'Close window' : 'Open window'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Staff" value={counts?.staff} />
        <Stat label="Duty slots" value={counts?.slots} />
        <Stat label="Bookings" value={counts?.bookings} />
        <Stat label="Attendance today" value={counts?.attendanceToday} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value ?? '…'}</p>
    </Card>
  )
}
