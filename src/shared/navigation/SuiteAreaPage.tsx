import { Link } from 'react-router-dom'
import BrandLogo from '../components/branding/BrandLogo'
import { BackButton, HomeButton } from '../components/navigation/NavigationButtons'
import { useNavigate } from 'react-router-dom'
import { hubs, shortcutCatalog, type HubId } from './suiteNavigation'

export default function SuiteAreaPage({ hub }: { hub: HubId }) {
  const navigate = useNavigate()
  const config = hubs[hub]
  const links = config.links.map(id => shortcutCatalog.find(link => link.id === id)!)
  const related = (config.related ?? []).map(id => shortcutCatalog.find(link => link.id === id)!)
  return <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5 py-1"><div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4"><BrandLogo /><div><h1 className="text-xl font-bold sm:text-2xl">{config.title}</h1><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{config.description}</p></div></div>
        <div className="flex items-start gap-2"><BackButton onBack={() => navigate(config.parent)} /><HomeButton onHome={() => navigate('/')} /></div>
      </div></header>
      <section aria-label={config.title} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {links.map(link => <Link key={link.id} to={link.href} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
          <img src={link.icon} alt="" aria-hidden="true" width={512} height={512} className="h-20 w-20 shrink-0 object-contain motion-safe:group-hover:scale-105" />
          <div><h2 className="font-semibold text-slate-900">{link.label}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{link.description}</p></div>
        </Link>)}
      </section>
      {related.length > 0 && <section className="mt-7" aria-label="Consultas y seguimiento"><h2 className="mb-3 text-sm font-semibold text-slate-600">{hub === 'work' ? 'Otras vistas de trabajo' : 'Consultas y seguimiento'}</h2><div className="flex flex-wrap gap-2">
        {related.map(link => <Link key={link.id} to={link.href} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:border-teal-300 hover:text-teal-800">{link.label} →</Link>)}
      </div></section>}
      {hub === 'maintenance' && <div className="mt-6"><Link to="/maintenance/configuration" className="text-xs text-slate-500 underline underline-offset-4">Configuración de mantenimiento</Link></div>}
    </div>
  </div>
}
