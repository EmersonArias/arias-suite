import { useEffect, useRef, type MouseEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, Home, ChevronRight } from 'lucide-react'
import { suiteAreas, suiteLinks, areaForPath, breadcrumbsForPath } from './suiteNavigation'
import { canNavigateInSuite } from './navigationGuard'
import { useAuth } from '../../features/auth/context/AuthProvider'
import { isDemoUser } from '../../core/access/demoReadOnly'
import { ariasAuth } from '../../core/auth/authService'

export default function SuiteLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const demo = isDemoUser(session?.user.id)
  const activeArea = areaForPath(location.pathname)
  const crumbs = breadcrumbsForPath(location.pathname)
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const previousPath = useRef(location.pathname)
  useEffect(() => {
    dialog.current?.close()
    if (previousPath.current !== location.pathname) content.current?.focus({ preventScroll: true })
    previousPath.current = location.pathname
  }, [location.pathname])

  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const target = event.currentTarget.getAttribute('href')
    if (target !== location.pathname + location.search && !canNavigateInSuite()) { event.preventDefault(); return }
    dialog.current?.close()
  }
  function menu() {
    if(demo)return <nav aria-label="Menú de prueba" className="space-y-2 p-3">
      <Link to="/planificador-horario" onClick={follow}
        className="suite-area-link suite-area-active">Planificador horario</Link>
      <button type="button" className="w-full rounded-lg border px-3 py-2 text-left text-sm"
        onClick={()=>void ariasAuth.signOut().then(()=>navigate('/login',{replace:true}))}>
        Cerrar sesión
      </button>
    </nav>
    return <nav aria-label="Áreas de Arias Suite" className="space-y-1 p-3">
      <Link to="/" onClick={follow} aria-current={location.pathname === '/' ? 'page' : undefined} className={'suite-area-link ' + (location.pathname === '/' ? 'suite-area-active' : '')}><Home size={21} aria-hidden="true" /><span>Inicio · Mis accesos</span></Link>
      <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Áreas de trabajo</p>
      {suiteAreas.map(area => <div key={area.id}>
        <Link to={area.href} onClick={follow} aria-current={location.pathname === area.href ? 'page' : undefined} className={'suite-area-link ' + (activeArea === area.id ? 'suite-area-active' : '')}>
          <img src={area.icon} alt="" aria-hidden="true" width={512} height={512} className="h-8 w-8 shrink-0 object-contain" /><span>{area.label}</span>
        </Link>
        {activeArea === area.id && <div className="ml-7 border-l border-slate-200 pl-3">
          {suiteLinks.filter(link => link.area === area.id && !link.parent && (area.id !== 'records' || link.id === 'daily')).map(link => <Link key={link.id} to={link.href} onClick={follow} aria-current={location.pathname === link.href ? 'page' : undefined} className={'block rounded-lg px-2 py-2 text-xs leading-5 hover:bg-slate-100 ' + (location.pathname === link.href ? 'font-semibold text-teal-800' : 'text-slate-500')}>{link.label}</Link>)}
        </div>}
      </div>)}
    </nav>
  }
  return <div className="suite-layout">
    <a href="#suite-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3">Ir al contenido</a>
    <aside className="suite-sidebar" aria-label="Navegación principal"><div className="border-b border-slate-200 px-5 py-5"><p className="text-lg font-bold tracking-tight text-slate-800">Arias <span className="text-teal-700">Suite</span></p><p className="mt-1 text-[10px] tracking-widest text-slate-400">MANTENIMIENTO HOTELERO</p></div>{menu()}</aside>
    <div className="suite-mobile-bar"><button type="button" onClick={() => dialog.current?.showModal()} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700" aria-haspopup="dialog"><Menu size={20} aria-hidden="true"/>Áreas de trabajo</button>{!demo&&<Link to="/" onClick={follow} className="px-3 py-2 text-xs font-semibold text-teal-700">Inicio</Link>}</div>
    <dialog ref={dialog} className="suite-mobile-dialog" aria-labelledby="suite-menu-title"><div className="flex items-center justify-between border-b border-slate-200 p-4"><h2 id="suite-menu-title" className="font-semibold">Áreas de trabajo</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar menú" className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></div>{menu()}</dialog>
    <div id="suite-content" ref={content} tabIndex={-1} className="suite-content outline-none">
      {!demo&&crumbs.length > 0 && <nav aria-label="Ubicación actual" className="suite-breadcrumbs flex flex-wrap items-center gap-1.5 px-5 py-2 text-[11px] text-slate-500"><Link to="/" onClick={follow} className="hover:text-teal-700">Inicio</Link>{crumbs.map((crumb, index) => <span className="inline-flex items-center gap-1.5" key={crumb.href}><ChevronRight size={12} aria-hidden="true"/>{index === crumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link to={crumb.href} onClick={follow} className="hover:text-teal-700">{crumb.label}</Link>}</span>)}</nav>}
      <Outlet />
    </div>
  </div>
}
