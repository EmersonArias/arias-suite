import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthProvider'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { demoActivity } from '../../core/access/demoActivityClient'
export default function DemoActivityTracker() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  useEffect(() => {
    if (!isDemoUser(session?.user.id)) { demoActivity.reset(); return }
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    demoActivity.routeOpened(pathname, navigation?.type === 'reload')
    const visible = () => { if (document.visibilityState === 'visible') demoActivity.report('APP_RESUME', pathname) }
    document.addEventListener('visibilitychange', visible)
    return () => document.removeEventListener('visibilitychange', visible)
  }, [session?.user.id, pathname])
  return null
}
