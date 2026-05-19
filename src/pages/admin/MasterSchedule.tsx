import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DUTY_TYPE_LABEL, type DayOfWeek, type DutyType } from '../../lib/database.types'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'

interface CellRow {
  duty_slot_id: string
  duty_type: DutyType
  day_of_week: DayOfWeek
  location_id: string
  location_name: string
  booking_id: string | null
  staff_id: string | null
  staff_name: string | null
  emp_no: string | null
}

// Days each duty type runs.
const DAYS_FOR_TYPE: Record<DutyType, DayOfWeek[]> = {
  break: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  lunch_a: ['Mon', 'Tue', 'Wed', 'Thu'],
  lunch_b: ['Mon', 'Tue', 'Wed', 'Thu'],
}
const TYPE_ORDER: DutyType[] = ['break', 'lunch_a', 'lunch_b']

export default function AdminMasterSchedule() {
  const [rows, setRows] = useState<CellRow[]>([])
  const [season, setSeason] = useState<'indoor' | 'outdoor' | null>(null)
  const [published, setPublished] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, { data: settings }] = await Promise.all([
      supabase.rpc('master_schedule'),
      supabase.from('app_settings').select('current_season, schedule_published').eq('id', 1).single(),
    ])
    if (error) setErr(error.message)
    setRows((data ?? []) as CellRow[])
    setSeason((settings?.current_season as 'indoor' | 'outdoor') ?? 'outdoor')
    setPublished(settings?.schedule_published ?? false)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Build a quick lookup: type → location_name → day → CellRow
  const byTypeLocDay = useMemo(() => {
    const map = new Map<DutyType, Map<string, Map<DayOfWeek, CellRow>>>()
    for (const t of TYPE_ORDER) map.set(t, new Map())
    for (const r of rows) {
      const byType = map.get(r.duty_type)!
      if (!byType.has(r.location_name)) byType.set(r.location_name, new Map())
      byType.get(r.location_name)!.set(r.day_of_week, r)
    }
    return map
  }, [rows])

  // Distinct locations per duty type (sorted).
  const locationsByType = useMemo(() => {
    const m = new Map<DutyType, string[]>()
    for (const t of TYPE_ORDER) m.set(t, [])
    for (const [t, byLoc] of byTypeLocDay) {
      m.set(t, Array.from(byLoc.keys()).sort())
    }
    return m
  }, [byTypeLocDay])

  // Aggregate counts.
  const stats = useMemo(() => {
    let total = 0
    let assigned = 0
    for (const r of rows) {
      total++
      if (r.staff_name) assigned++
    }
    return { total, assigned, empty: total - assigned }
  }, [rows])

  const onDownload = () => {
    // Build a CSV with a title row, then one section per duty type.
    // Excel opens this directly; each section is a separate block of rows.
    const today = new Date().toISOString().slice(0, 10)
    const blocks: string[] = []
    blocks.push(`Master schedule,${season ?? ''},${today}`)
    blocks.push('')

    for (const t of TYPE_ORDER) {
      const days = DAYS_FOR_TYPE[t]
      const locs = locationsByType.get(t) ?? []
      blocks.push(DUTY_TYPE_LABEL[t].toUpperCase())
      blocks.push(['Location', ...days].map(csvCell).join(','))
      for (const locName of locs) {
        const dayMap = byTypeLocDay.get(t)!.get(locName)!
        const cells = days.map((d) => dayMap.get(d)?.staff_name ?? '')
        blocks.push([locName, ...cells].map(csvCell).join(','))
      }
      blocks.push('')
    }

    // Prefix BOM so Excel opens UTF-8 names cleanly.
    const csv = '﻿' + blocks.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `master-schedule-${season ?? ''}-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title="Master schedule"
        subtitle="Read-only view of the whole week. Download a CSV to share or print outside the platform."
        actions={
          <Button onClick={onDownload} disabled={rows.length === 0}>
            Download CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {season && (
          <Badge tone={season === 'indoor' ? 'amber' : 'green'}>
            {season === 'indoor' ? 'Indoor' : 'Outdoor'} season
          </Badge>
        )}
        {published !== null && (
          <Badge tone={published ? 'green' : 'amber'}>{published ? 'Published' : 'Draft'}</Badge>
        )}
        <span className="text-slate-600">
          <strong>{stats.assigned}</strong> of <strong>{stats.total}</strong> cells filled
          {stats.empty > 0 && (
            <span className="text-slate-400"> · {stats.empty} empty</span>
          )}
        </span>
      </div>

      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          body="Add at least one in-season location to start building the schedule."
        />
      ) : (
        <div className="space-y-8">
          {TYPE_ORDER.map((t) => {
            const days = DAYS_FOR_TYPE[t]
            const locs = locationsByType.get(t) ?? []
            return (
              <section key={t}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {DUTY_TYPE_LABEL[t]}
                </h2>
                {locs.length === 0 ? (
                  <Card className="text-sm italic text-slate-500">No locations configured.</Card>
                ) : (
                  <Card className="overflow-x-auto p-0">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Location</th>
                          {days.map((d) => (
                            <th key={d} className="px-3 py-2">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {locs.map((locName) => {
                          const dayMap = byTypeLocDay.get(t)!.get(locName)!
                          return (
                            <tr key={locName}>
                              <td className="px-3 py-2 font-medium text-slate-800">{locName}</td>
                              {days.map((d) => {
                                const cell = dayMap.get(d)
                                return (
                                  <td key={d} className="px-3 py-2">
                                    {cell?.staff_name ? (
                                      <span>
                                        {cell.staff_name}
                                        <span className="ml-1 font-mono text-[10px] text-slate-400">
                                          {cell.emp_no}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="italic text-slate-300">—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function csvCell(value: string): string {
  if (value === '' || value == null) return ''
  // Quote if it contains comma, quote, or newline. Double internal quotes.
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
