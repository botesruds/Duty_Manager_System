import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader, Select } from '../../components/ui'

const isLunch = (t: DutyType) => t === 'lunch_a' || t === 'lunch_b'

interface Slot {
  id: string
  duty_type: DutyType
  day_of_week: DayOfWeek
  capacity: number
}
interface Staff {
  id: string
  emp_no: string
  name: string
  duty_quota_break: number | null
  duty_quota_lunch: number | null
  departments: { duty_quota_break: number; duty_quota_lunch: number } | null
}
interface Booking {
  id: string
  staff_id: string
  duty_slot_id: string
}

export default function AdminBookings() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    const [s, sl, bk] = await Promise.all([
      supabase
        .from('staff')
        .select('id, emp_no, name, duty_quota_break, duty_quota_lunch, departments(duty_quota_break, duty_quota_lunch)')
        .order('name'),
      supabase.from('duty_slots').select('id, duty_type, day_of_week, capacity').order('day_of_week').order('duty_type'),
      supabase.from('bookings').select('id, staff_id, duty_slot_id'),
    ])
    if (s.error) setErr(s.error.message)
    if (sl.error) setErr(sl.error.message)
    if (bk.error) setErr(bk.error.message)
    setStaff((s.data ?? []) as unknown as Staff[])
    setSlots((sl.data ?? []) as Slot[])
    setBookings(bk.data ?? [])
  }
  useEffect(() => {
    void load()
  }, [])

  const quota = (st: Staff, type: 'break' | 'lunch') => {
    if (type === 'break') return st.duty_quota_break ?? st.departments?.duty_quota_break ?? 0
    return st.duty_quota_lunch ?? st.departments?.duty_quota_lunch ?? 0
  }

  const bookedByStaff = useMemo(() => {
    const m = new Map<string, Booking[]>()
    for (const b of bookings) {
      if (!m.has(b.staff_id)) m.set(b.staff_id, [])
      m.get(b.staff_id)!.push(b)
    }
    return m
  }, [bookings])

  const slotsById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots])

  const alreadyBooked = useMemo(
    () =>
      !!selectedStaff &&
      !!selectedSlot &&
      bookings.some((b) => b.staff_id === selectedStaff && b.duty_slot_id === selectedSlot),
    [bookings, selectedStaff, selectedSlot],
  )

  const onAssign = async () => {
    setErr(null)
    if (!selectedStaff || !selectedSlot) return
    const { error } = await supabase
      .from('bookings')
      .insert({ staff_id: selectedStaff, duty_slot_id: selectedSlot })
    if (error) {
      if (error.code === '23505') {
        const s = staff.find((x) => x.id === selectedStaff)
        setErr(`${s?.name ?? 'That teacher'} is already booked on this slot.`)
      } else {
        setErr(error.message)
      }
    } else {
      setSelectedSlot('')
      await load()
    }
  }

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Manual assignment bypasses quota and capacity checks — admin override."
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Staff" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
            <option value="">Select staff…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.emp_no})</option>
            ))}
          </Select>
          <Select label="Slot" value={selectedSlot} onChange={(e) => setSelectedSlot(e.target.value)}>
            <option value="">Select slot…</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.day_of_week} · {DUTY_TYPE_LABEL[s.duty_type]}
              </option>
            ))}
          </Select>
          <div className="flex items-end">
            <Button
              onClick={onAssign}
              disabled={!selectedStaff || !selectedSlot || alreadyBooked}
              className="w-full"
            >
              {alreadyBooked ? 'Already booked' : 'Assign'}
            </Button>
          </div>
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      </Card>

      {staff.length === 0 ? (
        <EmptyState title="No staff yet" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Staff</th>
                <th className="px-4 py-2">Break</th>
                <th className="px-4 py-2">Lunch</th>
                <th className="px-4 py-2">Slots booked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((st) => {
                const bks = bookedByStaff.get(st.id) ?? []
                const bk = bks.filter((b) => slotsById.get(b.duty_slot_id)?.duty_type === 'break').length
                const lk = bks.filter((b) => {
                  const t = slotsById.get(b.duty_slot_id)?.duty_type
                  return t ? isLunch(t) : false
                }).length
                const bq = quota(st, 'break')
                const lq = quota(st, 'lunch')
                return (
                  <tr key={st.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{st.name}</div>
                      <div className="font-mono text-xs text-slate-500">{st.emp_no}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={bk >= bq ? 'green' : 'amber'}>{bk}/{bq}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={lk >= lq ? 'green' : 'amber'}>{lk}/{lq}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {bks.map((b) => {
                          const s = slotsById.get(b.duty_slot_id)
                          if (!s) return null
                          return (
                            <span
                              key={b.id}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                            >
                              {s.day_of_week} · {DUTY_TYPE_LABEL[s.duty_type]}
                            </span>
                          )
                        })}
                        {bks.length === 0 && <span className="text-xs text-slate-400">—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
