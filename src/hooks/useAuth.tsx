import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Staff = Database['public']['Tables']['staff']['Row']

interface AuthState {
  session: Session | null
  profile: Profile | null
  staff: Staff | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (sess: Session | null) => {
    if (!sess) {
      setProfile(null)
      setStaff(null)
      return
    }
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', sess.user.id)
      .maybeSingle()
    setProfile(prof ?? null)
    if (prof?.staff_id) {
      const { data: st } = await supabase
        .from('staff')
        .select('*')
        .eq('id', prof.staff_id)
        .maybeSingle()
      setStaff(st ?? null)
    } else {
      setStaff(null)
    }
  }

  const refresh = async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    await loadProfile(data.session)
  }

  useEffect(() => {
    // onAuthStateChange fires an INITIAL_SESSION event synchronously on subscribe with the
    // current session from storage. Relying on it (instead of awaiting getSession in the
    // effect body) avoids a known hang under React 19 StrictMode's double-mount.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess)
      loadProfile(sess).finally(() => setLoading(false))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, staff, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
