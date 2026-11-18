import { useEffect, useRef, useState, type ReactNode } from 'react'
import DemoActivityTracker from './DemoActivityTracker'
import { demoActivity } from '../../core/access/demoActivityClient'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthProvider'
import { DEMO_READ_ONLY_EVENT, DEMO_READ_ONLY_MESSAGE, isDemoMutationLabel, isDemoUser } from '../../core/access/demoReadOnly'

export default function ReadOnlyDemoGuard({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const demo = isDemoUser(session?.user.id)
  const [notice, setNotice] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const show = () => { if (demo) setNotice(true) }
    window.addEventListener(DEMO_READ_ONLY_EVENT, show)
    return () => window.removeEventListener(DEMO_READ_ONLY_EVENT, show)
  }, [demo])
  useEffect(() => {
    if (notice && demo) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.current?.showModal()
    } else {
      dialog.current?.close()
      returnFocus.current?.focus()
    }
  }, [notice, demo])
  return <div onClickCapture={event => {
    if (!demo) return
    const target = event.target instanceof Element ? event.target.closest('button, [role="button"], input[type="submit"]') : null
    if (!target || target.closest('[data-demo-notice]')) return
    const label = target.getAttribute('aria-label') || target.textContent || target.getAttribute('title') || ''
    if (/pdf|imprimir|exportar/i.test(label)) demoActivity.report('PDF_REQUEST', pathname)
    if (isDemoMutationLabel(label)) { event.preventDefault(); event.stopPropagation(); demoActivity.report('WRITE_BLOCKED', pathname); setNotice(true) }
  }} onSubmitCapture={event => { if (demo) { event.preventDefault(); event.stopPropagation(); demoActivity.report('WRITE_BLOCKED', pathname); setNotice(true) } }}>
    <DemoActivityTracker />
    {demo && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">Usuario de prueba · Solo consulta. Puedes ver y generar PDF. La actividad de navegación se registra.</p>}
    {children}
    <dialog ref={dialog} data-demo-notice aria-labelledby="demo-notice-title" onCancel={() => setNotice(false)} onClose={() => setNotice(false)} className="m-auto w-[min(92vw,420px)] rounded-2xl border-0 p-6 text-slate-800 shadow-xl backdrop:bg-slate-950/40">
      <h2 id="demo-notice-title" className="text-lg font-bold">Usuario de prueba</h2>
      <p className="mt-3 text-sm leading-6">{DEMO_READ_ONLY_MESSAGE}</p>
      <button type="button" autoFocus onClick={() => setNotice(false)} className="mt-5 min-h-11 rounded-xl bg-sky-800 px-5 py-2 font-semibold text-white">Entendido</button>
    </dialog>
  </div>
}
