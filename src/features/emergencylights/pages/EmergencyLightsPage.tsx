import { useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'

interface EmergencyLight {
  id: string
  code: string
  location: string
  model: string
  manufacturer: string
  installDate: string
  lastReview: string
  nextReview: string
  status: string
  pilotOk: boolean
  batteryOk: boolean
  lampOk: boolean
  notes: string
  photo?: string
}

const emptyRecord: EmergencyLight = {
  id: '',
  code: '',
  location: '',
  model: '',
  manufacturer: '',
  installDate: '',
  lastReview: '',
  nextReview: '',
  status: 'Operativa',
  pilotOk: false,
  batteryOk: false,
  lampOk: false,
  notes: '',
  photo: '',
}

export default function EmergencyLightsPage() {
  const navigate = useNavigate()
  const { confirm, alert: showAlert } = useSystemDialog()

  const [records, setRecords] = useState<EmergencyLight[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EmergencyLight>(emptyRecord)

  const codeInputRef =
    useRef<HTMLInputElement>(null)

  const inputClass = `
    w-full
    rounded-lg
    border
    p-2
    ${editing ? 'bg-white' : 'bg-slate-200'}
  `

  const generateCode = () => {
    const next =
      records.length + 1

    return `LE-${String(next).padStart(
      4,
      '0'
    )}`
  }

  const calculateNextReview = (
    date: string
  ) => {
    if (!date) return ''

    const reviewDate = new Date(date)

    reviewDate.setMonth(
      reviewDate.getMonth() + 3
    )

    return reviewDate
      .toISOString()
      .split('T')[0]
  }

  const updateField = (
    field: keyof EmergencyLight,
    value: string | boolean
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleNew = () => {
    setSelectedId(null)

    setForm({
      ...emptyRecord,
      code: generateCode(),
    })

    setEditing(true)

    setTimeout(() => {
      codeInputRef.current?.focus()
    }, 50)
  }

  const handleEdit = () => {
    if (!selectedId) return

    setEditing(true)

    setTimeout(() => {
      codeInputRef.current?.focus()
    }, 50)
  }

  const handleSave = async () => {
    if (!form.code.trim()) {
      await showAlert({
        title: 'Código obligatorio',
        message: 'Debe indicar un código para guardar la luz de emergencia.',
        variant: 'warning',
      })
      return
    }

    if (selectedId) {
      setRecords((current) =>
        current.map((record) =>
          record.id === selectedId
            ? form
            : record
        )
      )
    } else {
      const newRecord = {
        ...form,
        id: crypto.randomUUID(),
      }

      setRecords((current) => [
        ...current,
        newRecord,
      ])

      setSelectedId(newRecord.id)
    }

    setEditing(false)

    if (
      document.activeElement instanceof
      HTMLElement
    ) {
      document.activeElement.blur()
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return

    const confirmed = await confirm({
      title: 'Eliminar registro',
      message: `¿Quieres eliminar ${form.code}? Esta acción no se puede deshacer.`,
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return

    setRecords((current) =>
      current.filter(
        (record) =>
          record.id !== selectedId
      )
    )

    setSelectedId(null)
    setForm(emptyRecord)
    setEditing(false)
  }

  const handleCancel = () => {
    if (selectedId) {
      const record = records.find(
        (r) => r.id === selectedId
      )

      if (record) {
        setForm(record)
      }
    } else {
      setForm(emptyRecord)
    }

    setEditing(false)
  }

  const selectRecord = (
    record: EmergencyLight
  ) => {
    setSelectedId(record.id)
    setForm(record)
    setEditing(false)
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">

      <div className="mx-auto max-w-7xl">

        <div className="mb-4 flex flex-wrap gap-2">

          <button
            onClick={handleNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          >
            Nuevo
          </button>

          <button
            onClick={handleSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-white"
          >
            Guardar
          </button>

          <button
            onClick={handleEdit}
            className="rounded-lg bg-amber-500 px-4 py-2 text-white"
          >
            Modificar
          </button>

          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-600 px-4 py-2 text-white"
          >
            Eliminar
          </button>

          <button
            onClick={handleCancel}
            className="rounded-lg bg-slate-600 px-4 py-2 text-white"
          >
            Cancelar
          </button>

          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            Salir
          </button>

        </div>

        <h1 className="mb-6 text-3xl font-bold">
          Luces de Emergencia
        </h1>

        <div className="grid gap-4 lg:grid-cols-3">

          <div className="rounded-xl border bg-white p-4">

            <h2 className="mb-4 text-lg font-semibold">
              Luces
            </h2>

            <div className="space-y-2">

              {records.map((record) => (
                <button
                  key={record.id}
                  onClick={() =>
                    selectRecord(record)
                  }
                  className={`w-full rounded-lg border p-3 text-left ${
                    selectedId === record.id
                      ? 'border-blue-600 bg-blue-50'
                      : ''
                  }`}
                >
                  {record.code} -{' '}
                  {record.location}
                </button>
              ))}

            </div>

          </div>

          <div className="lg:col-span-2 rounded-xl border bg-white p-6">

            <div className="grid gap-4 md:grid-cols-2">

              <div>
                <label>Código</label>

                <input
                  ref={codeInputRef}
                  disabled={!editing}
                  value={form.code}
                  onChange={(e) =>
                    updateField(
                      'code',
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label>Estado</label>

                <select
                  disabled={!editing}
                  value={form.status}
                  onChange={(e) =>
                    updateField(
                      'status',
                      e.target.value
                    )
                  }
                  className={inputClass}
                >
                  <option>
                    Operativa
                  </option>
                  <option>
                    Pendiente revisión
                  </option>
                  <option>
                    Fuera de servicio
                  </option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label>
                  Ubicación
                </label>

                <input
                  disabled={!editing}
                  value={form.location}
                  onChange={(e) =>
                    updateField(
                      'location',
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label>Modelo</label>

                <input
                  disabled={!editing}
                  value={form.model}
                  onChange={(e) =>
                    updateField(
                      'model',
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label>
                  Fabricante
                </label>

                <input
                  disabled={!editing}
                  value={
                    form.manufacturer
                  }
                  onChange={(e) =>
                    updateField(
                      'manufacturer',
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label>
                  Fecha instalación
                </label>

                <input
                  type="date"
                  disabled={!editing}
                  value={
                    form.installDate
                  }
                  onChange={(e) =>
                    updateField(
                      'installDate',
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label>
                  Última revisión
                </label>

                <input
                  type="date"
                  disabled={!editing}
                  value={
                    form.lastReview
                  }
                  onChange={(e) => {
                    updateField(
                      'lastReview',
                      e.target.value
                    )

                    updateField(
                      'nextReview',
                      calculateNextReview(
                        e.target.value
                      )
                    )
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label>
                  Próxima revisión
                </label>

                <input
                  type="date"
                  disabled={!editing}
                  value={
                    form.nextReview
                  }
                  onChange={(e) =>
                    updateField(
                      'nextReview',
                      e.target.value
                    )
                  }
                  className={inputClass}
                />
              </div>

            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!editing}
                  checked={
                    form.pilotOk
                  }
                  onChange={(e) =>
                    updateField(
                      'pilotOk',
                      e.target.checked
                    )
                  }
                />
                Piloto OK
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!editing}
                  checked={
                    form.batteryOk
                  }
                  onChange={(e) =>
                    updateField(
                      'batteryOk',
                      e.target.checked
                    )
                  }
                />
                Batería OK
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!editing}
                  checked={
                    form.lampOk
                  }
                  onChange={(e) =>
                    updateField(
                      'lampOk',
                      e.target.checked
                    )
                  }
                />
                Lámpara OK
              </label>

            </div>

            <div className="mt-6">

              <label>
                Observaciones
              </label>

              <textarea
                rows={5}
                disabled={!editing}
                value={form.notes}
                onChange={(e) =>
                  updateField(
                    'notes',
                    e.target.value
                  )
                }
                className={inputClass}
              />

            </div>

            <div className="mt-6">

              <label className="mb-2 block">
                Foto
              </label>

              <input
                type="file"
                accept="image/*"
                disabled={!editing}
              />

            </div>

          </div>

        </div>

      </div>

    </div>
  )
}