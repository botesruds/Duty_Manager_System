import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'

const DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const TYPE_ORDER: DutyType[] = ['break', 'lunch_a', 'lunch_b']

interface LocationRow {
  duty_slot_id: string
  duty_type: DutyType
  location_id: string
  location_name: string
  capacity: number
}
interface BookingRow {
  booking_id: string
  duty_slot_id: string
  duty_type: DutyType
  staff_id: string
  staff_name: string
  emp_no: string
  location_id: string | null
}

// MIME type used for drag payload — the booking id.
const DRAG_MIME = 'application/x-duty-booking'

export default function AdminSchedule() {
  const [day, setDay] = useState<DayOfWeek>('Mon')
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [published, setPublished] = useState<boolean | null>(null)
  const [season, setSeason] = useState<'indoor' | 'outdoor' | null>(null)
  const [savingPublish, setSavingPublish] = useState(false)
  const [savingSeason, setSavingSeason] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Holds the duty_type currently being dragged, used to highlight valid drop targets.
  const [draggingType, setDraggingType] = useState<DutyType | null>(null)

  const load = useCallback(async (d: DayOfWeek) => {
    const [locs, bks, { data: settings }] = await Promise.all([
      supabase.rpc('schedule_day_locations', { p_day: d }),
      supabase.rpc('schedule_day_bookings', { p_day: d }),
      supabase.from('app_settings').select('schedule_published, current_season').eq('id', 1).single(),
    ])
    if (locs.error) setErr(locs.error.message)
    if (bks.error) setErr(bks.error.message)
    setLocations((locs.data ?? []) as LocationRow[])
    setBookings((bks.data ?? []) as BookingRow[])
    setPublished(settings?.schedule_published ?? false)
    setSeason((settings?.current_season as 'indoor' | 'outdoor') ?? 'outdoor')
  }, [])

  useEffect(() => {
    setErr(null)
    setInfo(null)
    void load(day)
  }, [day, load])

  const locationsByType = useMemo(() => {
    const m = new Map<DutyType, LocationRow[]>()
    for (const t of TYPE_ORDER) m.set(t, [])
    for (const l of locations) m.get(l.duty_type)?.push(l)
    return m
  }, [locations])

  // Key is duty_slot_id|location_id — the same location (e.g. "3G Zone 1") is reused across
  // multiple duty types in a day. Without keying on duty_slot_id too, a Break booking placed
  // at 3G Zone 1 would also show up in the Lunch A/B cards that share that location name.
  // The set of (duty_slot, location) pairs currently visible (= filtered to current season).
  const visibleLocKeys = useMemo(
    () => new Set(locations.map((l) => `${l.duty_slot_id}|${l.location_id}`)),
    [locations],
  )

  // A booking is "effectively assigned" only if its location is in the visible set.
  // Off-season assignments (a booking sitting on a location of the other category) fall back
  // to Unassigned in the UI, so they can be re-placed onto in-season locations.
  const effectiveLocKey = (b: BookingRow): string | null => {
    if (!b.location_id) return null
    const k = `${b.duty_slot_id}|${b.location_id}`
    return visibleLocKeys.has(k) ? k : null
  }

  const bookingsByLocCard = useMemo(() => {
    const m = new Map<string, BookingRow[]>()
    for (const b of bookings) {
      const k = effectiveLocKey(b)
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(b)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, visibleLocKeys])

  const unassignedByType = useMemo(() => {
    const m = new Map<DutyType, BookingRow[]>()
    for (const t of TYPE_ORDER) m.set(t, [])
    for (const b of bookings) {
      if (!effectiveLocKey(b)) m.get(b.duty_type)?.push(b)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, visibleLocKeys])

  const offSeasonCount = useMemo(
    () => bookings.filter((b) => b.location_id && !effectiveLocKey(b)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, visibleLocKeys],
  )

  const totalBookings = bookings.length
  const assignedBookings = bookings.filter((b) => effectiveLocKey(b)).length
  const totalCapacity = locations.reduce((s, l) => s + l.capacity, 0)

  const handleDragStart = (booking: BookingRow) => (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, booking.booking_id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingType(booking.duty_type)
  }

  const handleDragEnd = () => setDraggingType(null)

  const isCompatible = (targetType: DutyType) =>
    draggingType === null || draggingType === targetType

  const handleDropToLocation =
    (location: LocationRow) =>
    async (e: DragEvent) => {
      e.preventDefault()
      const bookingId = e.dataTransfer.getData(DRAG_MIME)
      if (!bookingId) {
        setErr('That drag didn’t register — please try dragging the name again.')
        return
      }
      const booking = bookings.find((b) => b.booking_id === bookingId)
      if (!booking) return
      if (booking.duty_type !== location.duty_type) {
        setErr(`Can't drop a ${DUTY_TYPE_LABEL[booking.duty_type]} duty into a ${DUTY_TYPE_LABEL[location.duty_type]} location.`)
        return
      }
      // Optimistic update
      setBookings((rows) =>
        rows.map((r) => (r.booking_id === bookingId ? { ...r, location_id: location.location_id } : r)),
      )
      setErr(null)
      const { error } = await supabase.rpc('assign_booking_to_location', {
        p_booking_id: bookingId,
        p_location_id: location.location_id,
      })
      if (error) {
        setErr(error.message)
        await load(day)
      }
    }

  const handleDropToUnassigned = async (e: DragEvent) => {
    e.preventDefault()
    const bookingId = e.dataTransfer.getData(DRAG_MIME)
    if (!bookingId) return
    setBookings((rows) =>
      rows.map((r) => (r.booking_id === bookingId ? { ...r, location_id: null } : r)),
    )
    setErr(null)
    const { error } = await supabase.rpc('unassign_booking_location', { p_booking_id: bookingId })
    if (error) {
      setErr(error.message)
      await load(day)
    }
  }

  const allowDrop = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }

  const onTogglePublish = async () => {
    if (published === null) return
    if (!published) {
      // Publishing affects the whole week, but this page only shows one day —
      // check every day's bookings before going live.
      const [unassignedRes, offSeasonRes] = await Promise.all([
        supabase.from('bookings').select('id', { count: 'exact', head: true }).is('location_id', null),
        season
          ? supabase
              .from('bookings')
              .select('id, locations!inner(category)', { count: 'exact', head: true })
              .neq('locations.category', season)
          : Promise.resolve({ count: 0, error: null }),
      ])
      const unassigned = unassignedRes.count ?? 0
      const offSeason = offSeasonRes.count ?? 0
      const warnings: string[] = []
      if (unassigned > 0)
        warnings.push(`${unassigned} booking${unassigned === 1 ? ' has' : 's have'} no location yet`)
      if (offSeason > 0)
        warnings.push(
          `${offSeason} booking${offSeason === 1 ? ' is' : 's are'} assigned to off-season locations`,
        )
      if (warnings.length > 0) {
        const proceed = confirm(
          `The schedule isn't complete (across the whole week):\n\n• ${warnings.join(
            '\n• ',
          )}\n\nTeachers only see duties with an assigned in-season location — the rest will show as "awaiting location".\n\nPublish anyway?`,
        )
        if (!proceed) return
      }
    }
    setSavingPublish(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ schedule_published: !published, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSavingPublish(false)
    if (error) {
      setErr(error.message)
      return
    }
    setPublished(!published)
    setInfo(!published ? 'Schedule published.' : 'Schedule unpublished. Assignments preserved.')
  }

  const onSwitchSeason = async () => {
    if (!season) return
    const next: 'indoor' | 'outdoor' = season === 'indoor' ? 'outdoor' : 'indoor'
    if (!confirm(`Switch to ${next} season? Any bookings still assigned to ${season} locations will appear unassigned until you place them again.`)) return
    setSavingSeason(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ current_season: next, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setSavingSeason(false)
    if (error) {
      setErr(error.message)
      return
    }
    setInfo(`Switched to ${next} season.`)
    await load(day)
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Drag teacher names from the Unassigned strip into location slots. Each day stands on its own."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={onSwitchSeason}
              disabled={savingSeason || season === null}
              title={season ? `Switch to ${season === 'indoor' ? 'outdoor' : 'indoor'}` : ''}
            >
              {season === null ? '…' : season === 'indoor' ? 'Switch to outdoor' : 'Switch to indoor'}
            </Button>
            <Button
              onClick={onTogglePublish}
              disabled={savingPublish || published === null}
              variant={published ? 'secondary' : 'primary'}
            >
              {published ? 'Unpublish' : 'Publish schedule'}
            </Button>
          </>
        }
      />

      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}
      {info && <Card className="mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800">{info}</Card>}

      <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={`rounded-md px-4 py-1.5 font-medium ${
                day === d
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-700">
            <strong>{day}</strong>: {assignedBookings} of {totalBookings} assigned
            {totalCapacity > 0 && (
              <span className="text-slate-400"> · {totalCapacity} slots total</span>
            )}
          </span>
          <span className="hidden items-center gap-1.5 lg:flex">
            {TYPE_ORDER.map((t) => {
              const locCount = (locationsByType.get(t) ?? []).length
              if (locCount === 0) return null
              const ofType = bookings.filter((b) => b.duty_type === t)
              const filled = ofType.filter((b) => effectiveLocKey(b)).length
              // Green = no one of this type left to place; amber = work remaining.
              return (
                <Badge key={t} tone={filled >= ofType.length ? 'green' : 'amber'}>
                  {DUTY_TYPE_LABEL[t]} {filled}/{locCount}
                </Badge>
              )
            })}
          </span>
          {season && (
            <Badge tone={season === 'indoor' ? 'amber' : 'green'}>
              {season === 'indoor' ? 'Indoor' : 'Outdoor'}
            </Badge>
          )}
          {published !== null && (
            <Badge tone={published ? 'green' : 'amber'}>{published ? 'Published' : 'Draft'}</Badge>
          )}
        </div>
      </div>

      {offSeasonCount > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50 text-sm text-amber-900">
          {offSeasonCount} booking{offSeasonCount === 1 ? ' is' : 's are'} still assigned to off-season
          ({season === 'indoor' ? 'outdoor' : 'indoor'}) locations. They appear in the Unassigned strip
          below — drop them into a {season} location to re-place them.
        </Card>
      )}

      {locations.length === 0 ? (
        <EmptyState
          title={`No locations configured for ${day}`}
          body={
            <>
              Go to <Link className="text-brand-700 underline" to="/admin/locations">Locations</Link> to define
              physical locations and set their capacity for this day.
            </>
          }
        />
      ) : (
        <>
          <Card
            className="sticky top-14 z-20 mb-4 shadow-md"
            onDragOver={allowDrop}
            onDrop={handleDropToUnassigned}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Unassigned for {day}
              </p>
              <p className="text-[10px] text-slate-400">
                Drop here to unassign
              </p>
            </div>
            <div className="mt-2 flex max-h-40 min-h-[2.5rem] flex-wrap gap-2 overflow-y-auto">
              {TYPE_ORDER.flatMap((t) =>
                (unassignedByType.get(t) ?? []).map((b) => (
                  <Chip
                    key={b.booking_id}
                    booking={b}
                    onDragStart={handleDragStart(b)}
                    onDragEnd={handleDragEnd}
                  />
                )),
              )}
              {bookings.every((b) => !!b.location_id) && (
                <p className="text-sm italic text-slate-400">All bookings assigned</p>
              )}
            </div>
          </Card>

          {TYPE_ORDER.map((type) => {
            const locs = locationsByType.get(type) ?? []
            if (locs.length === 0) return null
            return (
              <section key={type} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {DUTY_TYPE_LABEL[type]}
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {locs.map((loc) => {
                    const here = bookingsByLocCard.get(`${loc.duty_slot_id}|${loc.location_id}`) ?? []
                    const occupant = here[0] ?? null
                    const compatible = isCompatible(loc.duty_type)
                    const dragging = draggingType !== null
                    const droppable = compatible && !occupant
                    return (
                      <Card
                        key={loc.location_id}
                        className={`p-3 transition ${
                          dragging
                            ? droppable
                              ? 'border-brand-400 ring-1 ring-brand-200'
                              : 'opacity-40'
                            : ''
                        }`}
                        onDragOver={droppable ? allowDrop : undefined}
                        onDrop={droppable ? handleDropToLocation(loc) : undefined}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">{loc.location_name}</p>
                          {occupant && <span className="text-xs text-emerald-600">●</span>}
                        </div>
                        {occupant ? (
                          <Chip
                            booking={occupant}
                            onDragStart={handleDragStart(occupant)}
                            onDragEnd={handleDragEnd}
                          />
                        ) : (
                          <div className="rounded-md border border-dashed border-slate-200 px-2 py-1 text-xs italic text-slate-400">
                            drop a name here
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}

function Chip({
  booking,
  onDragStart,
  onDragEnd,
}: {
  booking: BookingRow
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}) {
  const tone =
    booking.duty_type === 'break'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : booking.duty_type === 'lunch_a'
      ? 'border-sky-300 bg-sky-50 text-sky-900'
      : 'border-violet-300 bg-violet-50 text-violet-900'
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${booking.staff_name} (${booking.emp_no}) · ${DUTY_TYPE_LABEL[booking.duty_type]}`}
      className={`group inline-flex cursor-grab items-center gap-1 rounded-md border px-2 py-1 text-xs active:cursor-grabbing ${tone}`}
    >
      {booking.staff_name}
      <span className="text-[10px] opacity-70">· {DUTY_TYPE_LABEL[booking.duty_type]}</span>
    </span>
  )
}
