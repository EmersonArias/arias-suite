import { lazy, Suspense } from 'react'

const TechnicalBooksPage = lazy(() => import('./TechnicalBooksPage'))
export default function TechnicalBooksRoute() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Cargando libros técnicos…</p>}><TechnicalBooksPage /></Suspense>
}
