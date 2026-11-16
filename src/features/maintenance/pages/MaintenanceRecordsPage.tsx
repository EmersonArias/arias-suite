import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

const records = [
  ['Preventivo diario', 'Registro preventivo de frecuencia corta.', 'daily', '/maintenance/record'],
  ['Piscina exterior', 'Registro de medidas y controles diarios.', 'pool', '/pools'],
  ['Piscina SPA', 'Registro de medidas y controles del SPA.', 'spa', '/spa'],
  ['Autocontrol Legionella', 'Registro de controles y seguimiento.', 'legionella', '/legionella'],
  ['Bombas', 'Registro de revisiones y actuaciones.', 'pump', '/pumps'],
  ['Climatizadores / Extractores', 'Registro de revisiones de climatización y extracción.', 'air-handler', '/climatizers'],
  ['Fancoils', 'Registro de revisiones de fancoils.', 'fancoil', '/fancoils'],
  ['Cuadros eléctricos BT', 'Registro de revisiones y mediciones eléctricas.', 'electrical', '/electricalpanels'],
  ['Elementos fotoluminiscentes', 'Registro de comprobaciones.', 'photoluminescent', '/photoluminescent'],
  ['Luces de emergencia', 'Registro de comprobaciones y revisiones.', 'emergency', '/emergencylights'],
  ['Puertas cortafuegos', 'Registro de inspecciones.', 'firedoor', '/firedoors'],
  ['PCI', 'Registro de inspecciones de protección contra incendios.', 'fire', '/fireequipment'],
  ['Calibraciones', 'Registro de calibraciones realizadas.', 'calibration', '/calibrations'],
] as const

export default function MaintenanceRecordsPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div><h1 className="text-xl font-bold sm:text-2xl">Registros técnicos</h1><p className="text-xs text-slate-500 sm:text-sm">Controles y revisiones del hotel</p></div>
            </div>
            <div className="flex gap-2"><BackButton onBack={() => navigate('/')} /><HomeButton onHome={() => navigate('/')} /></div>
          </div>
        </header>

        <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <img src="/assets/record-icons-3d/daily.webp" alt="" aria-hidden="true" width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
            <div>
              <h2 className="text-sm font-semibold sm:text-base">Registros oficiales</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                Entrada de datos desde el móvil o PC y generación posterior del registro imprimible.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div><h2 className="text-sm font-bold text-sky-950">Módulos de los libros Excel</h2><p className="mt-1 text-xs text-sky-800">Formularios en pruebas, referencias de origen, historial y PDF. Piscina y SPA mantienen sus módulos actuales.</p></div>
          <Link to="/registros-tecnicos/pruebas" className="rounded-xl bg-sky-800 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-900">Probar los libros</Link>
        </section>

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {records.map(([title, description, icon, href]) => (
            <button
              key={title}
              type="button"
              onClick={() => navigate(href)}
              aria-label={"Abrir registro de " + title}
              title={description}
              className="group flex min-h-[182px] flex-col items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.02] hover:border-slate-300 hover:shadow-[0_18px_32px_rgba(15,23,42,0.18)] active:translate-y-0 active:scale-[0.99]"
            >
              <div className="flex min-h-[148px] flex-1 flex-col items-center justify-center px-2 py-2.5">
                <img
                  src={'/assets/record-icons-3d/' + icon + '.webp'}
                  alt=""
                  aria-hidden="true"
                  width={512}
                  height={512}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-24 w-24 object-contain transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:scale-105 motion-reduce:transition-none sm:h-28 sm:w-28"
                />
                <span className="mt-2 text-center text-xs font-semibold leading-snug text-slate-700">
                  {title}
                </span>
              </div>
              <div className="border-t border-slate-200 px-2.5 py-1.5 text-center text-[9px] font-semibold text-slate-400">
                Abrir registro
              </div>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}
