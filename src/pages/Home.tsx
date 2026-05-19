import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (profile?.is_admin) return <Navigate to="/admin" replace />
  if (profile?.is_monitor) return <Navigate to="/attendance/monitor" replace />
  return <Navigate to="/teacher" replace />
}
