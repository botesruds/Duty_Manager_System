import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'

interface MyDuty {
  booking_id: string
  slot_id: string
  duty_type: DutyType
  day_of_week: DayOfWeek
  location_name: string | null
  self_marked_at: string | null
  monitor_marked_at: string | null
  monitor_name: string | null
}

export default function SelfReport() {
  const [rows, setRows] = useState<MyDuty[]>([])
  const [published, setPublished] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const load = async () => {
    const [{ data: settings }, { data, error }] = await Promise.all([
      supabase.from('app_settings').select('schedule_published').eq('id', 1).single(),
      supabase.rpc('my_todays_duties'),
    ])
    setPublished(settings?.schedule_published ?? false)
    if (error) setErr(error.message)
    else setRows((data ?? []) as MyDuty[])
  }
  useEffect(() => {
    void load()
  }, [])

  const onMark = async (d: MyDuty) => {
    setErr(null)
    setInfo(null)
    setBusy(d.booking_id)
    const { error } = await supabase.rpc('mark_attendance', {
      p_booking_id: d.booking_id,
      p_by_monitor: false,
    })
    setBusy(null)
    if (error) {
      setErr(error.message)
      return
    }
    setInfo(`You're marked present for ${DUTY_TYPE_LABEL[d.duty_type]} duty. ✓`)
    await load()
  }

  return (
    <div>
      <PageHeader title="Today’s duty" subtitle={`${today} — tap to mark yourself present.`} />
      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}
      {info && <Card className="mb-4 border-emerald-300 bg-emerald-50 text-sm text-emerald-800">{info}</Card>}
      {published === false ? (
        <Card className="border-amber-300 bg-amber-50 text-sm text-amber-900">
          <p className="font-medium">Schedule not yet published.</p>
          <p className="mt-1 text-amber-800">
            Your admin is still finalising location assignments. Once the schedule is published you'll
            see your duty here and be able to check in.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState title="You have no duty today" body="Enjoy the day off!" />
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card key={d.booking_id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-slate-900">
                    {DUTY_TYPE_LABEL[d.duty_type]} duty · {d.day_of_week}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Location:{' '}
                    {d.location_name ? (
                      <span className="font-medium">{d.location_name}</span>
                    ) : (
                      <span className="italic text-slate-500">awaiting assignment</span>
                    )}
                  </p>
                </div>
                {d.self_marked_at ? (
                  <Badge tone="green">Self ✓</Badge>
                ) : (
                  <Button disabled={busy === d.booking_id} onClick={() => onMark(d)}>
                    {busy === d.booking_id ? '…' : 'Mark present'}
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                {d.self_marked_at && (
                  <span>Self-marked at {new Date(d.self_marked_at).toLocaleTimeString()}</span>
                )}
                {d.monitor_marked_at ? (
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                    Confirmed by monitor{d.monitor_name ? ` (${d.monitor_name})` : ''} at{' '}
                    {new Date(d.monitor_marked_at).toLocaleTimeString()}
                  </span>
                ) : (
                  <span className="italic">Awaiting monitor confirmation</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
