import {
  AlertTriangle,
  CircleAlert,
  CircleCheck,
  Check,
  Info,
  X,
} from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import ActionButton from '../buttons/ActionButton'

type DialogKind = 'confirm' | 'alert'
type DialogVariant = 'info' | 'warning' | 'success' | 'danger'

export interface SystemDialogOptions {
  title: string
  message: string
  variant?: DialogVariant
  confirmLabel?: string
  cancelLabel?: string
}

interface DialogRequest extends SystemDialogOptions {
  id: number
  kind: DialogKind
  resolve: (value: boolean) => void
}

interface SystemDialogContextValue {
  confirm: (options: SystemDialogOptions) => Promise<boolean>
  alert: (options: Omit<SystemDialogOptions, 'cancelLabel'>) => Promise<void>
}

const SystemDialogContext = createContext<SystemDialogContextValue | null>(null)

const variantIcon: Record<DialogVariant, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  success: CircleCheck,
  danger: CircleAlert,
}

const variantIconClass: Record<DialogVariant, string> = {
  info: 'bg-blue-50 text-blue-700',
  warning: 'bg-amber-50 text-amber-700',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-red-50 text-red-700',
}

export function SystemDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([])

  const current = queue[0]

  const confirm = useCallback((options: SystemDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setQueue((items) => [
        ...items,
        {
          ...options,
          id: Date.now() + Math.random(),
          kind: 'confirm',
          resolve,
        },
      ])
    })
  }, [])

  const alert = useCallback((options: Omit<SystemDialogOptions, 'cancelLabel'>) => {
    return new Promise<void>((resolve) => {
      setQueue((items) => [
        ...items,
        {
          ...options,
          id: Date.now() + Math.random(),
          kind: 'alert',
          resolve: () => resolve(),
        },
      ])
    })
  }, [])

  const close = useCallback((result: boolean) => {
    setQueue((items) => {
      const [active, ...rest] = items
      if (active) active.resolve(result)
      return rest
    })
  }, [])

  useEffect(() => {
    if (!current) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [current, close])

  const value: SystemDialogContextValue = { confirm, alert }

  return (
    <SystemDialogContext.Provider value={value}>
      {children}

      {current && (() => {
        const variant = current.variant ?? 'info'
        const Icon = variantIcon[variant]

        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            role="presentation"
          >
            <div
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="arias-system-dialog-title"
              aria-describedby="arias-system-dialog-message"
            >
              <img
                src="/assets/arias-suite-logo-v2.webp"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-8 -right-8 w-56 opacity-[0.055]"
              />

              <div className="relative p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 rounded-2xl p-3 ${variantIconClass[variant]}`}>
                    <Icon size={24} strokeWidth={2} />
                  </div>

                  <div className="min-w-0 pr-2">
                    <h2
                      id="arias-system-dialog-title"
                      className="text-xl font-semibold text-slate-900"
                    >
                      {current.title}
                    </h2>
                    <p
                      id="arias-system-dialog-message"
                      className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600"
                    >
                      {current.message}
                    </p>
                  </div>
                </div>

                <div className="relative mt-7 flex flex-wrap justify-end gap-2">
                  {current.kind === 'confirm' && (
                    <ActionButton
                      icon={X}
                      label={current.cancelLabel ?? 'Cancelar'}
                      onClick={() => close(false)}
                    />
                  )}

                  <ActionButton
                    icon={Check}
                    label={current.kind === 'alert' ? 'Aceptar' : current.confirmLabel ?? 'Confirmar'}
                    onClick={() => close(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </SystemDialogContext.Provider>
  )
}

export function useSystemDialog() {
  const context = useContext(SystemDialogContext)

  if (!context) {
    throw new Error('useSystemDialog debe utilizarse dentro de SystemDialogProvider.')
  }

  return context
}
