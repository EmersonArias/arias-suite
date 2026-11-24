import { lazy, Suspense } from 'react'

const BookReportsPage = lazy(() => import('../../technicalbooks/BookReportsPage'))

export default function MaintenanceRecordPage() {
  return <Suspense fallback={<p className="p-4" role="status">Cargando reportes…</p>}><BookReportsPage /></Suspense>
}
