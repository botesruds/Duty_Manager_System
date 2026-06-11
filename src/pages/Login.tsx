import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmpNo } from '../lib/auth'
import { Button, Input } from '../components/ui'

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
    <div className="flex min-h-full">
      {/* Brand panel */}
      <div className="hidden w-[44%] flex-col justify-between bg-brand-900 p-10 text-white lg:flex">
        <img src="/brand/wso-mark.png" alt="WSO" className="h-10 w-auto self-start" />
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">
            Duty
            <br />
            Manager
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-200">
            Duty rostering, slot booking, swaps, and attendance for the whole
            school.
          </p>
          <div className="mt-8 h-1 w-16 rounded-full bg-gold-500" />
        </div>
        <p className="text-xs text-brand-300">
          GEMS Wellington Academy · Silicon Oasis
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/brand/wso-mark.png" alt="WSO" className="h-8 w-auto" />
            <h1 className="font-display mt-4 text-2xl font-semibold text-brand-900">
              Duty Manager
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              GEMS Wellington Academy · Silicon Oasis
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <h2 className="font-display hidden text-lg font-semibold text-brand-900 lg:block">
              Sign in
            </h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              Use your Emp No and password.
            </p>
            <div className="space-y-3">
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
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
