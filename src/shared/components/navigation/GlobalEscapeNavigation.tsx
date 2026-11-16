import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const PUBLIC_PATHS = new Set([
  '/login',
  '/activate',
  '/forgot-password',
  '/update-password',
])

export default function GlobalEscapeNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented) return
      if (PUBLIC_PATHS.has(location.pathname)) return
      if (location.pathname === '/') return
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return

      event.preventDefault()
      navigate(-1)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [location.pathname, navigate])

  return null
}
