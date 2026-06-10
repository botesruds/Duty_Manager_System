import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'

const linkBase =
  'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition'
const linkInactive = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
const linkActive = 'bg-indigo-50 text-indigo-700'

const cls = ({ isActive }: { isActive: boolean }) =>
  `${linkBase} ${isActive ? linkActive : linkInactive}`

export default function AppLayout() {
  const { profile, staff } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const isAdmin = !!profile?.is_admin
  const isMonitor = !!profile?.is_monitor
  const [swapCount, setSwapCount] = useState(0)

  // Show teachers a badge when there are swap requests they could act on.
  // Re-checked on each navigation so it stays roughly current.
  useEffect(() => {
    if (isAdmin || isMonitor || !staff) return
    let active = true
    void supabase.rpc('actionable_swap_requests').then(({ data }) => {
      if (active) setSwapCount((data ?? []).length)
    })
    return () => {
      active = false
    }
  }, [isAdmin, isMonitor, staff, pathname])

  const handleSignOut = async () => {
    await signOut()
    nav('/login', { replace: true })
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="shrink-0 text-base font-semibold text-slate-900">
            Duty Manager
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
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
                <NavLink to="/teacher/swaps" className={cls}>
                  <span className="whitespace-nowrap">
                    Request a swap
                    {swapCount > 0 && (
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                        {swapCount}
                      </span>
                    )}
                  </span>
                </NavLink>
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
