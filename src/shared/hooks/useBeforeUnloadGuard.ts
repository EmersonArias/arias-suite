import { SUITE_NAVIGATION_EVENT } from '../navigation/navigationGuard'
import { useEffect } from 'react'

export function useBeforeUnloadGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    const handleSuiteNavigation = (event: Event) => {
      if (!event.defaultPrevented && !window.confirm('Tienes cambios sin guardar. ¿Quieres salir de esta pantalla y descartarlos?')) event.preventDefault()
    }
    window.addEventListener(SUITE_NAVIGATION_EVENT, handleSuiteNavigation)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener(SUITE_NAVIGATION_EVENT, handleSuiteNavigation)
    }
  }, [enabled])
}
