import { AlertTriangle, X } from 'lucide-react'
import ActionButton from '../buttons/ActionButton'

interface UnsavedChangesDialogProps {
  open: boolean
  onCancel: () => void
  onDiscard: () => void
  onSaveAndContinue?: () => void
  saving?: boolean
  title?: string
  message?: string
  discardLabel?: string
  saveLabel?: string
}

export default function UnsavedChangesDialog({
  open,
  onCancel,
  onDiscard,
  onSaveAndContinue,
  saving = false,
  title = 'Hay cambios sin guardar',
  message = 'Si sales ahora, perderás los cambios realizados en este formulario.',
  discardLabel = 'Descartar y salir',
  saveLabel = 'Guardar y salir',
}: UnsavedChangesDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
        <img
          src="/assets/arias-suite-logo-v2.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-7 -right-7 w-44 opacity-[0.055]"
        />

        <div className="relative flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-blue-50 p-2 text-blue-700">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0">
            <h2 id="unsaved-dialog-title" className="text-base font-bold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {message}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ActionButton icon={X} label="Cancelar" onClick={onCancel} disabled={saving} />
          <ActionButton label={discardLabel} onClick={onDiscard} disabled={saving} />
          {onSaveAndContinue && (
            <ActionButton
              label={saving ? 'Guardando…' : saveLabel}
              onClick={onSaveAndContinue}
              disabled={saving}
            />
          )}
        </div>
      </div>
    </div>
  )
}
