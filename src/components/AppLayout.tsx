import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'

const linkBase =
  'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors'
const linkInactive = 'text-brand-200 hover:bg-white/10 hover:text-white'
const linkActive = 'bg-white/15 text-white'

const cls = ({ isActive }: { isActive: boolean }) =>
  `${linkBase} ${isActive ? linkActive : linkInactive}`

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

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

  const displayName = staff?.name ?? (isAdmin ? 'Admin' : isMonitor ? 'Monitor' : '')

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-brand-800 bg-brand-900 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/brand/wso-mark.png" alt="WSO" className="h-[18px] w-auto" />
            <span className="font-display text-sm font-semibold tracking-tight text-white">
              Duty Manager
            </span>
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
                      <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-brand-900">
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
            {displayName && (
              <span
                className="hidden h-8 w-8 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-brand-900 sm:flex"
                title={displayName}
              >
                {initials(displayName)}
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="text-sm text-brand-200 transition-colors hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
