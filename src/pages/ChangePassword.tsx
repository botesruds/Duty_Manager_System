import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { changePassword } from '../lib/auth'
import { Button, Card, Input } from '../components/ui'

export default function ChangePassword() {
  const nav = useNavigate()
  const { staff, refresh } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (pw !== pw2) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error } = await changePassword(pw, staff?.id ?? null)
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    await refresh()
    nav('/', { replace: true })
  }

  return (
    <div className="grid min-h-full place-items-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Set a new password</h1>
        <p className="mb-4 text-sm text-slate-600">
          You're using the default password. Choose a new one to continue.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            minLength={8}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
