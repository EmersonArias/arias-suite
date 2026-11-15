import { type FormEvent, useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ariasAuth } from '../../../core/auth/authService'
import { supabase } from '../../../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function destinationAfterLogin() {
    const { data: session } = await ariasAuth.getSession()
    if (!session) return '/'
    const access = await supabase.rpc('has_suite_access')
    if (!access.error && access.data === true) return '/'
    const own = await supabase.from('staff_operators')
      .select('id').eq('linked_user_id', session.user.id).eq('active', true).limit(1)
    return !own.error && (own.data?.length ?? 0) > 0 ? '/mi-horario' : '/'
  }

  useEffect(() => {
    let active = true
    void ariasAuth.getSession().then(async ({ data }) => {
      if (data) {
        const destination = await destinationAfterLogin()
        if (active) navigate(destination, { replace: true })
      }
    })
    return () => { active = false }
  }, [navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setError('')
    setBusy(true)

    const { error: signInError } = await ariasAuth.signIn(identifier.trim(), password)

    if (signInError) {
      setError('No se ha podido iniciar sesión. Comprueba el usuario y la contraseña.')
      setBusy(false)
      return
    }

    window.location.replace(await destinationAfterLogin())
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
          <div className="mb-8 text-center">
            <img
              src="/assets/arias-suite-logo-v4.webp"
              alt="Arias Suite"
              className="mx-auto h-16 w-auto object-contain"
            />
            <h1 className="mt-5 text-xl font-semibold text-slate-800">
              Iniciar sesión
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Accede a Arias Suite
            </p>
          </div>

          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
            <label className="block" htmlFor="login-identifier">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Correo o identificador de acceso
              </span>
              <input
                id="login-identifier"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
              />
            </label>

            <label className="block" htmlFor="login-password">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Contraseña
              </span>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-11 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-to-b from-sky-100 to-sky-50 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_5px_12px_rgba(15,23,42,0.10)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(15,23,42,0.12)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>

            <div className="space-y-2 text-center">
              <Link
                to="/forgot-password"
                className="block text-sm font-medium text-slate-500 transition hover:text-slate-800"
              >
                ¿Has olvidado tu contraseña?
              </Link>
              <Link
                to="/activate"
                className="block text-sm font-semibold text-sky-700 transition hover:text-sky-900"
              >
                Activar usuario
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
