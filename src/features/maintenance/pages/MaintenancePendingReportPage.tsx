import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Printer } from 'lucide-react'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import PrintReportFooter from '../../../shared/components/reports/PrintReportFooter'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { useAuth } from '../../auth/context/AuthProvider'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'

type PendingItem = {
  id: string
  hotel_id: string
  location: string | null
  category: string | null
  pending: string
  status: 'PENDING' | 'COMPLETED'
  assigned_to: string | null
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  observation: string | null
  source_date: string | null
  active: boolean
  source_status: string | null
}

const statusLabels = { PENDING: 'Pendiente', COMPLETED: 'Terminado' } as const
const priorityLabels = { LOW: 'Baja', NORMAL: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' } as const

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value + 'T12:00:00').toLocaleDateString('es-ES')
}

function getParam(params: URLSearchParams, key: string, fallback = '') {
  return params.get(key) ?? fallback
}

export default function MaintenancePendingReportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const { hotel } = useHotelScope()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const scope = getParam(params, 'scope', 'FILTERED') as 'FILTERED' | 'ALL'
  const search = getParam(params, 'search').trim().toLocaleLowerCase('es')
  const category = getParam(params, 'category', 'ALL')
  const priority = getParam(params, 'priority', 'ALL')
  const assigned = getParam(params, 'assigned', 'ALL')
  const status = getParam(params, 'status', 'PENDING')
  const history = getParam(params, 'history') === '1'
  const blocked = getParam(params, 'blocked', 'ALL') as 'ALL' | 'BLOCKED' | 'UNBLOCKED'

  const [records, setRecords] = useState<PendingItem[]>([])
  const [blockedRooms, setBlockedRooms] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadRecords() {
      if (!hotel?.id) {
        setRecords([])
        setErrorMessage('No se ha seleccionado un hotel de trabajo.')
        setLoading(false)
        return
      }
      setLoading(true)
      setErrorMessage('')
      const [itemsResult, blockedResult] = await Promise.all([
        supabase
          .from('maintenance_pending_items')
          .select('id, hotel_id, location, category, pending, status, assigned_to, priority, observation, source_date, active, source_status')
          .eq('hotel_id', hotel.id)
          .order('source_date', { ascending: true, nullsFirst: false })
          .order('source_row', { ascending: true }),
        supabase
          .from('maintenance_blocked_rooms')
          .select('room_number')
          .eq('hotel_id', hotel.id)
          .order('room_number', { ascending: true }),
      ])
      if (cancelled) return
      if (itemsResult.error || blockedResult.error) {
        setErrorMessage(`Error cargando el informe: ${itemsResult.error?.message || blockedResult.error?.message}`)
        setRecords([])
        setBlockedRooms(new Set())
      } else {
        setRecords((itemsResult.data ?? []) as PendingItem[])
        setBlockedRooms(new Set((blockedResult.data ?? []).map((row) => row.room_number.trim())))
      }
      setLoading(false)
    }
    void loadRecords()
    return () => { cancelled = true }
  }, [hotel?.id])

  const reportRecords = useMemo(() => records.filter((item) => {
    if (item.active === history) return false
    if (scope === 'FILTERED') {
      if (status !== 'ALL' && item.status !== status) return false
      if (category !== 'ALL' && item.category !== category) return false
      if (priority === 'HIGH_OR_CRITICAL' && item.priority !== 'HIGH' && item.priority !== 'CRITICAL') return false
      if (priority !== 'ALL' && priority !== 'HIGH_OR_CRITICAL' && item.priority !== priority) return false
      if (assigned !== 'ALL' && (item.assigned_to ?? 'UNASSIGNED') !== assigned) return false

      const roomLocation = item.location?.trim() ?? ''
      const roomIsBlocked = /^[0-9]{3,4}$/.test(roomLocation) && blockedRooms.has(roomLocation)
      if (blocked === 'BLOCKED' && !roomIsBlocked) return false
      if (blocked === 'UNBLOCKED' && (!/^[0-9]{3,4}$/.test(roomLocation) || roomIsBlocked)) return false

      if (search && ![item.location, item.category, item.pending, item.assigned_to, item.observation, item.source_status]
        .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(search)) return false
    }
    return true
  }), [records, history, scope, status, category, priority, assigned, search, blocked, blockedRooms])

  return (
    <div className="arias-report-page min-h-screen bg-white text-slate-900 print:bg-white">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 print:max-w-none print:p-0">
        <div className="mb-3 flex flex-col gap-2 border-b pb-2 print:mb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-10" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">Pendientes</h1>
              <p className="text-xs text-slate-500">Informe de mantenimiento{hotel?.name ? ` · ${hotel.name}` : ''}</p>
              <p className="text-[11px] text-slate-400">Generado por: {session?.user.fullName || session?.user.email || 'Usuario'}</p>
            </div>
          </div>
          <div className="arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto print:hidden sm:w-auto sm:justify-end">
            <ActionButton icon={Printer} label="PDF" tone="dark" onClick={() => window.print()} disabled={loading || !!errorMessage} />
            <BackButton onBack={() => navigate('/maintenance/pending')} />
            <HomeButton onHome={() => navigate('/')} />
          </div>
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-500">Preparando informe…</div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{errorMessage}</div>
        ) : (
          <>
            <div className="mb-2 grid gap-2 text-xs leading-tight sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Ámbito</div>
                <div className="font-semibold leading-tight">{scope === 'FILTERED' ? 'Registros filtrados' : 'Todos los pendientes'}</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Registros</div>
                <div className="font-semibold leading-tight">{reportRecords.length}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-400 text-left">
                    <th className="px-2 py-1.5">Ubicación</th>
                    <th className="px-2 py-1.5">Categoría</th>
                    <th className="px-2 py-1.5">Pendiente</th>
                    <th className="px-2 py-1.5">Estado</th>
                    <th className="px-2 py-1.5">Asignado a</th>
                    <th className="px-2 py-1.5">Prioridad</th>
                    <th className="px-2 py-1.5">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRecords.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200 break-inside-avoid print:break-inside-avoid">
                      <td className="whitespace-nowrap px-2 py-1.5 font-semibold">{item.location || '—'}</td>
                      <td className="px-2 py-1.5">{item.category || '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{item.pending}</div>
                        {item.observation && <div className="text-[10px] text-slate-500">{item.observation}</div>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">{statusLabels[item.status]}</td>
                      <td className="px-2 py-1.5">{item.assigned_to || 'Sin asignar'}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{priorityLabels[item.priority]}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{formatDate(item.source_date)}</td>
                    </tr>
                  ))}
                  {reportRecords.length === 0 && <tr><td colSpan={7} className="px-2 py-4 text-center text-slate-500">No hay registros para este informe.</td></tr>}
                </tbody>
              </table>
            </div>
            <PrintReportFooter />
          </>
        )}
      </div>
    </div>
  )
}
