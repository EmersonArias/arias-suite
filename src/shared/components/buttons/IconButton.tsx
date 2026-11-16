import type { LucideIcon } from 'lucide-react'
import { getActionCaption } from './actionLabels'

export type IconButtonTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'

interface IconButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  tone?: IconButtonTone
  disabled?: boolean
  title?: string
  className?: string
  size?: 'default' | 'compact'
  variant?: 'raised' | 'flat'
  /** Hide the caption when a surrounding toolbar supplies its own caption. */
  showLabel?: boolean
}

const rippleClasses: Record<IconButtonTone, string> = {
  default: 'hover:bg-blue-100/70 active:bg-blue-100 active:ring-4 active:ring-blue-300/70',
  primary: 'hover:bg-blue-50 active:bg-blue-100 active:ring-4 active:ring-blue-200/70',
  success: 'hover:bg-emerald-50 active:bg-emerald-100 active:ring-4 active:ring-emerald-200/70',
  warning: 'hover:bg-amber-50 active:bg-amber-100 active:ring-4 active:ring-amber-200/70',
  danger: 'hover:bg-red-50 active:bg-red-100 active:ring-4 active:ring-red-200/70',
}

export default function IconButton({
  icon: Icon,
  label,
  onClick,
  type = 'button',
  tone = 'default',
  disabled = false,
  title,
  className = '',
  size = 'default',
  showLabel = true,
}: IconButtonProps) {
  const dimensions = size === 'compact' ? 'h-8 w-8' : 'h-9 w-9'
  const button = (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-tone={tone}
      aria-label={label}
      title={title ?? label}
      className={[
        'arias-control-3d arias-icon-button inline-flex shrink-0 items-center justify-center rounded-full',
        dimensions,
        'text-[#294b70] transition-[background-color,box-shadow,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
        'active:scale-95',
        rippleClasses[tone],
        'disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent disabled:active:scale-100 disabled:active:ring-0',
        className,
      ].join(' ')}
    >
      <Icon size={size === 'compact' ? 17 : 19} strokeWidth={2} aria-hidden="true" />
    </button>
  )

  if (!showLabel) return button

  return (
    <span className={['arias-icon-action', size === 'compact' ? 'arias-icon-action-compact' : ''].filter(Boolean).join(' ')} title={title ?? label}>
      {button}
      <span className="arias-action-caption" aria-hidden="true">{getActionCaption(label)}</span>
    </span>
  )
}
