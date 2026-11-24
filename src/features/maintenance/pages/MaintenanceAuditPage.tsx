
import { Archive, FileCheck2, FileText, Image as ImageIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

const items = [
  ['Certificados e informes', 'Documentación emitida por empresas y mantenedores.', FileCheck2, '/reports'],
  ['Evidencias', 'Fotografías y documentos asociados a ejecuciones.', ImageIcon, '/maintenance/records'],
  ['Histórico', 'Consulta de tickets y trabajos ya finalizados.', Archive, '/maintenance/tickets/history'],
  ['Exportar', 'Preparar documentación para presentar en auditoría.', FileText, '/reports'],
] as const

export default function MaintenanceAuditPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div><h1 className="text-xl font-bold sm:text-2xl">Auditoría</h1><p className="text-xs text-slate-500 sm:text-sm">Evidencias y documentación</p></div>
            </div>
            <div className="flex gap-2"><BackButton onBack={() => navigate('/maintenance')} /><HomeButton onHome={() => navigate('/')} /></div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([title, description, Icon, href]) => (
            <button key={title} type="button" onClick={() => navigate(href)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Icon size={20} /></div>
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
