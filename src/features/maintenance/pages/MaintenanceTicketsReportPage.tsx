import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import PrintReportFooter from '../../../shared/components/reports/PrintReportFooter'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { useAuth } from '../../auth/context/AuthProvider'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'

type TicketReportRow = {
  id: string
  ot_number: string
  title: string
  work_type: 'PREVENTIVE' | 'CORRECTIVE' | 'ACTUATION'
  status: 'PENDING' | 'IN_MANAGEMENT' | 'IN_PROGRESS'
  scheduled_date: string | null
  assigned_user_name: string | null
  maintenance_plan_name: string | null
  apparatus_code: string | null
  apparatus_name: string | null
  reported_location_snapshot: string | null
}

const statusLabels: Record<TicketReportRow['status'], string> = {
  PENDING: 'Pendiente',
  IN_MANAGEMENT: 'En gestión',
  IN_PROGRESS: 'En curso',
}

const typeLabels: Record<TicketReportRow['work_type'], string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Correctiva',
  ACTUATION: 'Actuación',
}

function statusClass(status: TicketReportRow['status']) {
  if (status === 'IN_PROGRESS') return 'bg-blue-50 text-blue-700'
  if (status === 'IN_MANAGEMENT') return 'bg-violet-50 text-violet-700'
  return 'bg-amber-50 text-amber-700'
}

export default function MaintenanceTicketsReportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const { hotel } = useHotelScope()
  const [records, setRecords] = useState<TicketReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const search = params.get('search') ?? ''
  const status = params.get('status') ?? 'ALL'

  useEffect(() => {
    async function load() {
      if (!hotel?.id) {
        setError('No se ha seleccionado un hotel de trabajo.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      const result = await supabase
        .from('maintenance_work_orders_resolved')
        .select('id, ot_number, title, work_type, status, scheduled_date, assigned_user_name, maintenance_plan_name, apparatus_code, apparatus_name, reported_location_snapshot')
        .eq('hotel_id', hotel.id)
      .neq('work_type', 'PREVENTIVE')
        .not('status', 'in', '(COMPLETED,REJECTED)')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (result.error) {
        setError(result.error.message)
        setRecords([])
        setLoading(false)
        return
      }

      setRecords((result.data ?? []) as TicketReportRow[])
      setLoading(false)
    }

    void load()
  }, [hotel?.id])

  const reportRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')

    return records.filter((item) => {
      if (status !== 'ALL' && item.status !== status) return false
      if (!query) return true

      return [
        item.ot_number,
        item.title,
        item.maintenance_plan_name,
        item.apparatus_code,
        item.apparatus_name,
        item.assigned_user_name,
        item.reported_location_snapshot,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query)
    })
  }, [records, search, status])

  function printReport() {
    window.print()
  }

  return (
    <div className="arias-report-page min-h-screen bg-white text-slate-900 print:bg-white">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 print:max-w-none print:p-0">
        <div className="mb-3 flex items-start justify-between border-b pb-2 print:mb-2">
          <div className="flex items-center gap-3">
            <BrandLogo onActivate={() => navigate('/')} className="h-10 w-auto object-contain" />
            <div>
              <h1 className="text-2xl font-bold">Tickets</h1>
              <p className="text-sm text-slate-500">{hotel?.name ?? 'Hotel actual'} · Informe operativo</p>
              <p className="text-xs text-slate-400">
                Generado por: {session?.user.fullName || session?.user.email || 'Usuario'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 print:hidden">
            <ActionButton icon={Printer} label="Imprimir / PDF" tone="dark" onClick={printReport} />
            <BackButton onBack={() => navigate('/maintenance/tickets')} />
            <HomeButton onHome={() => navigate('/')} />
          </div>
        </div>

        <div className="mb-3 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Estado</div>
            <div className="font-semibold">
              {status === 'ALL' ? 'Todos los tickets activos' : statusLabels[status as TicketReportRow['status']] ?? status}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Filtro</div>
            <div className="truncate font-semibold">{search || 'Sin filtro de texto'}</div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Tickets</div>
            <div className="font-semibold">{reportRecords.length}</div>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500">Preparando informe…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-400 text-left">
                    <th className="px-2 py-2">Ticket</th>
                    <th className="px-2 py-2">Mantenimiento</th>
                    <th className="px-2 py-2">Equipo</th>
                    <th className="px-2 py-2">Ubicación</th>
                    <th className="px-2 py-2">Fecha prevista</th>
                    <th className="px-2 py-2">Asignado</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRecords.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200 break-inside-avoid print:break-inside-avoid">
                      <td className="whitespace-nowrap px-2 py-2 font-semibold">{item.ot_number}</td>
                      <td className="px-2 py-2">{item.maintenance_plan_name ?? item.title}</td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{item.apparatus_code ?? '—'}</div>
                        <div className="text-[10px] text-slate-400">{item.apparatus_name ?? '—'}</div>
                      </td>
                      <td className="px-2 py-2">{item.reported_location_snapshot || 'Sin instantánea histórica'}</td>
                      <td className="whitespace-nowrap px-2 py-2">{item.scheduled_date ? new Date(item.scheduled_date + 'T12:00:00').toLocaleDateString('es-ES') : '—'}</td>
                      <td className="px-2 py-2">{item.assigned_user_name ?? 'Sin asignar'}</td>
                      <td className="whitespace-nowrap px-2 py-2">{typeLabels[item.work_type]}</td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <span className={'inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ' + statusClass(item.status)}>
                          {statusLabels[item.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!reportRecords.length && (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                        No hay tickets que coincidan con el filtro.
                      </td>
                    </tr>
                  )}
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
