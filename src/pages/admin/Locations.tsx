import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '../../components/ui'

type Category = 'indoor' | 'outdoor'
const CATEGORIES: Category[] = ['outdoor', 'indoor']

interface Location {
  id: string
  name: string
  category: Category
}

export default function AdminLocations() {
  const [locations, setLocations] = useState<Location[]>([])
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('outdoor')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category>('outdoor')
  const [activeCategory, setActiveCategory] = useState<Category>('outdoor')
  const [season, setSeason] = useState<Category | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [locs, { data: settings }] = await Promise.all([
      supabase.from('locations').select('id, name, category').order('name'),
      supabase.from('app_settings').select('current_season').eq('id', 1).single(),
    ])
    if (locs.error) setErr(locs.error.message)
    setLocations((locs.data ?? []) as Location[])
    setSeason((settings?.current_season as Category) ?? 'outdoor')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredLocations = useMemo(
    () => locations.filter((l) => l.category === activeCategory),
    [locations, activeCategory],
  )

  const onAddLocation = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    const name = newName.trim()
    if (!name) return
    const { error } = await supabase.from('locations').insert({ name, category: newCategory })
    if (error) {
      setErr(error.message)
      return
    }
    setNewName('')
    await load()
  }

  const onDeleteLocation = async (id: string) => {
    if (!confirm('Delete this location? Any assigned bookings will be unassigned.')) return
    const { error } = await supabase.from('locations').delete().eq('id', id)
    if (error) setErr(error.message)
    else await load()
  }

  const startEdit = (l: Location) => {
    setEditingId(l.id)
    setEditingName(l.name)
    setEditingCategory(l.category)
  }
  const cancelEdit = () => setEditingId(null)
  const saveEdit = async () => {
    if (!editingId) return
    setErr(null)
    const name = editingName.trim()
    if (!name) {
      setErr('Name cannot be empty.')
      return
    }
    const { error } = await supabase
      .from('locations')
      .update({ name, category: editingCategory })
      .eq('id', editingId)
    if (error) {
      setErr(error.message)
      return
    }
    setEditingId(null)
    await load()
  }

  return (
    <div>
      <PageHeader
        title="Locations"
        subtitle="Every location is active for break Mon–Fri and lunch Mon–Thu. Switch the catalog tab to manage indoor vs outdoor sets."
      />

      {err && <Card className="mb-4 border-rose-300 bg-rose-50 text-sm text-rose-700">{err}</Card>}

      <Card>
        <div className="mb-3 flex items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition ${
                activeCategory === c ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {c}
              {season === c && (
                <span className="ml-1.5 inline-block translate-y-[-1px] rounded bg-white/20 px-1.5 text-[10px] uppercase tracking-wide">
                  Current
                </span>
              )}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {filteredLocations.length} {activeCategory} location{filteredLocations.length === 1 ? '' : 's'}
            {season && (
              <>
                {' · current season: '}
                <Badge tone={season === 'indoor' ? 'amber' : 'green'}>{season}</Badge>
              </>
            )}
          </span>
        </div>

        <form onSubmit={onAddLocation} className="flex flex-wrap gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. 3G Zone 1"
            className="flex-1 min-w-[14rem]"
          />
          <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </Select>
          <Button type="submit">Add location</Button>
        </form>

        {filteredLocations.length === 0 ? (
          <p className="mt-3 text-sm italic text-slate-500">
            No {activeCategory} locations yet. Add one above.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {filteredLocations.map((l) => {
              if (editingId === l.id) {
                return (
                  <li
                    key={l.id}
                    className="inline-flex items-center gap-1 rounded-md border border-brand-300 bg-brand-50 px-2 py-1 text-sm"
                  >
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveEdit()
                        else if (e.key === 'Escape') cancelEdit()
                      }}
                      className="w-32 rounded border border-slate-300 bg-white px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <select
                      value={editingCategory}
                      onChange={(e) => setEditingCategory(e.target.value as Category)}
                      className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} className="capitalize">
                          {c}
                        </option>
                      ))}
                    </select>
                    <button onClick={saveEdit} className="text-emerald-700 hover:text-emerald-900" title="Save">
                      ✓
                    </button>
                    <button onClick={cancelEdit} className="text-slate-400 hover:text-slate-700" title="Cancel">
                      ✕
                    </button>
                  </li>
                )
              }
              return (
                <li
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-sm"
                >
                  <button
                    onClick={() => startEdit(l)}
                    className="hover:text-brand-700"
                    title="Click to rename or change category"
                  >
                    {l.name}
                  </button>
                  <button
                    onClick={() => onDeleteLocation(l.id)}
                    className="ml-1 text-slate-400 hover:text-rose-600"
                    aria-label={`Delete ${l.name}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {locations.length === 0 && (
        <EmptyState
          title="No locations yet"
          body="Add a few above to get started. Each location seats one person and is active every day in its season."
        />
      )}
    </div>
  )
}
