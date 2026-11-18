import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import IconButton from '../../../shared/components/buttons/IconButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import {
  fromDatabase,
  matchesDateFilter,
  REVIEW_ITEMS,
  statusClass,
  statusLabel,
  type ElectricalPanel,
} from '../lib/electricalPanels'

export default function ElectricalPanelsPage() {
  const navigate = useNavigate()
  const { confirm } = useSystemDialog()

  const [panels, setPanels] = useState<ElectricalPanel[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [reviewId, setReviewId] = useState('ALL')
  const [reviewState, setReviewState] = useState<
    'ALL' | 'CHECKED' | 'PENDING'
  >('ALL')
  const [reportScope, setReportScope] = useState<
    'SELECTED' | 'FILTERED' | 'ALL'
  >('FILTERED')

  async function loadPanels() {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('electrical_panels')
      .select('*')
      .order('code', { ascending: true })

    if (error) {
      setErrorMessage(`Error cargando cuadros: ${error.message}`)
      setLoading(false)
      return
    }

    const loaded = (data ?? []).map((row) =>
      fromDatabase(row as never),
    )

    setPanels(loaded)

    setSelectedId((current) =>
      current &&
      loaded.some((panel) => panel.id === current)
        ? current
        : loaded[0]?.id ?? '',
    )

    setLoading(false)
  }

  useEffect(() => {
    void loadPanels()
  }, [])

  const filteredPanels = useMemo(() => {
    return panels.filter((panel) => {
      if (
        !matchesDateFilter(
          panel.inspectionDate,
          dateFrom,
          dateTo,
        )
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
  }, [
    panels,
    dateFrom,
    dateTo,
    reviewId,
    reviewState,
  ])

  const selected =
    panels.find((panel) => panel.id === selectedId) ??
    null

  const gridIds = useMemo(() => filteredPanels.map((panel) => panel.id), [filteredPanels])
  const { currentIndex, moveSelection, getGridProps, getRowProps } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId,
    onSelectedIdChange: setSelectedId,
    onOpen: (id) => navigate(`/electricalpanels/${id}`),
    autoFocusFirst: true,
  })

  const handleModify = () => {
    if (!selected) {
      setErrorMessage('Selecciona un registro.')
      return
    }

    navigate(`/electricalpanels/${selected.id}`)
  }

  const handleDelete = async () => {
    if (!selected) {
      setErrorMessage('Selecciona un registro.')
      return
    }

    const confirmed = await confirm({
      title: 'Eliminar registro',
      message: `¿Quieres eliminar el registro ${selected.code}? Esta acción no se puede deshacer.`,
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('electrical_panels')
      .delete()
      .eq('id', selected.id)

    if (error) {
      setErrorMessage(
        `Error eliminando el registro: ${error.message}`,
      )
      return
    }

    const remaining = panels.filter(
      (panel) => panel.id !== selected.id,
    )

    setPanels(remaining)
    setSelectedId(remaining[0]?.id ?? '')
    setErrorMessage('')
  }

  const handleReport = () => {
    if (reportScope === 'SELECTED' && !selectedId) {
      setErrorMessage(
        'Selecciona un registro para generar el reporte.',
      )
      return
    }

    const params = new URLSearchParams()

    params.set('scope', reportScope)

    if (selectedId) {
      params.set('selectedId', selectedId)
    }

    if (dateFrom) {
      params.set('from', dateFrom)
    }

    if (dateTo) {
      params.set('to', dateTo)
    }

    if (reviewId !== 'ALL') {
      params.set('review', reviewId)
    }

    if (reviewState !== 'ALL') {
      params.set('reviewState', reviewState)
    }

    navigate(
      `/electricalpanels/report?${params.toString()}`,
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo
                onActivate={() => navigate('/')}
                className="h-12 w-auto shrink-0 object-contain sm:h-14"
              />

              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                  Cuadros Eléctricos BT
                </h1>
                <p className="text-sm text-slate-500">
                  Registros
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  navigate('/electricalpanels/new')
                }
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                Nuevo
              </button>

              <button
                type="button"
                onClick={handleModify}
                disabled={!selected}
                className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              >
                Modificar
              </button>

              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={!selected}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              >
                Eliminar
              </button>

              <button
                type="button"
                onClick={handleReport}
                disabled={loading}
                className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              >
                PDF
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                Salir
              </button>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mb-4 rounded-2xl bg-white p-4 shadow-lg">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Desde
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) =>
                  setDateFrom(e.target.value)
                }
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Hasta
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) =>
                  setDateTo(e.target.value)
                }
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5"
              />
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Revisión
              </span>
              <select
                value={reviewId}
                onChange={(e) =>
                  setReviewId(e.target.value)
                }
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5"
              >
                <option value="ALL">Todas</option>
                {REVIEW_ITEMS.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Comprobación
              </span>
              <select
                value={reviewState}
                onChange={(e) =>
                  setReviewState(
                    e.target.value as
                      | 'ALL'
                      | 'CHECKED'
                      | 'PENDING',
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5"
              >
                <option value="ALL">Todas</option>
                <option value="CHECKED">Comprobado</option>
                <option value="PENDING">Pendiente</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Reporte
              </span>
              <select
                value={reportScope}
                onChange={(e) =>
                  setReportScope(
                    e.target.value as
                      | 'SELECTED'
                      | 'FILTERED'
                      | 'ALL',
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5"
              >
                <option value="SELECTED">
                  Seleccionado
                </option>
                <option value="FILTERED">
                  Según filtros
                </option>
                <option value="ALL">Todos</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
            <span>
              Registros:{' '}
              <strong className="text-slate-800">
                {filteredPanels.length}
              </strong>
            </span>

            <span>
              Seleccionado:{' '}
              <strong className="text-slate-800">
                {selected?.code ?? '—'}
              </strong>
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
          <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
            <GridViewport className="max-h-[calc(100vh-330px)] min-h-[300px]">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-3 text-left font-bold text-slate-700">
                    Código
                  </th>
                  <th className="p-3 text-left font-bold text-slate-700">
                    Cuadro
                  </th>
                  <th className="p-3 text-left font-bold text-slate-700">
                    Ubicación
                  </th>
                  <th className="p-3 text-left font-bold text-slate-700">
                    Estado
                  </th>
                  <th className="p-3 text-left font-bold text-slate-700">
                    Última revisión
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredPanels.map((panel) => (
                  <tr
                    key={panel.id}
                    {...getRowProps(panel.id)}
                    onClick={() => {
                      setSelectedId(panel.id)
                      navigate(`/electricalpanels/${panel.id}`)
                    }}
                    className={`cursor-pointer border-t border-slate-200 transition hover:bg-slate-50 ${
                      selectedId === panel.id
                        ? 'bg-blue-50'
                        : 'bg-white'
                    }`}
                  >
                    <td className="p-3 font-semibold text-slate-900">
                      {panel.code}
                    </td>
                    <td className="p-3 text-slate-800">
                      {panel.name || 'Sin identificar'}
                    </td>
                    <td className="p-3 text-slate-600">
                      {panel.location || '—'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClass(
                          panel.status,
                        )}`}
                      >
                        {statusLabel(panel.status)}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">
                      {panel.inspectionDate
                        ? panel.inspectionDate
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </GridViewport>
            <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
              <span className="text-[11px] text-slate-500">
                {filteredPanels.length === 0 ? 'Sin registros' : `${currentIndex + 1} / ${filteredPanels.length}`}
              </span>
              <div className="flex items-center gap-1">
                <IconButton icon={ChevronUp} label="Registro anterior" title="Anterior" onClick={() => moveSelection(currentIndex - 1)} disabled={filteredPanels.length === 0 || currentIndex === 0} className="h-9 w-9" />
                <IconButton icon={ChevronDown} label="Registro siguiente" title="Siguiente" onClick={() => moveSelection(currentIndex + 1)} disabled={filteredPanels.length === 0 || currentIndex === filteredPanels.length - 1} className="h-9 w-9" />
              </div>
            </div>
          </div>

          {!loading &&
            filteredPanels.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                No hay registros para los filtros seleccionados.
              </div>
            )}

          {loading && (
            <div className="p-10 text-center text-slate-500">
              Cargando registros...
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
