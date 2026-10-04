import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { Spinner } from '../components/ui'

const Ctx = createContext({ session: null, loading: true })

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return <Ctx.Provider value={{ session, loading, user: session?.user }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

export function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-brand" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return children
}
