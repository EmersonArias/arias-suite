import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../../lib/supabase'

type PendingFactor = { id: string; qr: string; secret: string }

export default function AuthenticatorSetup() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [factor, setFactor] = useState<PendingFactor | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return
      if (error) setError('No se ha podido consultar el autenticador. Recarga la página.')
      else setEnabled(Boolean(data?.totp.length))
    })
    return () => { active = false }
  }, [])

  async function start() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (error || !data) {
      setError('No se ha podido preparar el autenticador. Inténtalo de nuevo.')
      return
    }
    setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!factor || busy) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (error) {
      setError('El código no se ha podido verificar. Introduce el código actual de tu autenticador.')
      return
    }
    setFactor(null)
    setCode('')
    setEnabled(true)
  }

  return <section className="mt-5 space-y-3 border-t border-slate-100 pt-4" aria-label="Autenticador">
    <h2 className="font-semibold">Autenticador</h2>
    {enabled && <p className="text-sm text-emerald-700">Autenticador configurado.</p>}
    {enabled === false && !factor && <button type="button" disabled={busy} onClick={() => void start()}
      className="min-h-10 rounded-lg border px-3 text-sm font-semibold">Configurar autenticador</button>}
    {factor && <form onSubmit={verify} className="space-y-3">
      <p className="text-sm">Escanea el código con tu aplicación de autenticación e introduce los seis dígitos.</p>
      <img src={factor.qr} width={176} height={176} alt="Código QR del autenticador" />
      <details className="text-sm"><summary className="cursor-pointer">Introducir clave manualmente</summary><code>{factor.secret}</code></details>
      <label className="block text-sm">Código del autenticador
        <input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={code} onChange={event => setCode(event.target.value)} className="ml-2 w-28 rounded-lg border px-3 py-2" />
      </label>
      <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Verificar autenticador</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>
}
