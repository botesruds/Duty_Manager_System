import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'

interface Props {
  children: ReactNode
  requireAdmin?: boolean
  requireMonitor?: boolean
  /** Booking pages are for teachers only — admins and monitors don't do duties. */
  teacherOnly?: boolean
}

export function ProtectedRoute({ children, requireAdmin, requireMonitor, teacherOnly }: Props) {
  const { session, profile, staff, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-slate-500">Loading…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  // Force password change for staff with the flag set, except on the change-password route itself.
  if (
    staff?.must_change_password &&
    location.pathname !== '/change-password'
  ) {
    return <Navigate to="/change-password" replace />
  }
  if (requireAdmin && !profile?.is_admin) {
    return <Navigate to="/" replace />
  }
  if (requireMonitor && !(profile?.is_monitor || profile?.is_admin)) {
    return <Navigate to="/" replace />
  }
  if (teacherOnly && (profile?.is_admin || profile?.is_monitor)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
