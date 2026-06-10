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
  const [published, setPublished] = useState<boolean | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [{ data: settings }, staff, slots, bookings, attendance] = await Promise.all([
      supabase.from('app_settings').select('booking_window_open, schedule_published').eq('id', 1).single(),
      supabase.from('staff').select('*', { count: 'exact', head: true }),
      supabase.from('duty_slots').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true })
        .eq('date', new Date().toISOString().slice(0, 10)),
    ])
    setWindowOpen(settings?.booking_window_open ?? null)
    setPublished(settings?.schedule_published ?? null)
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
    if (
      windowOpen &&
      !confirm(
        'Close the booking window?\n\nTeachers will no longer be able to book or cancel duties until you reopen it.',
      )
    )
      return
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

      {windowOpen !== null && published !== null && (
        <WorkflowStrip windowOpen={windowOpen} published={published} />
      )}

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

// Shows where the term cycle currently stands and flags the inconsistent
// "window open while the schedule is live" state so it can't go unnoticed.
function WorkflowStrip({ windowOpen, published }: { windowOpen: boolean; published: boolean }) {
  const steps = [
    { label: '1. Teachers book', active: windowOpen && !published },
    { label: '2. Assign locations & publish', active: !windowOpen && !published },
    { label: '3. Schedule live', active: published && !windowOpen },
  ]
  const conflicted = windowOpen && published
  return (
    <Card
      className={`mb-6 ${conflicted ? 'border-amber-300 bg-amber-50' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Where you are
        </p>
        {steps.map((s) => (
          <span
            key={s.label}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              s.active
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>
      {conflicted && (
        <p className="mt-2 text-sm text-amber-900">
          The booking window is <strong>open</strong> while the schedule is <strong>published</strong> —
          teachers can change bookings on a live schedule. Usually you'd close the window before
          publishing, or unpublish before reopening it.
        </p>
      )}
    </Card>
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
