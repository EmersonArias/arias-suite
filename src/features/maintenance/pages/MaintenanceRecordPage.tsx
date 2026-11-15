
import { Camera, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

export default function MaintenanceRecordPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1000px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div><h1 className="text-xl font-bold sm:text-2xl">Registro</h1><p className="text-xs text-slate-500 sm:text-sm">Registro oficial digital</p></div>
            </div>
            <div className="flex gap-2"><BackButton onBack={() => navigate('/registros-tecnicos')} /><HomeButton onHome={() => navigate('/')} /></div>
          </div>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1 block text-sm font-medium">Fecha</span><input type="date" className="w-full rounded-xl border px-3 py-2" /></label>
            <label><span className="mb-1 block text-sm font-medium">Hora</span><input type="time" className="w-full rounded-xl border px-3 py-2" /></label>
          </div>
          <div className="mt-4">
            <label><span className="mb-1 block text-sm font-medium">Observaciones</span><textarea rows={4} className="w-full rounded-xl border px-3 py-2" placeholder="Anotaciones del registro..." /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"><Camera size={17} /> Añadir foto</button>
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Save size={17} /> Guardar registro</button>
          </div>
          <p className="mt-4 text-xs text-slate-500">Esta pantalla es la base visual del futuro libro digital. Los campos específicos se definirán por cada registro.</p>
        </section>
      </div>
    </div>
  )
}
