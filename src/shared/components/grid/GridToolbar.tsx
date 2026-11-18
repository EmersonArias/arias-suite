import type { LucideIcon } from 'lucide-react'
import ActionButton, { type ActionButtonTone } from '../buttons/ActionButton'
import IconButton from '../buttons/IconButton'
import { getActionCaption } from '../buttons/actionLabels'

export interface GridToolbarAction {
  key: string
  label: string
  icon: LucideIcon
  tone?: ActionButtonTone
  onClick: () => void
  disabled?: boolean
  compact?: boolean
}

interface GridToolbarProps {
  actions: GridToolbarAction[]
  className?: string
}

export default function GridToolbar({ actions, className = '' }: GridToolbarProps) {
  return (
    <div className={['arias-grid-toolbar flex items-start justify-end gap-1', className].filter(Boolean).join(' ')}>
      {actions.map((action) => (
        <span key={action.key} className="arias-toolbar-action">
          {action.compact ? (
            <IconButton
              icon={action.icon}
              label={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              showLabel={false}
            />
          ) : (
            <ActionButton
              icon={action.icon}
              label={action.label}
              tone={action.tone}
              onClick={action.onClick}
              disabled={action.disabled}
              showLabel={false}
            />
          )}
          <span aria-hidden="true" className="arias-action-caption">{getActionCaption(action.label)}</span>
        </span>
      ))}
    </div>
  )
}
