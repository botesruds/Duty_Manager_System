import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader, Select } from '../../components/ui'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

interface MyBooking {
  id: string
  day_of_week: DayOfWeek
  duty_type: DutyType
}
interface BoardItem {
  request_id: string
  requester_staff_id: string
  requester_name: string
  requester_emp_no: string
  source_booking_id: string
  source_day: DayOfWeek
  source_duty_type: DutyType
  target_day: DayOfWeek | null
  created_at: string
}
interface MyRequest {
  request_id: string
  status: 'open' | 'completed' | 'cancelled'
  source_day: DayOfWeek
  source_duty_type: DutyType
  target_day: DayOfWeek | null
  created_at: string
  completed_at: string | null
}
interface EligibleBooking {
  booking_id: string
  day_of_week: DayOfWeek
  duty_type: DutyType
  location_name: string | null
}

export default function TeacherSwaps() {
  const { staff } = useAuth()
  const [myBookings, setMyBookings] = useState<MyBooking[]>([])
  const [board, setBoard] = useState<BoardItem[]>([])
  const [mine, setMine] = useState<MyRequest[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [requestModal, setRequestModal] = useState<MyBooking | null>(null)
  const [takeModal, setTakeModal] = useState<BoardItem | null>(null)

  const openBookingIds = useMemo(
    () => new Set(mine.filter((m) => m.status === 'open').map((m) => m.source_day + '|' + m.source_duty_type)),
    [mine],
  )

  const load = useCallback(async () => {
    if (!staff) return
    const [bookings, brd, mn] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, duty_slots(day_of_week, duty_type)')
        .eq('staff_id', staff.id),
      supabase.rpc('list_swap_board'),
      supabase.rpc('my_swap_requests'),
    ])
    type RawBooking = { id: string; duty_slots: { day_of_week: DayOfWeek; duty_type: DutyType } | null }
    setMyBookings(
      ((bookings.data ?? []) as unknown as RawBooking[])
        .filter((b): b is RawBooking & { duty_slots: NonNullable<RawBooking['duty_slots']> } => b.duty_slots !== null)
        .map((b) => ({
          id: b.id,
          day_of_week: b.duty_slots.day_of_week,
          duty_type: b.duty_slots.duty_type,
        })),
    )
    setBoard((brd.data ?? []) as BoardItem[])
    setMine((mn.data ?? []) as MyRequest[])
  }, [staff])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Request a swap"
        subtitle="Trade one of your duties with another teacher. Swaps stay within the same category (break ↔ break, lunch ↔ lunch)."
      />

      <Card className="mb-4 border-indigo-200 bg-indigo-50/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">How swaps work</p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-sm text-slate-700">
          <li>Post a request on the duty you want to give away (and which day you'd prefer instead).</li>
          <li>A colleague offers one of their duties — or if someone already posted the opposite request, you're matched instantly.</li>
          <li>
            The moment you're matched, <strong>the swap happens automatically</strong> — duty, day and
            location trade places. No admin approval needed. Check your dashboard to see your updated week.
          </li>
        </ol>
      </Card>

      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}
      {info && <Card className="mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800">{info}</Card>}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Your duties</h2>
        {myBookings.length === 0 ? (
          <EmptyState title="You have no bookings to swap." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myBookings.map((b) => {
              const key = b.day_of_week + '|' + b.duty_type
              const hasOpen = openBookingIds.has(key)
              return (
                <Card key={b.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{DUTY_TYPE_LABEL[b.duty_type]}</p>
                    <p className="text-xs text-slate-500">{b.day_of_week}</p>
                  </div>
                  {hasOpen ? (
                    <Badge tone="amber">Request open</Badge>
                  ) : (
                    <Button variant="secondary" onClick={() => setRequestModal(b)}>
                      Request swap
                    </Button>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Open requests from others
        </h2>
        {board.length === 0 ? (
          <EmptyState title="No open swap requests" body="Check back later, or post one of your own above." />
        ) : (
          <div className="space-y-2">
            {board
              .filter((b) => b.requester_staff_id !== staff?.id)
              .map((b) => (
                <Card key={b.request_id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{b.requester_name}</p>
                    <p className="text-xs text-slate-600">
                      Has <strong>{b.source_day} {DUTY_TYPE_LABEL[b.source_duty_type]}</strong>, wants{' '}
                      <strong>{b.target_day ?? 'any other day'}</strong>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      posted {new Date(b.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setTakeModal(b)}>
                    Offer a swap
                  </Button>
                </Card>
              ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Your requests</h2>
        {mine.length === 0 ? (
          <EmptyState title="You haven't posted any swap requests yet." />
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">From</th>
                  <th className="px-4 py-2">To</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mine.map((m) => (
                  <tr key={m.request_id}>
                    <td className="px-4 py-2">
                      {m.source_day} {DUTY_TYPE_LABEL[m.source_duty_type]}
                    </td>
                    <td className="px-4 py-2">{m.target_day ?? 'any'}</td>
                    <td className="px-4 py-2">
                      {m.status === 'open' && <Badge tone="amber">Open</Badge>}
                      {m.status === 'completed' && <Badge tone="green">Completed</Badge>}
                      {m.status === 'cancelled' && <Badge tone="slate">Cancelled</Badge>}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {(m.completed_at ?? m.created_at) &&
                        new Date(m.completed_at ?? m.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {m.status === 'open' && (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            setErr(null)
                            setInfo(null)
                            const { error } = await supabase.rpc('cancel_swap_request', {
                              p_request_id: m.request_id,
                            })
                            if (error) setErr(error.message)
                            else {
                              setInfo('Request cancelled.')
                              await load()
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {requestModal && (
        <RequestModal
          booking={requestModal}
          onClose={() => setRequestModal(null)}
          onDone={(message) => {
            setRequestModal(null)
            setInfo(message)
            void load()
          }}
          onError={(m) => setErr(m)}
        />
      )}
      {takeModal && (
        <TakeModal
          request={takeModal}
          onClose={() => setTakeModal(null)}
          onDone={(message) => {
            setTakeModal(null)
            setInfo(message)
            void load()
          }}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  )
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function RequestModal({
  booking,
  onClose,
  onDone,
  onError,
}: {
  booking: MyBooking
  onClose: () => void
  onDone: (message: string) => void
  onError: (m: string) => void
}) {
  const [targetDay, setTargetDay] = useState<DayOfWeek | ''>('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setSubmitting(true)
    const { data, error } = await supabase.rpc('create_swap_request', {
      p_source_booking_id: booking.id,
      p_target_day: targetDay === '' ? null : (targetDay as DayOfWeek),
    })
    setSubmitting(false)
    if (error) {
      onError(error.message)
      onClose()
      return
    }
    const result = (data ?? [])[0]
    if (result?.matched) {
      onDone('Match found and swap completed instantly!')
    } else {
      onDone('Swap request posted. Others can now take it.')
    }
  }

  const validDays = DAYS.filter((d) => {
    if (d === booking.day_of_week) return false
    // Lunch duties only Mon-Thu.
    if ((booking.duty_type === 'lunch_a' || booking.duty_type === 'lunch_b') && d === 'Fri') return false
    return true
  })

  return (
    <ModalShell title="Request a swap" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-700">
        You're requesting to swap your{' '}
        <strong>
          {booking.day_of_week} {DUTY_TYPE_LABEL[booking.duty_type]}
        </strong>
        .
      </p>
      <Select
        label="Preferred new day"
        value={targetDay}
        onChange={(e) => setTargetDay(e.target.value as DayOfWeek | '')}
      >
        <option value="">Any other day</option>
        {validDays.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </Select>
      <p className="mt-2 text-xs text-slate-500">
        If someone is already looking for your day with the same category, your swap completes immediately.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? 'Posting…' : 'Post request'}
        </Button>
      </div>
    </ModalShell>
  )
}

function TakeModal({
  request,
  onClose,
  onDone,
  onError,
}: {
  request: BoardItem
  onClose: () => void
  onDone: (message: string) => void
  onError: (m: string) => void
}) {
  const [eligible, setEligible] = useState<EligibleBooking[] | null>(null)
  const [chosen, setChosen] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('eligible_takes_for', {
        p_request_id: request.request_id,
      })
      if (error) {
        // Without this, a network hiccup looked like "you have no matching booking".
        setLoadErr(error.message)
        return
      }
      setEligible((data ?? []) as EligibleBooking[])
      if ((data ?? []).length === 1) setChosen((data ?? [])[0].booking_id)
    })()
  }, [request.request_id])

  const submit = async () => {
    if (!chosen) return
    setSubmitting(true)
    const { error } = await supabase.rpc('take_swap_request', {
      p_request_id: request.request_id,
      p_taker_booking_id: chosen,
    })
    setSubmitting(false)
    if (error) {
      onError(error.message)
      onClose()
      return
    }
    onDone(`Swap completed — you now have ${request.source_day} ${DUTY_TYPE_LABEL[request.source_duty_type]}.`)
  }

  return (
    <ModalShell title="Offer a swap" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-700">
        {request.requester_name} wants to give up{' '}
        <strong>{request.source_day} {DUTY_TYPE_LABEL[request.source_duty_type]}</strong> and take{' '}
        <strong>{request.target_day ?? 'any other day'}</strong>.
      </p>
      {loadErr ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          Couldn't load your bookings ({loadErr}). Close this window and try again.
        </p>
      ) : eligible === null ? (
        <p className="text-sm text-slate-500">Checking your bookings…</p>
      ) : eligible.length === 0 ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          You don't have a matching booking to offer. You'd need one in the same category (
          {request.source_duty_type === 'break' ? 'break' : 'lunch'})
          {request.target_day ? ` on ${request.target_day}` : ' on a different day'}.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Choose the booking you'll give up:</p>
          {eligible.map((b) => (
            <label
              key={b.booking_id}
              className={`flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm ${
                chosen === b.booking_id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'
              }`}
            >
              <span>
                <input
                  type="radio"
                  name="eligible"
                  className="mr-2"
                  checked={chosen === b.booking_id}
                  onChange={() => setChosen(b.booking_id)}
                />
                {b.day_of_week} {DUTY_TYPE_LABEL[b.duty_type]}
                {b.location_name && (
                  <span className="ml-2 text-xs text-slate-500">({b.location_name})</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!chosen || submitting || eligible?.length === 0}>
          {submitting ? 'Swapping…' : 'Confirm swap'}
        </Button>
      </div>
    </ModalShell>
  )
}
