import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

export default function FullscreenButton() {
  const [active, setActive] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => {
      setActive(!!document.fullscreenElement)
      setUnavailable(!document.fullscreenEnabled)
    }
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  async function toggle() {
    if (busy || unavailable) return
    setBusy(true)
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // A browser may deny fullscreen without affecting the page or its data.
    } finally {
      setBusy(false)
    }
  }

  const label = unavailable ? 'Pantalla completa no disponible en este navegador'
    : active ? 'Salir de pantalla completa' : 'Pantalla completa'
  const Icon = active ? Minimize2 : Maximize2
  return <button type="button" onClick={() => void toggle()} disabled={unavailable || busy}
    aria-label={label} title={label} aria-pressed={active}
    className="arias-control-3d arias-fullscreen-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
    <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
  </button>
}
