import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'

interface Summary {
  breakBooked: number
  breakQuota: number
  lunchBooked: number
  lunchQuota: number
  windowOpen: boolean
  schedulePublished: boolean
}

interface ScheduleRow {
  booking_id: string
  day_of_week: DayOfWeek
  duty_type: DutyType
  location_name: string | null
}

interface ActionableSwap {
  request_id: string
  requester_name: string
  source_day: DayOfWeek
  source_duty_type: DutyType
  target_day: DayOfWeek | null
  created_at: string
}

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function TeacherDashboard() {
  const { staff } = useAuth()
  const [s, setS] = useState<Summary | null>(null)
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [actionable, setActionable] = useState<ActionableSwap[]>([])

  useEffect(() => {
    if (!staff) return
    void (async () => {
      const [qb, ql, settings, slots, mySched, swaps] = await Promise.all([
        supabase.rpc('effective_quota', { p_staff_id: staff.id, p_duty_type: 'break' }),
        supabase.rpc('effective_quota', { p_staff_id: staff.id, p_duty_type: 'lunch_a' }),
        supabase.from('app_settings').select('booking_window_open, schedule_published').eq('id', 1).single(),
        supabase.rpc('get_browsable_slots'),
        supabase.rpc('my_schedule'),
        supabase.rpc('actionable_swap_requests'),
      ])
      const booked = (slots.data ?? []).filter((x) => x.already_booked)
      setS({
        breakQuota: qb.data ?? 0,
        lunchQuota: ql.data ?? 0,
        breakBooked: booked.filter((x) => x.duty_type === 'break').length,
        lunchBooked: booked.filter((x) => x.duty_type === 'lunch_a' || x.duty_type === 'lunch_b').length,
        windowOpen: settings.data?.booking_window_open ?? false,
        schedulePublished: settings.data?.schedule_published ?? false,
      })
      setSchedule((mySched.data ?? []) as ScheduleRow[])
      setActionable((swaps.data ?? []) as ActionableSwap[])
    })()
  }, [staff])

  const scheduleByDay = new Map<DayOfWeek, ScheduleRow[]>()
  for (const d of DAYS) scheduleByDay.set(d, [])
  for (const r of schedule) scheduleByDay.get(r.day_of_week)?.push(r)

  return (
    <div>
      <PageHeader
        title={`Hi, ${staff?.name ?? 'there'}`}
        subtitle="Pick your duties for the week. Tap a slot to book it."
        actions={
          <Link to="/teacher/slots">
            <Button>Browse slots</Button>
          </Link>
        }
      />

      {!s ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          {actionable.length > 0 && (
            <Card className="mb-4 border-indigo-300 bg-indigo-50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-indigo-900">
                    {actionable.length === 1
                      ? '1 swap request needs your attention'
                      : `${actionable.length} swap requests need your attention`}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-indigo-900">
                    {actionable.slice(0, 3).map((r) => (
                      <li key={r.request_id}>
                        <strong>{r.requester_name}</strong> wants{' '}
                        {r.source_day} {DUTY_TYPE_LABEL[r.source_duty_type]}
                        {' → '}
                        {r.target_day ?? 'any other day'}
                      </li>
                    ))}
                    {actionable.length > 3 && (
                      <li className="italic text-indigo-700">+{actionable.length - 3} more</li>
                    )}
                  </ul>
                </div>
                <Link to="/teacher/swaps">
                  <Button variant="primary">Open swap board</Button>
                </Link>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RemainingCard label="Break duties" booked={s.breakBooked} quota={s.breakQuota} />
            <RemainingCard label="Lunch duties" booked={s.lunchBooked} quota={s.lunchQuota} />
            <Card className="md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700">Booking window</span>
                <Badge tone={s.windowOpen ? 'green' : 'rose'}>{s.windowOpen ? 'Open' : 'Closed'}</Badge>
              </div>
              {!s.windowOpen && (
                <p className="mt-2 text-xs text-slate-500">
                  You can't book or cancel right now. Contact an admin if you need a change.
                </p>
              )}
            </Card>
          </div>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Your duties this week
              </h2>
              <Badge tone={s.schedulePublished ? 'green' : 'amber'}>
                {s.schedulePublished ? 'Locations confirmed' : 'Locations pending'}
              </Badge>
            </div>

            {!s.schedulePublished && schedule.length > 0 && (
              <p className="mb-3 text-xs text-slate-500">
                You've booked these duties, but admin is still finalising location assignments.
                Locations will appear here once the schedule is published.
              </p>
            )}

            {schedule.length === 0 ? (
              <EmptyState
                title="You haven't booked any duties yet"
                body={<>Head to <Link to="/teacher/slots" className="text-indigo-700 underline">Browse slots</Link> to pick yours.</>}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DAYS.map((day) => {
                  const items = scheduleByDay.get(day) ?? []
                  if (items.length === 0) return null
                  return (
                    <Card key={day}>
                      <p className="mb-2 text-sm font-semibold text-slate-700">{day}</p>
                      <ul className="space-y-2">
                        {items.map((r) => {
                          const confirmed = s.schedulePublished && r.location_name
                          return (
                            <li key={r.booking_id} className="rounded-md bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-900">
                                  {DUTY_TYPE_LABEL[r.duty_type]}
                                </span>
                                <Badge tone={confirmed ? 'green' : 'amber'}>
                                  {confirmed ? 'Confirmed' : 'Pending'}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-600">
                                {confirmed ? (
                                  <>
                                    Location: <span className="font-medium">{r.location_name}</span>
                                  </>
                                ) : (
                                  <span className="italic text-slate-500">Awaiting location</span>
                                )}
                              </p>
                            </li>
                          )
                        })}
                      </ul>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function RemainingCard({ label, booked, quota }: { label: string; booked: number; quota: number }) {
  const remaining = Math.max(quota - booked, 0)
  const done = quota > 0 && booked >= quota
  return (
    <Card className="text-center">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-2 text-5xl font-bold ${done ? 'text-emerald-600' : 'text-indigo-600'}`}>
        {remaining}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        still to book — {booked} of {quota} done
      </p>
    </Card>
  )
}
