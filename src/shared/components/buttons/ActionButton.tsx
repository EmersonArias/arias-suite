import type { LucideIcon } from 'lucide-react'
import { getActionCaption } from './actionLabels'

export type ActionButtonTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'dark'

interface ActionButtonProps {
  icon?: LucideIcon
  label: string
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  tone?: ActionButtonTone
  disabled?: boolean
  className?: string
  /** Hide the caption when a surrounding toolbar supplies its own caption. */
  showLabel?: boolean
}

const interactionClasses: Record<ActionButtonTone, string> = {
  default: 'hover:bg-blue-100/70 active:bg-blue-100 active:ring-4 active:ring-blue-300/70',
  primary: 'hover:bg-blue-50 active:bg-blue-100 active:ring-4 active:ring-blue-200/70',
  success: 'hover:bg-emerald-50 active:bg-emerald-100 active:ring-4 active:ring-emerald-200/70',
  warning: 'hover:bg-amber-50 active:bg-amber-100 active:ring-4 active:ring-amber-200/70',
  danger: 'hover:bg-red-50 active:bg-red-100 active:ring-4 active:ring-red-200/70',
  dark: 'hover:bg-slate-100 active:bg-slate-200 active:ring-4 active:ring-slate-300/70',
}

export default function ActionButton({
  icon: Icon,
  label,
  onClick,
  type = 'button',
  tone = 'default',
  disabled = false,
  className = '',
  showLabel = true,
}: ActionButtonProps) {
  if (!Icon) {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        data-tone={tone}
        aria-label={label}
        title={label}
        className={[
          'arias-action-button rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700',
          'transition-colors duration-150 hover:bg-slate-100 active:bg-slate-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          'disabled:cursor-not-allowed disabled:text-slate-300',
          className,
        ].join(' ')}
      >
        {label}
      </button>
    )
  }

  const button = (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tone={tone}
      aria-label={label}
      title={label}
      className={[
        'arias-control-3d arias-action-button inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'text-[#294b70] transition-[background-color,box-shadow,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
        'active:scale-95',
        interactionClasses[tone],
        'disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent disabled:active:scale-100 disabled:active:ring-0',
        className,
      ].join(' ')}
    >
      <Icon size={19} strokeWidth={2} aria-hidden="true" />
    </button>
  )

  if (!showLabel) return button

  return (
    <span className="arias-icon-action" title={label}>
      {button}
      <span className="arias-action-caption" aria-hidden="true">{getActionCaption(label)}</span>
    </span>
  )
}
