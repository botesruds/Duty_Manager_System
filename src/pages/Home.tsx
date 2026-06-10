import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (profile?.is_admin) return <Navigate to="/admin" replace />
  if (profile?.is_monitor) return <Navigate to="/attendance/monitor" replace />
  // Right after sign-in the session lands before the profile lookup finishes.
  // Routing on a missing profile here used to dump admins on the teacher page —
  // wait for the role before deciding.
  if (session && !profile) {
    return <div className="grid h-full place-items-center text-sm text-slate-500">Loading…</div>
  }
  return <Navigate to="/teacher" replace />
}
