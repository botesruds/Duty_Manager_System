import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../lib/auth'

const linkBase =
  'rounded-md px-3 py-1.5 text-sm font-medium transition'
const linkInactive = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
const linkActive = 'bg-indigo-50 text-indigo-700'

const cls = ({ isActive }: { isActive: boolean }) =>
  `${linkBase} ${isActive ? linkActive : linkInactive}`

export default function AppLayout() {
  const { profile, staff } = useAuth()
  const nav = useNavigate()
  const isAdmin = !!profile?.is_admin
  const isMonitor = !!profile?.is_monitor

  const handleSignOut = async () => {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-base font-semibold text-slate-900">
            Duty Manager
          </Link>
          <nav className="flex items-center gap-1">
            {isAdmin && (
              <>
                <NavLink to="/admin" end className={cls}>Overview</NavLink>
                <NavLink to="/admin/staff" className={cls}>Staff</NavLink>
                <NavLink to="/admin/departments" className={cls}>Departments</NavLink>
                <NavLink to="/admin/locations" className={cls}>Locations</NavLink>
                <NavLink to="/admin/bookings" className={cls}>Bookings</NavLink>
                <NavLink to="/admin/schedule" className={cls}>Schedule</NavLink>
                <NavLink to="/admin/master" className={cls}>Master</NavLink>
                <NavLink to="/admin/attendance" className={cls}>Attendance</NavLink>
              </>
            )}
            {!isAdmin && !isMonitor && (
              <>
                <NavLink to="/teacher" end className={cls}>Dashboard</NavLink>
                <NavLink to="/teacher/slots" className={cls}>Browse slots</NavLink>
                <NavLink to="/teacher/swaps" className={cls}>Request a swap</NavLink>
                <NavLink to="/attendance/self" className={cls}>Self report</NavLink>
              </>
            )}
            {(isMonitor || isAdmin) && (
              <NavLink to="/attendance/monitor" className={cls}>Check-in</NavLink>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {staff?.name ?? (isAdmin ? 'Admin' : isMonitor ? 'Monitor' : '')}
            </span>
            <button onClick={handleSignOut} className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
