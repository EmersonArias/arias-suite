import { FileText, Pencil, Save, Trash2, X } from 'lucide-react'
import ActionButton from '../buttons/ActionButton'

export type FormMode = 'create' | 'view' | 'edit'

interface FormActionsProps {
  mode: FormMode
  onSave?: () => void
  onCancel?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onReport?: () => void
  saving?: boolean
  deleting?: boolean
  reportLabel?: string
  className?: string
}

export default function FormActions({
  mode,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  onReport,
  saving = false,
  deleting = false,
  reportLabel = 'PDF',
  className = '',
}: FormActionsProps) {
  if (mode === 'view') {
    return (
      <div className={['arias-form-actions grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end', className].filter(Boolean).join(' ')}>
        {onEdit && <ActionButton icon={Pencil} label="Modificar" tone="warning" onClick={onEdit} />}
        {onReport && <ActionButton icon={FileText} label={reportLabel} tone="dark" onClick={onReport} />}
        {onDelete && (
          <ActionButton
            icon={Trash2}
            label="Eliminar"
            tone="danger"
            onClick={onDelete}
            disabled={deleting}
          />
        )}
      </div>
    )
  }

  return (
    <div className={['grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end', className].filter(Boolean).join(' ')}>
      {onCancel && <ActionButton icon={X} label="Cancelar" onClick={onCancel} disabled={saving} />}
      {onSave && (
        <ActionButton
          icon={Save}
          label={saving ? 'Guardando…' : mode === 'create' ? 'Guardar' : 'Guardar cambios'}
          tone="success"
          onClick={onSave}
          disabled={saving}
        />
      )}
    </div>
  )
}
