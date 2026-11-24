import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { ariasAuth } from '../../../core/auth/authService'
import { ariasAccess } from '../../../core/access/accessService'
import { isDemoUser } from '../../../core/access/demoReadOnly'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [accessError, setAccessError] = useState(false)

  useEffect(() => {
    let mounted = true

    if (!session) {
      setAuthorized(false)
      setAccessError(false)
      return
    }

    setAuthorized(null)
    setAccessError(false)

    void ariasAccess.hasSuiteAccess().then((result) => {
      if (!mounted) return
      setAuthorized(result.allowed)
      setAccessError(Boolean(result.error))
    })

    return () => {
      mounted = false
    }
  }, [session?.user.id])

  if (loading || (session && authorized === null)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white px-7 py-8 text-center shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
          <img src="/assets/arias-suite-logo-hotel-gold-v1.webp" alt="Arias Suite" className="mx-auto h-14 w-auto object-contain" />
          <p className="mt-5 text-sm text-slate-500">Comprobando acceso…</p>
        </div>
      </main>
    )
  }

  if (!session) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <img src="/assets/arias-suite-logo-hotel-gold-v1.webp" alt="Arias Suite" className="mx-auto h-16 w-auto object-contain" />
          <h1 className="mt-6 text-xl font-semibold text-slate-800">
            Acceso no disponible
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {accessError
              ? 'No se ha podido comprobar tu autorización en este momento.'
              : 'Tu cuenta no tiene un acceso activo a Arias Suite. Contacta con el administrador de la aplicación.'}
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() =>
                void ariasAuth.signOut().then(() => navigate('/login', { replace: true }))
              }
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>
    )
  }

  // PRUEBA solo puede navegar por el planificador: no exponer el resto del menú ni rutas directas.
  if(isDemoUser(session.user.id) && location.pathname!=='/planificador-horario')
    return <Navigate to="/planificador-horario" replace />

  return <Outlet />
}
