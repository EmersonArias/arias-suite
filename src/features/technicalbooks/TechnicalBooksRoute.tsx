import { lazy, Suspense } from 'react'

const TechnicalBooksPage = lazy(() => import('./TechnicalBooksPage'))
const BookCampaignsPage = lazy(() => import('./BookCampaignsPage'))
const BookUnitCatalogPage = lazy(() => import('./BookUnitCatalogPage'))
export default function TechnicalBooksRoute({ mode }: { mode?: 'campaigns' | 'catalog' }) {
  const Page = mode === 'campaigns' ? BookCampaignsPage : mode === 'catalog' ? BookUnitCatalogPage : TechnicalBooksPage
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Cargando libros técnicos…</p>}><Page /></Suspense>
}
