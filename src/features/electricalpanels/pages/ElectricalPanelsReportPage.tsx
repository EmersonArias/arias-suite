import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { useAuth } from '../../auth/context/AuthProvider'
import PrintReportFooter from '../../../shared/components/reports/PrintReportFooter'
import {
  formatDate,
  fromDatabase,
  REVIEW_ITEMS,
  statusClass,
  statusLabel,
  type ElectricalPanel,
} from '../lib/electricalPanels'

export default function ElectricalPanelsReportPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const { session } = useAuth()

  const [panels, setPanels] = useState<
    ElectricalPanel[]
  >([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const scope =
    searchParams.get('scope') ?? 'FILTERED'
  const selectedId =
    searchParams.get('selectedId') ?? ''
  const dateFrom =
    searchParams.get('from') ?? ''
  const dateTo =
    searchParams.get('to') ?? ''
  const reviewId =
    searchParams.get('review') ?? 'ALL'
  const reviewState =
    searchParams.get('reviewState') ?? 'ALL'

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('electrical_panels')
        .select('*')
        .order('code', { ascending: true })

      if (error) {
        setErrorMessage(
          `Error cargando el reporte: ${error.message}`,
        )
        setLoading(false)
        return
      }

      setPanels(
        (data ?? []).map((row) =>
          fromDatabase(row as never),
        ),
      )
      setLoading(false)
    }

    void load()
  }, [])

  const reportPanels = useMemo(() => {
    let result = panels

    if (scope === 'SELECTED') {
      result = result.filter(
        (panel) => panel.id === selectedId,
      )
    }

    if (scope !== 'SELECTED') {
      result = result.filter((panel) => {
        if (
          dateFrom &&
          (!panel.inspectionDate ||
            panel.inspectionDate < dateFrom)
        ) {
          return false
        }

        if (
          dateTo &&
          (!panel.inspectionDate ||
            panel.inspectionDate > dateTo)
        ) {
          return false
        }

        if (reviewId !== 'ALL') {
          const review = panel.reviews.find(
            (item) => item.id === reviewId,
          )

          if (!review) return false

          if (
            reviewState === 'CHECKED' &&
            !review.checked
          ) {
            return false
          }

          if (
            reviewState === 'PENDING' &&
            review.checked
          ) {
            return false
          }
        }

        return true
      })
    }

    return result
  }, [
    panels,
    scope,
    selectedId,
    dateFrom,
    dateTo,
    reviewId,
    reviewState,
  ])

  const selectedReview =
    REVIEW_ITEMS.find(
      (item) => item.id === reviewId,
    )

  const printReport = () => {
    window.print()
  }

  return (
    <div className="arias-report-page min-h-screen bg-slate-100 p-3 sm:p-5 print:bg-white print:p-0">
        <style>{`
          @page {
            size: A4 landscape;
            margin: 14mm 10mm 8mm 10mm;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        `}</style>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-lg print:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Reporte Cuadros Eléctricos BT
              </h1>

              <div className="mt-1 text-sm text-slate-500">
                {scope === 'SELECTED'
                  ? 'Registro seleccionado'
                  : scope === 'ALL'
                    ? 'Todos los registros'
                    : 'Registros según filtros'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={printReport}
                disabled={
                  reportPanels.length === 0
                }
                className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white shadow-md hover:bg-slate-800 disabled:opacity-50"
              >
                PDF
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate('/electricalpanels')
                }
                className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white shadow-md hover:bg-black"
              >
                Salir
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              Desde:{' '}
              {dateFrom
                ? formatDate(dateFrom)
                : '—'}
            </div>

            <div>
              Hasta:{' '}
              {dateTo
                ? formatDate(dateTo)
                : '—'}
            </div>

            <div>
              Revisión:{' '}
              {selectedReview?.name ?? 'Todas'}
            </div>

            <div>
              Comprobación:{' '}
              {reviewState === 'CHECKED'
                ? 'Comprobado'
                : reviewState === 'PENDING'
                  ? 'Pendiente'
                  : 'Todas'}
            </div>

            <div>
              Registros:{' '}
              <strong>
                {reportPanels.length}
              </strong>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 print:hidden">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-lg print:hidden">
            Cargando...
          </div>
        ) : reportPanels.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-lg print:hidden">
            No hay registros que coincidan con los
            criterios.
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-4 shadow-lg print:rounded-none print:p-0 print:shadow-none">
            <div className="mb-5 flex items-center justify-between gap-6 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-4">
                <BrandLogo
                  onActivate={() => navigate('/')}
                  className="h-9 w-auto object-contain print:h-7"
                />

                <div>
                  <div className="text-lg font-bold">
                    HOTEL SB DIAGONAL ZERO
                  </div>
                  <div className="text-base font-semibold">
                    CUADROS ELÉCTRICOS BT — REVISIÓN ANUAL
                  </div>
                </div>
              </div>

              <div className="text-right text-sm text-slate-600">
                <div>Generado por: {session?.user.fullName || session?.user.email || 'Usuario'}</div>
                <div>
                  Registros: {reportPanels.length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse text-[10px] print:text-[8px]">
                <thead>
                  <tr className="bg-slate-100 print:bg-slate-200">
                    <th className="border border-slate-400 px-2 py-1">
                      CÓDIGO
                    </th>

                    <th className="border border-slate-400 px-2 py-1 text-left">
                      CUADRO
                    </th>

                    <th className="border border-slate-400 px-2 py-1 text-left">
                      UBICACIÓN
                    </th>

                    {REVIEW_ITEMS.map(
                      (item, index) => (
                        <th
                          key={item.id}
                          className="border border-slate-400 px-1 py-1 text-center"
                          title={item.sourceName}
                        >
                          {index + 1}
                        </th>
                      ),
                    )}

                    <th className="border border-slate-400 px-2 py-1">
                      ESTADO
                    </th>

                    <th className="border border-slate-400 px-2 py-1">
                      REV.
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {reportPanels.map((panel) => (
                    <tr
                      key={panel.id}
                      className="break-inside-avoid"
                    >
                      <td className="border border-slate-400 px-2 py-1 text-center font-semibold">
                        {panel.code}
                      </td>

                      <td className="border border-slate-400 px-2 py-1 font-semibold">
                        {panel.name ||
                          'Sin identificar'}
                      </td>

                      <td className="border border-slate-400 px-2 py-1">
                        {panel.location || '—'}
                      </td>

                      {panel.reviews.map(
                        (review) => (
                          <td
                            key={review.id}
                            className="border border-slate-400 px-1 py-1 text-center font-bold"
                          >
                            {review.checked
                              ? '✓'
                              : ''}
                          </td>
                        ),
                      )}

                      <td className="border border-slate-400 px-2 py-1 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold print:bg-transparent print:p-0 print:text-black ${statusClass(
                            panel.status,
                          )}`}
                        >
                          {statusLabel(
                            panel.status,
                          )}
                        </span>
                      </td>

                      <td className="border border-slate-400 px-2 py-1 text-center">
                        {panel.inspectionDate
                          ? formatDate(
                              panel.inspectionDate,
                            )
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-2 text-[9px] text-slate-700 print:text-[8px] sm:grid-cols-2">
              {REVIEW_ITEMS.map(
                (item, index) => (
                  <div key={item.id}>
                    <strong>{index + 1}.</strong>{' '}
                    {item.sourceName}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
        <PrintReportFooter />
      </div>
    </div>
  )
}
