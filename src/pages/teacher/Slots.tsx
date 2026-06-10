import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

interface BrowsableSlot {
  id: string
  duty_type: DutyType
  day_of_week: DayOfWeek
  capacity: number
  spots_taken: number
  already_booked: boolean
}

export default function TeacherSlots() {
  const { staff } = useAuth()
  const [slots, setSlots] = useState<BrowsableSlot[]>([])
  const [windowOpen, setWindowOpen] = useState<boolean>(true)
  const [breakQuota, setBreakQuota] = useState<number>(0)
  const [lunchQuota, setLunchQuota] = useState<number>(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = async () => {
    if (!staff) return
    const [{ data: rows }, { data: settings }, qb, ql] = await Promise.all([
      supabase.rpc('get_browsable_slots'),
      supabase.from('app_settings').select('booking_window_open').eq('id', 1).single(),
      supabase.rpc('effective_quota', { p_staff_id: staff.id, p_duty_type: 'break' }),
      supabase.rpc('effective_quota', { p_staff_id: staff.id, p_duty_type: 'lunch_a' }),
    ])
    setSlots((rows ?? []) as BrowsableSlot[])
    setWindowOpen(settings?.booking_window_open ?? false)
    setBreakQuota(qb.data ?? 0)
    setLunchQuota(ql.data ?? 0)
  }
  useEffect(() => {
    void load()
  }, [staff])

  const breakBooked = useMemo(
    () => slots.filter((s) => s.duty_type === 'break' && s.already_booked).length,
    [slots],
  )
  const lunchBooked = useMemo(
    () =>
      slots.filter(
        (s) => (s.duty_type === 'lunch_a' || s.duty_type === 'lunch_b') && s.already_booked,
      ).length,
    [slots],
  )

  const grouped = useMemo(() => {
    const m = new Map<DayOfWeek, BrowsableSlot[]>()
    for (const d of DAYS) m.set(d, [])
    for (const s of slots) m.get(s.day_of_week)?.push(s)
    return m
  }, [slots])

  const onBook = async (s: BrowsableSlot) => {
    if (!staff) return
    setErr(null)
    setInfo(null)
    setBusy(s.id)
    const { error } = await supabase.rpc('book_slot', { p_slot_id: s.id })
    setBusy(null)
    if (error) {
      setErr(error.message)
      return
    }
    setInfo(`Booked ${s.day_of_week} ${DUTY_TYPE_LABEL[s.duty_type]}.`)
    await load()
  }

  const onCancel = async (s: BrowsableSlot) => {
    if (!staff) return
    setErr(null)
    setInfo(null)
    // Find the booking id for this slot.
    const { data: bk } = await supabase
      .from('bookings')
      .select('id')
      .eq('staff_id', staff.id)
      .eq('duty_slot_id', s.id)
      .maybeSingle()
    if (!bk) {
      setErr('Could not find that booking.')
      return
    }
    setBusy(s.id)
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bk.id })
    setBusy(null)
    if (error) {
      setErr(error.message)
      return
    }
    setInfo(`Cancelled ${s.day_of_week} ${DUTY_TYPE_LABEL[s.duty_type]}.`)
    await load()
  }

  return (
    <div>
      <PageHeader
        title="Browse slots"
        subtitle="Tap a slot to claim it. Spots fill up first-come, first-served."
      />

      <Card className="sticky top-14 z-20 mb-4 shadow-md">
        <div className="grid grid-cols-2 gap-4">
          <QuotaCounter label="Break" booked={breakBooked} quota={breakQuota} />
          <QuotaCounter label="Lunch" booked={lunchBooked} quota={lunchQuota} />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Lunch A and Lunch B are the two lunch sittings — they share your lunch quota.
        </p>
      </Card>

      {!windowOpen && (
        <Card className="mb-4 border-amber-300 bg-amber-50 text-sm text-amber-900">
          The booking window is currently <strong>closed</strong>. You can see your bookings but can't make changes.
        </Card>
      )}
      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}
      {info && <Card className="mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800">{info}</Card>}

      {slots.length === 0 ? (
        <EmptyState title="No slots available" body="Check back once your admin has published the schedule." />
      ) : (
        <div className="space-y-6">
          {DAYS.map((day) => {
            const daySlots = grouped.get(day) ?? []
            if (daySlots.length === 0) return null
            return (
              <section key={day}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {day}
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {daySlots.map((s) => {
                    const remaining = s.capacity - s.spots_taken
                    const full = !s.already_booked && remaining <= 0
                    return (
                      <Card key={s.id} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-slate-900">
                            {DUTY_TYPE_LABEL[s.duty_type]} duty
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {s.already_booked
                              ? 'You have this slot'
                              : full
                              ? 'No spots remaining'
                              : `${remaining} of ${s.capacity} spots remaining`}
                          </p>
                        </div>
                        {s.already_booked ? (
                          <div className="flex flex-col items-end gap-2">
                            <Badge tone="green">Booked</Badge>
                            <Button
                              variant="secondary"
                              disabled={!windowOpen || busy === s.id}
                              onClick={() => onCancel(s)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : full ? (
                          <Badge tone="rose">Full</Badge>
                        ) : (s.duty_type === 'break' ? breakBooked >= breakQuota : lunchBooked >= lunchQuota) ? (
                          <Badge tone="slate">Quota reached</Badge>
                        ) : (
                          <Button disabled={!windowOpen || busy === s.id} onClick={() => onBook(s)}>
                            {busy === s.id ? '…' : 'Book'}
                          </Button>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuotaCounter({ label, booked, quota }: { label: string; booked: number; quota: number }) {
  const remaining = Math.max(quota - booked, 0)
  const done = quota > 0 && booked >= quota
  const pct = quota > 0 ? Math.min(100, (booked / quota) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 text-sm text-slate-700">
            <strong>{booked}</strong> of {quota} booked
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold leading-none ${done ? 'text-emerald-600' : 'text-indigo-600'}`}>
            {remaining}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {done ? 'all done' : 'to go'}
          </p>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
