import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin, Settings2, X } from 'lucide-react'
import { defaultFavorites, normalizeFavorites, shortcutCatalog, suiteAreas } from './suiteNavigation'

export default function HomeFavorites({ storageKey }: { storageKey: string }) {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value = localStorage.getItem(storageKey); return value === null ? [...defaultFavorites] : normalizeFavorites(JSON.parse(value)) } catch { return [...defaultFavorites] }
  })
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  function save(next: string[]) {
    setFavorites(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setMessage('Accesos actualizados.') }
    catch { setMessage('Los accesos están actualizados, pero este navegador no ha permitido guardarlos.') }
  }
  function toggle(id: string) {
    if (favorites.includes(id)) save(favorites.filter(item => item !== id))
    else if (favorites.length < 8) save([...favorites, id])
  }
  return <section aria-labelledby="home-shortcuts-title" className="mx-auto w-full max-w-[1680px] px-2 sm:px-3 md:px-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 id="home-shortcuts-title" className="text-xl font-bold text-slate-800">Mis accesos</h1><p className="mt-1 text-xs leading-5 text-slate-500">Tus trabajos habituales a un toque. Todas las áreas están en el menú.</p></div><button type="button" onClick={() => setEditing(value => !value)} aria-expanded={editing} aria-controls="favorite-settings" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-teal-300"><Settings2 size={15}/>{editing ? 'Listo' : 'Personalizar'}</button></div>
    {editing && <div id="favorite-settings" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Elige hasta ocho accesos</p><p className="mt-1 text-xs text-slate-500">La selección se guarda para tu usuario y hotel en este navegador.</p></div><button type="button" onClick={() => save([...defaultFavorites])} className="text-xs font-semibold text-teal-700 underline underline-offset-4">Restablecer</button></div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{suiteAreas.map(area => <fieldset key={area.id}><legend className="mb-2 text-xs font-bold text-slate-700">{area.label}</legend>{shortcutCatalog.filter(link => link.area === area.id).map(link => <label key={link.id} className="flex items-center gap-2 py-1.5 text-xs text-slate-600"><input type="checkbox" checked={favorites.includes(link.id)} onChange={() => toggle(link.id)} disabled={!favorites.includes(link.id) && favorites.length >= 8} className="h-4 w-4 accent-teal-700"/>{link.label}</label>)}</fieldset>)}</div>
    </div>}
    <p role="status" className="mb-2 text-xs text-teal-700">{message}</p>
    {favorites.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">Puedes añadir accesos con Personalizar o abrir un área desde el menú.</div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{favorites.map(id => {
      const link = shortcutCatalog.find(item => item.id === id)!
      const area = suiteAreas.find(item => item.id === link.area)!
      return <article key={id} className="group relative rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-teal-200 hover:shadow-md">
        <button type="button" onClick={() => toggle(id)} aria-label={'Quitar ' + link.label + ' de Mis accesos'} title="Quitar acceso" className="absolute right-2 top-2 z-10 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={13}/></button>
        <Link to={link.href} aria-label={'Abrir ' + link.label} className="flex min-h-[186px] flex-col items-center justify-center rounded-2xl px-3 pb-4 pt-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"><img src={link.icon} alt="" aria-hidden="true" width={512} height={512} className="h-20 w-20 object-contain motion-safe:group-hover:scale-105"/><h2 className="mt-3 text-center text-sm font-semibold text-slate-800">{link.label}</h2><span className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-400"><Pin size={10} aria-hidden="true"/>{area.label}</span></Link>
      </article>
    })}</div>}
  </section>
}
