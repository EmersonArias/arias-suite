
import { ClipboardCheck, FilePlus2, ListTodo, MoveRight, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

const actions = [
  ['Trabajo diario', 'Tareas preventivas y trabajos pendientes.', ListTodo, '/maintenance/pam'],
  ['OT', 'Órdenes de trabajo preventivas y operativas.', Wrench, '/maintenance/work-orders'],
  ['Ejecuciones', 'Registrar el trabajo realizado sobre un mantenimiento.', ClipboardCheck, '/maintenance/plans'],
  ['Actuaciones', 'Trabajos, reparaciones y sustituciones.', FilePlus2, '/actions'],
] as const

export default function MaintenanceOperationHomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div><h1 className="text-xl font-bold sm:text-2xl">Operación</h1><p className="text-xs text-slate-500 sm:text-sm">Trabajo diario de mantenimiento</p></div>
            </div>
            <div className="flex gap-2"><BackButton onBack={() => navigate('/maintenance')} /><HomeButton onHome={() => navigate('/')} /></div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(([title, description, Icon, href]) => (
            <button key={title} type="button" onClick={() => navigate(href)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon size={20} /></div>
                <MoveRight size={18} className="text-slate-300 transition group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4 text-sm font-bold text-slate-800">{title}</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
            </button>
          ))}
        </section>
      </div>
    </div>
  )
}
