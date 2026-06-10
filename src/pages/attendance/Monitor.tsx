import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'

interface Duty {
  booking_id: string
  slot_id: string
  duty_type: DutyType
  day_of_week: DayOfWeek
  location_name: string | null
  staff_id: string
  emp_no: string
  staff_name: string
  self_marked_at: string | null
  self_marked_by_staff_id: string | null
  monitor_marked_at: string | null
  monitor_marked_by_staff_id: string | null
  monitor_name: string | null
}

const TYPE_ORDER: DutyType[] = ['break', 'lunch_a', 'lunch_b']

export default function Monitor() {
  const [rows, setRows] = useState<Duty[]>([])
  const [published, setPublished] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState<DutyType | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: settings }, { data, error }] = await Promise.all([
      supabase.from('app_settings').select('schedule_published').eq('id', 1).single(),
      supabase.rpc('todays_duties'),
    ])
    setPublished(settings?.schedule_published ?? false)
    if (error) setErr(error.message)
    else setRows((data ?? []) as Duty[])
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('attendance-monitor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          void load()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  const byType = useMemo(() => {
    const m = new Map<DutyType, Duty[]>()
    for (const t of TYPE_ORDER) m.set(t, [])
    for (const r of rows) m.get(r.duty_type)?.push(r)
    return m
  }, [rows])

  const onTick = async (d: Duty) => {
    setErr(null)
    setBusy(d.booking_id)
    const { error } = await supabase.rpc('mark_attendance', {
      p_booking_id: d.booking_id,
      p_by_monitor: true,
    })
    setBusy(null)
    if (error) setErr(error.message)
    await load()
  }

  const onConfirmAll = async (type: DutyType, items: Duty[]) => {
    const pending = items.filter((d) => !d.monitor_marked_at)
    if (pending.length === 0) return
    if (
      !confirm(
        `Confirm all ${pending.length} remaining ${DUTY_TYPE_LABEL[type]} dut${
          pending.length === 1 ? 'y' : 'ies'
        } as present?\n\nOnly do this if you've actually seen everyone at their location.`,
      )
    )
      return
    setErr(null)
    setBulkBusy(type)
    for (const d of pending) {
      const { error } = await supabase.rpc('mark_attendance', {
        p_booking_id: d.booking_id,
        p_by_monitor: true,
      })
      if (error) {
        setErr(`Stopped at ${d.staff_name}: ${error.message}`)
        break
      }
    }
    setBulkBusy(null)
    await load()
  }

  return (
    <div>
      <PageHeader
        title="Attendance check-in"
        subtitle="Today’s duty list with self-check status and your monitor confirmation."
      />
      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}
      {published === false ? (
        <Card className="border-amber-300 bg-amber-50 text-sm text-amber-900">
          <p className="font-medium">Schedule not yet published.</p>
          <p className="mt-1 text-amber-800">
            The admin is still finalising location assignments. Check-in opens once the schedule is
            published.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState title="No duties scheduled for today" />
      ) : (
        <div className="space-y-6">
          {TYPE_ORDER.map((type) => {
            const items = byType.get(type) ?? []
            if (items.length === 0) return null
            const monitorDone = items.filter((d) => d.monitor_marked_at).length
            const selfDone = items.filter((d) => d.self_marked_at).length
            return (
              <section key={type}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {DUTY_TYPE_LABEL[type]} duty
                  </h2>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    Self {selfDone}/{items.length} · Monitor {monitorDone}/{items.length}
                    {monitorDone < items.length && (
                      <Button
                        variant="secondary"
                        disabled={bulkBusy !== null}
                        onClick={() => onConfirmAll(type, items)}
                      >
                        {bulkBusy === type ? 'Confirming…' : `Confirm all (${items.length - monitorDone})`}
                      </Button>
                    )}
                  </span>
                </div>
                <Card className="overflow-hidden p-0">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Staff</th>
                        <th className="px-4 py-2">Location</th>
                        <th className="px-4 py-2">Self</th>
                        <th className="px-4 py-2">Monitor confirm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((d) => (
                        <tr key={d.booking_id}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{d.staff_name}</div>
                            <div className="font-mono text-xs text-slate-500">{d.emp_no}</div>
                          </td>
                          <td className="px-4 py-2">
                            {d.location_name ? (
                              d.location_name
                            ) : (
                              <span className="italic text-slate-400">unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {d.self_marked_at ? (
                              <div className="flex flex-col">
                                <Badge tone="green">✓ Self</Badge>
                                <span className="mt-1 text-xs text-slate-500">
                                  {new Date(d.self_marked_at).toLocaleTimeString()}
                                </span>
                              </div>
                            ) : (
                              <Badge tone="slate">Not yet</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {d.monitor_marked_at ? (
                              <div className="flex flex-col">
                                <Badge tone="indigo">✓ Confirmed</Badge>
                                <span className="mt-1 text-xs text-slate-500">
                                  by {d.monitor_name ?? '—'} at{' '}
                                  {new Date(d.monitor_marked_at).toLocaleTimeString()}
                                </span>
                              </div>
                            ) : (
                              <Button onClick={() => onTick(d)} disabled={busy === d.booking_id}>
                                {busy === d.booking_id ? '…' : 'Confirm'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
