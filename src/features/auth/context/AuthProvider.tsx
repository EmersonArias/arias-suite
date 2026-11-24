import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AriasSession } from '../../../core/auth/authService'
import { ariasAuth } from '../../../core/auth/authService'

type AuthContextValue = {
  session: AriasSession | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AriasSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      const { data: restoredSession, error } = await ariasAuth.getSession()
      if (!mounted) return

      if (error || !restoredSession) {
        setSession(null)
        setLoading(false)
        return
      }

      const profileCheck = await ariasAuth.isProfileActive(restoredSession.user.id)

      if (!mounted) return

      if (profileCheck.data === false) {
        await ariasAuth.signOut()
        if (mounted) setSession(null)
      } else {
        // A transient profile-query error must never close a valid Auth session.
        // The session is the source of truth for persistence; authorization is checked separately.
        setSession(restoredSession)
      }

      if (mounted) setLoading(false)
    }

    void restoreSession()

    const subscription = ariasAuth.onAuthStateChange((nextSession) => {
      if (!mounted) return

      if (!nextSession) {
        setSession(null)
        setLoading(false)
        return
      }

      void ariasAuth.isProfileActive(nextSession.user.id).then((profileCheck) => {
        if (!mounted) return

        if (profileCheck.data === false) {
          void ariasAuth.signOut()
          setSession(null)
          setLoading(false)
          return
        }

        // Never sign out because a profile lookup temporarily failed.
        setSession(nextSession)
        setLoading(false)
      })
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ session, loading }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  return context
}
