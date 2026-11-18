import { FileText, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

const reports = [
  {
    name: 'Relación de Aparatos',
    description: 'Listado de aparatos con código, descripción, planta, ubicación y estado.',
    path: '/apparatusregistry/report?scope=ALL',
  },
  {
    name: 'Cuadros Eléctricos BT',
    description: 'Informe de revisiones y estado de los cuadros eléctricos de baja tensión.',
    path: '/electricalpanels/report?scope=ALL',
  },
]

export default function ReportsPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mb-3 flex items-center justify-between px-1 sm:mb-4">
          <BrandLogo
            label="Inicio Arias Suite"
            onActivate={() => navigate('/')}
            className="h-14 w-auto object-contain sm:h-16"
          />
          <div className="flex items-center gap-2">
            <BackButton onBack={() => navigate(-1)} />
            <HomeButton onHome={() => navigate('/')} />
          </div>
        </div>

        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <FileText size={21} className="text-slate-500" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Informes</h1>
              <p className="mt-1 text-sm text-slate-500">
                Consulta e impresión de los informes disponibles en Arias Suite.
              </p>
            </div>
          </div>
        </header>

        <main className="mt-4 grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <article
              key={report.path}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{report.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{report.description}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                  <Printer size={18} />
                </div>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => navigate(report.path)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  <Printer size={17} />
                  Ver e imprimir
                </button>
              </div>
            </article>
          ))}
        </main>

        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm leading-6 text-slate-500">
          Los nuevos módulos de Arias Suite podrán incorporar aquí sus informes a medida que
          estén terminados.
        </div>
      </div>
    </div>
  )
}
