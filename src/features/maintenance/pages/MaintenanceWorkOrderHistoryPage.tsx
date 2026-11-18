import { useEffect, useMemo, useState } from 'react'
import { Archive, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'

type HistoryOrder = {
  id: string
  hotel_id: string
  ot_number: string
  title: string
  work_type: 'PREVENTIVE' | 'CORRECTIVE' | 'ACTUATION'
  status: 'COMPLETED' | 'REJECTED'
  completion_timing: 'ON_TIME' | 'OUT_OF_DATE' | null
  maintenance_plan_name: string | null
  apparatus_code: string | null
  apparatus_name: string | null
  reported_location_snapshot: string | null
  execution_location_snapshot: string | null
  scheduled_date: string | null
  completed_at: string | null
  assigned_user_name: string | null
}

const typeLabels: Record<HistoryOrder['work_type'], string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Correctiva',
  ACTUATION: 'Actuación',
}

function statusLabel(item: HistoryOrder) {
  if (item.status === 'REJECTED') return 'Rechazado'
  return item.completion_timing === 'OUT_OF_DATE'
    ? 'Cerrado · Fuera de fecha'
    : 'Cerrado'
}

function statusClass(item: HistoryOrder) {
  if (item.status === 'REJECTED') return 'bg-slate-200 text-slate-600'
  return item.completion_timing === 'OUT_OF_DATE'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700'
}

export default function MaintenanceWorkOrderHistoryPage() {
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const [records, setRecords] = useState<HistoryOrder[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!hotel?.id) {
      setRecords([])
      setSelectedId('')
      setLoading(false)
      setError('No se ha seleccionado un hotel de trabajo.')
      return
    }

    setLoading(true)
    setError('')

    const result = await supabase
      .from('maintenance_work_orders_resolved')
      .select('id, hotel_id, ot_number, title, work_type, status, completion_timing, maintenance_plan_name, apparatus_code, apparatus_name, reported_location_snapshot, execution_location_snapshot, scheduled_date, completed_at, assigned_user_name')
      .eq('hotel_id', hotel.id)
        .neq('work_type', 'PREVENTIVE')
      .in('status', ['COMPLETED', 'REJECTED'])
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (result.error) {
      setRecords([])
      setSelectedId('')
      setError(result.error.message)
      setLoading(false)
      return
    }

    const loaded = (result.data ?? []) as HistoryOrder[]
    setRecords(loaded)
    setSelectedId((current) => loaded.some((item) => item.id === current) ? current : (loaded[0]?.id ?? ''))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [hotel?.id])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')
    if (!query) return records

    return records.filter((item) =>
      [
        item.ot_number,
        item.title,
        item.maintenance_plan_name,
        item.apparatus_code,
        item.apparatus_name,
        item.reported_location_snapshot,
        item.execution_location_snapshot,
        item.assigned_user_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query),
    )
  }, [records, search])

  const gridIds = useMemo(() => filteredRecords.map((item) => item.id), [filteredRecords])
  const { currentIndex, moveSelection, getGridProps, getRowProps } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId,
    onSelectedIdChange: setSelectedId,
    onOpen: (id) => navigate('/maintenance/tickets/' + id),
    autoFocusFirst: true,
  })

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Archive size={18} className="shrink-0 text-slate-500" />
                  <h1 className="text-xl font-bold leading-tight sm:text-2xl">Histórico de tickets</h1>
                </div>
                <p className="text-xs text-slate-500 sm:text-sm">Tickets cerrados y rechazados del hotel actual</p>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto">
              <IconButton icon={RefreshCw} label="Actualizar" title="Actualizar" onClick={() => void load()} disabled={loading} />
              <BackButton onBack={() => navigate('/maintenance/tickets')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
          </div>
        </header>

        {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

        <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar en histórico</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ticket, equipo, mantenimiento, responsable…"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">Tickets cerrados y rechazados</div>
            <span className="text-xs text-slate-500">{filteredRecords.length} resultado{filteredRecords.length === 1 ? '' : 's'}</span>
          </div>

          <div className="p-2 md:hidden">
            <div className="max-h-[calc(100vh-250px)] space-y-2 overflow-auto">
              {filteredRecords.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate('/maintenance/tickets/' + item.id)}
                  className={'w-full rounded-xl border p-3 text-left ' + (item.id === selectedId ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-800">{item.ot_number}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-700">{item.maintenance_plan_name ?? item.title}</div>
                    </div>
                    <span className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ' + statusClass(item)}>{statusLabel(item)}</span>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">{item.apparatus_code ?? '—'} · {item.apparatus_name ?? 'Equipo no disponible'}</div>
                  <div className="mt-1 text-[10px] text-slate-500">Comunicada: {item.reported_location_snapshot || 'Sin instantánea histórica'}</div>
                  <div className="mt-1 text-[10px] text-slate-500">Intervención: {item.execution_location_snapshot || 'Sin instantánea histórica'}</div>
                  <div className="mt-1 text-[10px] text-slate-400">Finalizada: {item.completed_at ? new Date(item.completed_at).toLocaleString('es-ES') : '—'}</div>
                </button>
              ))}
              {!loading && filteredRecords.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No hay tickets finalizados.</div>}
            </div>
          </div>

          <div className="hidden md:block">
            <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
              <GridViewport className="max-h-[calc(100vh-250px)]">
                <table className="w-full min-w-[1100px] border-collapse text-xs">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5 font-semibold">Ticket</th>
                      <th className="px-3 py-2.5 font-semibold">Mantenimiento</th>
                      <th className="px-3 py-2.5 font-semibold">Equipo</th>
                      <th className="px-3 py-2.5 font-semibold">Ubicación histórica</th>
                      <th className="px-3 py-2.5 font-semibold">Fecha prevista</th>
                      <th className="px-3 py-2.5 font-semibold">Finalizada</th>
                      <th className="px-3 py-2.5 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((item) => (
                      <tr
                        key={item.id}
                        {...getRowProps(item.id)}
                        onClick={() => {
                          setSelectedId(item.id)
                          navigate('/maintenance/tickets/' + item.id)
                        }}
                        className={'cursor-pointer border-b border-slate-100 outline-none transition ' + (item.id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50')}
                      >
                        <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-800">{item.ot_number}</td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-700">{item.maintenance_plan_name ?? item.title}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{typeLabels[item.work_type]}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-700">{item.apparatus_code ?? '—'}</div>
                          <div className="text-[10px] text-slate-400">{item.apparatus_name ?? '—'}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          <div><strong>Comunicada:</strong> {item.reported_location_snapshot || 'Sin instantánea histórica'}</div>
                          <div className="mt-1 text-[10px]"><strong>Intervención:</strong> {item.execution_location_snapshot || 'Sin instantánea histórica'}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.scheduled_date ? new Date(item.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES') : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{item.completed_at ? new Date(item.completed_at).toLocaleString('es-ES') : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3"><span className={'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ' + statusClass(item)}>{statusLabel(item)}</span></td>
                      </tr>
                    ))}
                    {!loading && filteredRecords.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500">No hay tickets finalizados.</td></tr>}
                  </tbody>
                </table>
              </GridViewport>
              <div className="flex items-center justify-end gap-1 border-t border-slate-200 px-3 py-2">
                <IconButton icon={ChevronUp} label="Ticket anterior" title="Anterior" onClick={() => moveSelection(currentIndex - 1)} disabled={filteredRecords.length === 0 || currentIndex === 0} className="h-9 w-9" />
                <IconButton icon={ChevronDown} label="Ticket siguiente" title="Siguiente" onClick={() => moveSelection(currentIndex + 1)} disabled={filteredRecords.length === 0 || currentIndex === filteredRecords.length - 1} className="h-9 w-9" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
