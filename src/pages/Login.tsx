import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmpNo } from '../lib/auth'
import { Button, Card, Input } from '../components/ui'

export default function Login() {
  const nav = useNavigate()
  const [empNo, setEmpNo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signInWithEmpNo(empNo.trim(), password)
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    nav('/', { replace: true })
  }

  return (
    <div className="grid min-h-full place-items-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Duty Manager</h1>
        <p className="mb-4 text-sm text-slate-600">Sign in with your Emp No.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Emp No"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="username"
            value={empNo}
            onChange={(e) => setEmpNo(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="pt-2 text-xs text-slate-500">
            Forgotten password? Ask an admin to reset it.
          </p>
        </form>
      </Card>
    </div>
  )
}
