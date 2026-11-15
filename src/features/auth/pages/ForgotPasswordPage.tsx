import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { ariasAuth } from '../../../core/auth/authService'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setError('')
    setSent(false)
    setBusy(true)

    const result = await ariasAuth.requestPasswordReset(email.trim().toLowerCase())

    if (result.error) {
      setError(result.error.message)
      setBusy(false)
      return
    }

    setSent(true)
    setBusy(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-8 text-center">
            <img src="/assets/arias-suite-logo-v3.webp" alt="Arias Suite" className="mx-auto h-16 w-auto object-contain" />
            <h1 className="mt-5 text-xl font-semibold text-slate-800">Recuperar contraseña</h1>
            <p className="mt-1 text-sm text-slate-500">
              Si tu cuenta tiene un correo individual, introduce ese correo para recibir las instrucciones. Las cuentas sin correo recuperan el acceso mediante un código generado por el administrador.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Correo electrónico</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
              />
            </label>

            {sent && (
              <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">
                Si existe una cuenta asociada a ese correo, recibirás un mensaje con las instrucciones para recuperar la contraseña.
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {busy ? 'Enviando…' : 'Enviar instrucciones'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Volver al login
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
