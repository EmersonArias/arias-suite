import { useNavigate } from 'react-router-dom'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import { useState, useRef } from 'react'

interface Pump {
  id: string
  ref: string
  model: string
  body: string
  paint: string
  pressureIn: string
  pressureOut: string
  notes: string
}

const emptyPump: Pump = {
  id: '',
  ref: '',
  model: '',
  body: '',
  paint: '',
  pressureIn: '',
  pressureOut: '',
  notes: '',
}

export default function PumpsPage() {
  const navigate = useNavigate()
  const { confirm, alert: showAlert } = useSystemDialog()

  const [editing, setEditing] = useState(false)

  const [pumps, setPumps] = useState<Pump[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [form, setForm] = useState<Pump>(emptyPump)

  const refInputRef = useRef<HTMLInputElement>(null)

  const selectPump = (pump: Pump) => {
    setSelectedId(pump.id)
    setForm({ ...pump })
    setEditing(false)
  }

  const updateField = (
    field: keyof Pump,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleNew = () => {
    setSelectedId(null)
    setForm(emptyPump)
    setEditing(true)

    setTimeout(() => {
      refInputRef.current?.focus()
    }, 50)
  }

  const handleEdit = () => {
    if (!selectedId) return

    setEditing(true)

    setTimeout(() => {
      refInputRef.current?.focus()
    }, 50)
  }

  const handleSave = async () => {
    if (!form.ref.trim()) {
      await showAlert({
        title: 'Referencia obligatoria',
        message: 'Debe indicar una referencia para guardar la bomba.',
        variant: 'warning',
      })
      return
    }

    if (selectedId) {
      setPumps((current) =>
        current.map((pump) =>
          pump.id === selectedId
            ? { ...form }
            : pump
        )
      )
    } else {
      const newPump: Pump = {
        ...form,
        id: crypto.randomUUID(),
      }

      setPumps((current) => [
        ...current,
        newPump,
      ])

      setSelectedId(newPump.id)
    }

    setEditing(false)

    if (
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur()
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return

    const confirmed = await confirm({
      title: 'Eliminar registro',
      message: `¿Quieres eliminar la bomba ${form.ref}? Esta acción no se puede deshacer.`,
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return

    setPumps((current) =>
      current.filter(
        (pump) => pump.id !== selectedId
      )
    )

    setSelectedId(null)
    setForm(emptyPump)
    setEditing(false)
  }

  const handleCancel = () => {
    if (selectedId) {
      const pump = pumps.find(
        (p) => p.id === selectedId
      )

      if (pump) {
        setForm({ ...pump })
      }
    } else {
      setForm(emptyPump)
    }

    setEditing(false)

    if (
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur()
    }
  }

  const handleRefresh = () => {
    console.log('Actualizar')
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
            className="rounded-lg bg-slate-500 px-4 py-2 text-white"
          >
            Cancelar
          </button>

          <button
            onClick={handleRefresh}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-white"
          >
            Actualizar
          </button>

          <button
            onClick={() => navigate('/')}
            className="rounded-lg bg-black px-4 py-2 text-white"
          >
            Salir
          </button>

        </div>

        <h1 className="mb-6 text-3xl font-bold">
          Revisión de Bombas
        </h1>

        <div className="grid gap-4 lg:grid-cols-3">

          <div className="rounded-xl border bg-white p-4">

            <h2 className="mb-4 text-lg font-semibold">
              Bombas
            </h2>

            <div className="space-y-2">

              {pumps.map((pump) => (
                <button
                  key={pump.id}
                  onClick={() => {
                    if (editing) return
                    selectPump(pump)
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedId === pump.id
                      ? 'border-blue-600 bg-blue-50'
                      : ''
                  } ${
                    editing
                      ? 'cursor-not-allowed opacity-60'
                      : ''
                  }`}
                >
                  {pump.ref}
                </button>
              ))}

            </div>

          </div>

          <div className="lg:col-span-2 rounded-xl border bg-white p-6">

            <div className="grid gap-4 md:grid-cols-2">

              <div>
                <label className="mb-1 block text-sm font-medium">
                  REF
                </label>

                <input
                  ref={refInputRef}
                  value={form.ref}
                  disabled={!editing}
                  onChange={(e) =>
                    updateField(
                      'ref',
                      e.target.value
                    )
                  }
                  className={`w-full rounded-lg border p-2 ${
                    editing
                      ? 'bg-white'
                      : 'bg-slate-100 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  MODELO
                </label>

                <input
                  value={form.model}
                  disabled={!editing}
                  onChange={(e) =>
                    updateField(
                      'model',
                      e.target.value
                    )
                  }
                  className={`w-full rounded-lg border p-2 ${
                    editing
                      ? 'bg-white'
                      : 'bg-slate-100 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  ESTADO CUERPO
                </label>

                <input
                  value={form.body}
                  disabled={!editing}
                  onChange={(e) =>
                    updateField(
                      'body',
                      e.target.value
                    )
                  }
                  className={`w-full rounded-lg border p-2 ${
                    editing
                      ? 'bg-white'
                      : 'bg-slate-100 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  ESTADO PINTURA
                </label>

                <input
                  value={form.paint}
                  disabled={!editing}
                  onChange={(e) =>
                    updateField(
                      'paint',
                      e.target.value
                    )
                  }
                  className={`w-full rounded-lg border p-2 ${
                    editing
                      ? 'bg-white'
                      : 'bg-slate-100 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  PRESIÓN ENTRADA
                </label>

                <input
                  value={form.pressureIn}
                  disabled={!editing}
                  onChange={(e) =>
                    updateField(
                      'pressureIn',
                      e.target.value
                    )
                  }
                  className={`w-full rounded-lg border p-2 ${
                    editing
                      ? 'bg-white'
                      : 'bg-slate-100 cursor-not-allowed'
                  }`}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  PRESIÓN SALIDA
                </label>

                <input
                  value={form.pressureOut}
                  disabled={!editing}
                  onChange={(e) =>
                    updateField(
                      'pressureOut',
                      e.target.value
                    )
                  }
                  className={`w-full rounded-lg border p-2 ${
                    editing
                      ? 'bg-white'
                      : 'bg-slate-100 cursor-not-allowed'
                  }`}
                />
              </div>

            </div>

            <div className="mt-4">

              <label className="mb-1 block text-sm font-medium">
                OBSERVACIONES
              </label>

              <textarea
                rows={5}
                value={form.notes}
                disabled={!editing}
                onChange={(e) =>
                  updateField(
                    'notes',
                    e.target.value
                  )
                }
                className={`w-full rounded-lg border p-2 ${
                  editing
                    ? 'bg-white'
                    : 'bg-slate-100 cursor-not-allowed'
                }`}
              />

            </div>

          </div>

        </div>

      </div>

    </div>
  )
}