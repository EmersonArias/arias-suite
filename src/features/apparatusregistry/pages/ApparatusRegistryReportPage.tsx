import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Printer } from 'lucide-react'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import PrintReportFooter from '../../../shared/components/reports/PrintReportFooter'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { useAuth } from '../../auth/context/AuthProvider'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { supabase } from '../../../lib/supabase'
import {
  fromDatabase,
  type ApparatusRegistry,
  type DatabaseApparatusRegistry,
} from '../lib/apparatusRegistry'

function getParam(params: URLSearchParams, key: string, fallback = '') {
  return params.get(key) ?? fallback
}

export default function ApparatusRegistryReportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  )

  const scope = getParam(params, 'scope', 'ALL') as 'SELECTED' | 'FILTERED' | 'ALL'
  const selectedId = getParam(params, 'selectedId')
  const search = getParam(params, 'search')
  const plant = getParam(params, 'plant', 'ALL')
  const active = getParam(params, 'active', 'ALL') as 'ALL' | 'ACTIVE' | 'INACTIVE'

  const [records, setRecords] = useState<ApparatusRegistry[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadRecords() {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
        .from('apparatus_registry')
        .select('*')
        .order('code', { ascending: true })

      if (error) {
        setErrorMessage(`Error cargando reporte: ${error.message}`)
        setLoading(false)
        return
      }

      setRecords(
        (data ?? []).map((row) =>
          fromDatabase(row as DatabaseApparatusRegistry),
        ),
      )
      setLoading(false)
    }

    void loadRecords()
  }, [])

  const reportRecords = useMemo(() => {
    let result = records

    if (scope === 'SELECTED' && selectedId) {
      result = result.filter((item) => item.id === selectedId)
    }

    if (scope === 'FILTERED') {
      const query = search.trim().toLocaleLowerCase('es')

      result = result.filter((item) => {
        if (query) {
          const haystack = [
            item.code,
            item.name,
            item.plant,
            item.location,
            item.maintenance,
          ]
            .join(' ')
            .toLocaleLowerCase('es')

          if (!haystack.includes(query)) return false
        }

        if (plant !== 'ALL' && item.plant !== plant) return false
        if (active === 'ACTIVE' && !item.active) return false
        if (active === 'INACTIVE' && item.active) return false

        return true
      })
    }

    return result
  }, [records, scope, selectedId, search, plant, active])

  function printReport() {
    window.print()
  }

  return (
    <div className="arias-report-page min-h-screen bg-white text-slate-900 print:bg-white">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 print:max-w-none print:p-0">
        <div className="mb-3 flex flex-col gap-2 border-b pb-2 print:mb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandLogo
              onActivate={() => navigate('/')}
              className="h-9 w-auto shrink-0 object-contain sm:h-10"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">Equipos e instalaciones</h1>
              <p className="text-xs text-slate-500">Informe</p>
              <p className="text-[11px] text-slate-400">
                Generado por: {session?.user.fullName || session?.user.email || 'Usuario'}
              </p>
            </div>
          </div>

          <div className="arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto print:hidden sm:w-auto sm:justify-end">
            <ActionButton
              icon={Printer}
              label="PDF"
              tone="dark"
              onClick={printReport}
            />
            <BackButton onBack={() => navigate('/apparatusregistry')} />
            <HomeButton onHome={() => navigate('/')} />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-500">
            Preparando informe…
          </div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {errorMessage}
          </div>
        ) : (
          <>
            <div className="-mt-1 mb-2 grid gap-2 text-xs leading-tight sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Ámbito</div>
                <div className="font-semibold leading-tight">
                  {scope === 'SELECTED'
                    ? 'Registro seleccionado'
                    : scope === 'FILTERED'
                      ? 'Registros filtrados'
                      : 'Todos los registros'}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Registros</div>
                <div className="font-semibold leading-tight">{reportRecords.length}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-400 text-left">
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Descripción</th>
                    <th className="px-2 py-2">Planta</th>
                    <th className="px-2 py-2">Ubicación</th>
                    <th className="px-2 py-2">Empresa de mantenimiento</th>
                    <th className="px-2 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRecords.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200 break-inside-avoid print:break-inside-avoid">
                      <td className="whitespace-nowrap px-2 py-2 font-semibold">
                        {item.code}
                      </td>
                      <td className="px-2 py-2">{item.name}</td>
                      <td className="px-2 py-2">{item.plant || '—'}</td>
                      <td className="px-2 py-2">{item.location || '—'}</td>
                      <td className="px-2 py-2">{item.maintenance || '—'}</td>
                    <td className="px-2 py-2">{item.active ? 'Activo' : 'Inactivo'}</td>
                    </tr>
                  ))}
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
