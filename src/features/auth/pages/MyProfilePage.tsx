import { type FormEvent, useState } from 'react'
import { UserRound, Save, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { ariasAuth } from '../../../core/auth/authService'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useAuth } from '../context/AuthProvider'
import AuthenticatorSetup from '../components/AuthenticatorSetup'

export default function MyProfilePage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { isPlatformAdmin } = useHotelScope()
  const [fullName, setFullName] = useState(session?.user.fullName ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [closingSessions, setClosingSessions] = useState(false)
  const [sessionError, setSessionError] = useState('')

  async function closeAllSessions() {
    if (!window.confirm('¿Cerrar la sesión de tu cuenta en todos los dispositivos, incluido este?')) return
    setClosingSessions(true)
    setSessionError('')
    const { error } = await ariasAuth.signOut('global')
    if (error) {
      setSessionError('No se ha podido confirmar el cierre de todas las sesiones. Inténtalo de nuevo.')
      setClosingSessions(false)
      return
    }
    navigate('/login', { replace: true })
  }


  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const name = fullName.trim()
    if (!name) {
      setError('El nombre es obligatorio.')
      setSaved(false)
      return
    }

    setBusy(true)
    setError('')
    setSaved(false)

    const result = await ariasAuth.updateProfile(name)

    if (result.error) {
      setError(result.error.message)
      setBusy(false)
      return
    }

    setFullName(name)
    setSaved(true)
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-4xl">
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

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 text-slate-500">
              <UserRound size={21} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
              <p className="mt-1 text-sm text-slate-500">
                Actualiza tu nombre de usuario. El correo identifica la cuenta.
              </p>
            </div>
          </div>

          {isPlatformAdmin && <Link to="/admin/accesos" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900">Registro de accesos de todos los usuarios</Link>}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <ActionButton icon={LogOut} type="button" disabled={closingSessions}
              onClick={() => void closeAllSessions()}
              label={closingSessions ? 'Cerrando sesiones…' : 'Cerrar sesión en todos los dispositivos'} />
            {sessionError && <p role="alert" className="mt-2 text-sm text-red-700">{sessionError}</p>}
          </div>
          {isPlatformAdmin && <AuthenticatorSetup />}
          <form className="mt-6 max-w-xl space-y-5" onSubmit={submit}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Identificador de acceso
              </span>
              <input
                value={session?.user.loginIdentifier ?? ''}
                readOnly
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-500 outline-none"
              />
              <span className="mt-1.5 block text-xs text-slate-400">
                Este identificador se utiliza para iniciar sesión.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</span>
              <input
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Correo electrónico
              </span>
              <input
                value={session?.user.email ?? ''}
                readOnly
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-500 outline-none"
              />
            </label>

            {saved && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">
                Perfil actualizado correctamente.
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <ActionButton
              icon={Save}
              label={busy ? 'Guardando…' : 'Guardar cambios'}
              type="submit"
              disabled={busy}
            />
          </form>
        </section>
      </div>
    </div>
  )
}
