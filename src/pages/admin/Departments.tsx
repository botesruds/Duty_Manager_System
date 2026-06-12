import { type FormEvent, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Card, EmptyState, Input, PageHeader } from '../../components/ui'

interface Dept {
  id: string
  name: string
  duty_quota_break: number
  duty_quota_lunch: number
}

export default function AdminDepartments() {
  const [rows, setRows] = useState<Dept[]>([])
  const [name, setName] = useState('')
  const [qb, setQb] = useState(0)
  const [ql, setQl] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name')
    if (error) setErr(error.message)
    else setRows(data ?? [])
  }
  useEffect(() => {
    void load()
  }, [])

  const onCreate = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    const { error } = await supabase
      .from('departments')
      .insert({ name: name.trim(), duty_quota_break: qb, duty_quota_lunch: ql })
    if (error) setErr(error.message)
    else {
      setName('')
      setQb(0)
      setQl(0)
      await load()
    }
  }

  const onUpdate = async (id: string, patch: Partial<Omit<Dept, 'id'>>) => {
    const { error } = await supabase.from('departments').update(patch).eq('id', id)
    if (error) setErr(error.message)
    else await load()
  }

  const onDelete = async (id: string) => {
    if (!confirm('Delete this department? Staff in it will become unassigned.')) return
    const { error } = await supabase.from('departments').delete().eq('id', id)
    if (error) setErr(error.message)
    else await load()
  }

  return (
    <div>
      <PageHeader title="Duty groups" subtitle="Default duty quotas per group — subjects for secondary staff, year groups for primary. Individual overrides are set on the Staff page." />

      <Card className="mb-6">
        <form onSubmit={onCreate} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Default break quota" type="number" min={0} value={qb} onChange={(e) => setQb(parseInt(e.target.value || '0', 10))} />
          <Input label="Default lunch quota" type="number" min={0} value={ql} onChange={(e) => setQl(parseInt(e.target.value || '0', 10))} />
          <div className="flex items-end">
            <Button type="submit" className="w-full">Add department</Button>
          </div>
        </form>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No duty groups yet" body="Upload the staff sheet or add one above to get started." />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Break quota</th>
                <th className="px-4 py-2">Lunch quota</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2">
                    <input
                      className="w-full border-none bg-transparent p-0 text-sm focus:ring-0"
                      defaultValue={d.name}
                      onBlur={(e) => e.target.value !== d.name && onUpdate(d.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2 w-32">
                    <input
                      type="number"
                      min={0}
                      className="w-20 border-none bg-transparent p-0 text-sm focus:ring-0"
                      defaultValue={d.duty_quota_break}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value || '0', 10)
                        if (n !== d.duty_quota_break) onUpdate(d.id, { duty_quota_break: n })
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 w-32">
                    <input
                      type="number"
                      min={0}
                      className="w-20 border-none bg-transparent p-0 text-sm focus:ring-0"
                      defaultValue={d.duty_quota_lunch}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value || '0', 10)
                        if (n !== d.duty_quota_lunch) onUpdate(d.id, { duty_quota_lunch: n })
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" onClick={() => onDelete(d.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
