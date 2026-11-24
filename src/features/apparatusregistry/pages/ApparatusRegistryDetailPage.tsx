import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Camera,
  Copy,
  FileText,
  FileUp,
  ImagePlus,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import FormActions, { type FormMode } from '../../../shared/components/forms/FormActions'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import UnsavedChangesDialog from '../../../shared/components/navigation/UnsavedChangesDialog'
import { useGuardedNavigation } from '../../../shared/hooks/useGuardedNavigation'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import IconButton from '../../../shared/components/buttons/IconButton'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import AssetQrCode from '../../../shared/components/qr/AssetQrCode'
import { useEscapeAsCancel } from '../../../shared/hooks/useEscapeAsCancel'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import {
  createEmptyApparatus,
  fromDatabase,
  toDatabase,
  type ApparatusRegistry,
  type DatabaseApparatusRegistry,
} from '../lib/apparatusRegistry'

const PHOTO_BUCKET = 'apparatus-registry'
const DOCUMENT_BUCKET = 'apparatus-registry-documents'
type HotelLocationOption = {
  id: string
  parent_location_id: string | null
  location_type: string
  code: string | null
  name: string
  active: boolean
  sort_order: number
}
function formatLocationPath(locationId: string, locations: HotelLocationOption[]) {
  const byId = new Map(locations.map((item) => [item.id, item]))
  const path: string[] = []
  const visited = new Set<string>()
  let current = byId.get(locationId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parent_location_id ? byId.get(current.parent_location_id) : undefined
  }
  return path.join(' / ')
}
function generateId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 10)
  )
}
function getStoragePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return null

  try {
    return decodeURIComponent(url.slice(index + marker.length))
  } catch {
    return url.slice(index + marker.length)
  }
}

export default function ApparatusRegistryDetailPage() {
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'

  const [item, setItem] = useState<ApparatusRegistry>(() => createEmptyApparatus())
  const [baseline, setBaseline] = useState<ApparatusRegistry>(() => createEmptyApparatus())
  const [mode, setMode] = useState<FormMode>(isNew ? 'create' : 'view')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null)
  const [viewerMaximized, setViewerMaximized] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const { confirm } = useSystemDialog()

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const [photoCategory, setPhotoCategory] = useState<ApparatusRegistry['photos'][number]['category']>('GENERAL')
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({})
  const [locationOptions, setLocationOptions] = useState<HotelLocationOption[]>([])

  useEffect(() => {
    let alive = true
    async function loadLocationOptions() {
      if (!hotel?.id) {
        setLocationOptions([])
        return
      }
      const { data, error } = await supabase
        .from('hotel_locations')
        .select('id, parent_location_id, location_type, code, name, active, sort_order')
        .eq('hotel_id', hotel.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!alive) return
      if (error) {
        setErrorMessage(`No se pudieron cargar las ubicaciones del hotel: ${error.message}`)
        setLocationOptions([])
        return
      }
      setLocationOptions((data ?? []) as HotelLocationOption[])
    }
    void loadLocationOptions()
    return () => { alive = false }
  }, [hotel?.id])

  useEffect(() => {
    if (isNew) {
      const empty = createEmptyApparatus()
      setItem(empty)
      setBaseline(empty)
      setMode('create')

      return
    }

    if (!id) return

    async function loadRecord() {
      setLoading(true)
      setErrorMessage('')

      const { data, error } = await supabase
        .from('apparatus_registry')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        setErrorMessage(`Error cargando registro: ${error.message}`)
        setLoading(false)
        return
      }

      const loaded = fromDatabase(data as DatabaseApparatusRegistry)
      setItem(loaded)
      setBaseline(loaded)
      setMode('view')
      setLoading(false)
    }

    void loadRecord()
  }, [id, isNew])

  useEffect(() => {
    let active = true

    async function loadDocumentUrls() {
      if (!item.documents.length) {
        setDocumentUrls({})
        return
      }

      const entries = await Promise.all(
        item.documents.map(async (document) => {
          if (document.storagePath.startsWith('http://') || document.storagePath.startsWith('https://')) {
            return [document.id, document.storagePath] as const
          }

          const { data, error } = await supabase.storage
            .from(DOCUMENT_BUCKET)
            .createSignedUrl(document.storagePath, 60 * 60)

          return [document.id, error ? '' : data.signedUrl] as const
        }),
      )

      if (!active) return
      setDocumentUrls(Object.fromEntries(entries))
    }

    void loadDocumentUrls()

    return () => {
      active = false
    }
  }, [item.documents])

  function updateField<K extends keyof ApparatusRegistry>(
    field: K,
    value: ApparatusRegistry[K],
  ) {
    setItem((current) => ({ ...current, [field]: value }))
    setMessage('')
    setErrorMessage('')
  }

  async function saveRecord(navigateAfterCreate = true): Promise<boolean> {
    if (mode === 'view') return true

    if (!item.name.trim()) {
      setErrorMessage('La descripción es obligatoria.')
      return false
    }

    setSaving(true)
    setMessage('')
    setErrorMessage('')

    try {
      const payload = toDatabase({
        ...item,
        code: isNew ? '' : item.code,
      })

      if (isNew) {
        const { data, error } = await supabase
          .from('apparatus_registry')
          .insert(payload)
          .select('*')
          .single()

        if (error) {
          setErrorMessage(`Error guardando registro: ${error.message}`)
          return false
        }

        const saved = fromDatabase(data as DatabaseApparatusRegistry)
        setItem(saved)
        setBaseline(saved)
        setMode('view')
        setMessage('Registro guardado correctamente.')

        if (navigateAfterCreate) {
          navigate(`/apparatusregistry/${saved.id}`, { replace: true })
        }

        return true
      }

      const { data, error } = await supabase
        .from('apparatus_registry')
        .update(payload)
        .eq('id', item.id)
        .select('*')
        .single()

      if (error) {
        setErrorMessage(`Error actualizando registro: ${error.message}`)
        return false
      }

      const saved = fromDatabase(data as DatabaseApparatusRegistry)
      setItem(saved)
      setBaseline(saved)
      setMode('view')
      setMessage('Registro actualizado correctamente.')
      return true
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await saveRecord()
  }

  const isDirty =
    mode !== 'view' && JSON.stringify(item) !== JSON.stringify(baseline)

  const {
    requestNavigation,
    cancelNavigation,
    discardNavigation,
    saveAndNavigate,
    dialogOpen,
    saving: navigatingAndSaving,
  } = useGuardedNavigation({
    dirty: isDirty,
    onNavigate: navigate,
    onSave: () => saveRecord(false),
  })

  async function finishCancel() {
    setCancelDialogOpen(false)

    if (mode === 'edit') {
      setItem(baseline)
      setMode('view')
      setMessage('')
      setErrorMessage('')
      return
    }

    navigate('/apparatusregistry')
  }

  function handleFormCancel() {
    if (mode === 'edit' && isDirty) {
      setCancelDialogOpen(true)
      return
    }

    if (mode === 'edit') {
      setItem(baseline)
      setMode('view')
      setMessage('')
      setErrorMessage('')
      return
    }

    if (mode === 'create' && isDirty) {
      setCancelDialogOpen(true)
      return
    }

    navigate('/apparatusregistry')
  }

  async function saveAndFinishCancel() {
    const wasCreate = isNew
    const saved = await saveRecord(false)

    if (!saved) return

    setCancelDialogOpen(false)

    if (wasCreate) {
      navigate('/apparatusregistry')
    }
  }

  const onSaveAvailable = mode === 'view' ? undefined : saveAndNavigate

  useEscapeAsCancel({
    enabled: true,
    onCancel: () => {
      if (dialogOpen) {
        cancelNavigation()
        return
      }

      if (cancelDialogOpen) {
        setCancelDialogOpen(false)
        return
      }

      if (viewerPhoto) {
        setViewerPhoto(null)
        setViewerMaximized(false)
        return
      }

      if (mode === 'view') {
        navigate('/apparatusregistry')
        return
      }

      handleFormCancel()
    },
  })

  async function handlePhotoFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!files.length) return

    if (!item.id) {
      setErrorMessage('Guarda el registro antes de añadir fotografías.')
      return
    }

    setUploadingPhotos(true)
    setMessage('')
    setErrorMessage('')

    try {
      const uploadedPhotos: ApparatusRegistry['photos'] = []

      for (const file of files) {
        if (!file.type.startsWith('image/')) continue

        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${item.id}/${generateId()}.${extension}`

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        const { data: publicUrlData } = supabase.storage
          .from(PHOTO_BUCKET)
          .getPublicUrl(path)

        uploadedPhotos.push({
          id: generateId(),
          category: photoCategory,
          url: publicUrlData.publicUrl,
        })
      }

      if (!uploadedPhotos.length) {
        setErrorMessage('No se seleccionaron imágenes válidas.')
        return
      }

      const newPhotos = [...item.photos, ...uploadedPhotos]

      const { data, error } = await supabase
        .from('apparatus_registry')
        .update({ photos: newPhotos })
        .eq('id', item.id)
        .select('*')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      setItem(fromDatabase(data as DatabaseApparatusRegistry))
      setMessage(
        `${uploadedPhotos.length === 1 ? 'Fotografía añadida.' : `${uploadedPhotos.length} fotografías añadidas.`}`,
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Error subiendo fotografías: ${error.message}`
          : 'Error subiendo fotografías.',
      )
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!item.id || mode === 'view') return

    const photo = item.photos.find((candidate) => candidate.id === photoId)
    if (!photo) return

    const confirmed = await confirm({
      title: 'Eliminar fotografía',
      message: '¿Quieres eliminar esta fotografía?',
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return

    setUploadingPhotos(true)
    setMessage('')
    setErrorMessage('')

    try {
      const path = getStoragePathFromPublicUrl(photo.url)

      if (path) {
        const { error: storageError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .remove([path])

        if (storageError) {
          throw new Error(storageError.message)
        }
      }

      const newPhotos = item.photos.filter((candidate) => candidate.id !== photoId)

      const { data, error } = await supabase
        .from('apparatus_registry')
        .update({ photos: newPhotos })
        .eq('id', item.id)
        .select('*')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      setItem(fromDatabase(data as DatabaseApparatusRegistry))
      setMessage('Fotografía eliminada.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Error eliminando fotografía: ${error.message}`
          : 'Error eliminando fotografía.',
      )
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function handleDocumentFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!files.length) return

    if (!item.id) {
      setErrorMessage('Guarda el registro antes de añadir documentos.')
      return
    }

    setUploadingPhotos(true)
    setMessage('')
    setErrorMessage('')

    try {
      const uploadedDocuments: ApparatusRegistry['documents'] = []

      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${item.id}/${generateId()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        uploadedDocuments.push({
          id: generateId(),
          name: file.name,
          storagePath: path,
        })
      }

      if (!uploadedDocuments.length) return

      const documents = [...item.documents, ...uploadedDocuments]

      const { data, error } = await supabase
        .from('apparatus_registry')
        .update({ documents })
        .eq('id', item.id)
        .select('*')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      setItem(fromDatabase(data as DatabaseApparatusRegistry))
      setMessage(
        `${uploadedDocuments.length === 1 ? 'Documento añadido.' : `${uploadedDocuments.length} documentos añadidos.`}`,
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Error subiendo documentos: ${error.message}`
          : 'Error subiendo documentos.',
      )
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!item.id || mode === 'view') return

    const document = item.documents.find((candidate) => candidate.id === documentId)
    if (!document) return

    const confirmed = await confirm({
      title: 'Eliminar documento',
      message: '¿Quieres eliminar este documento?',
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return

    setUploadingPhotos(true)
    setMessage('')
    setErrorMessage('')

    try {
      if (
        document.storagePath &&
        !document.storagePath.startsWith('http://') &&
        !document.storagePath.startsWith('https://')
      ) {
        const { error: storageError } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .remove([document.storagePath])

        if (storageError) {
          throw new Error(storageError.message)
        }
      }

      const documents = item.documents.filter((candidate) => candidate.id !== documentId)

      const { data, error } = await supabase
        .from('apparatus_registry')
        .update({ documents })
        .eq('id', item.id)
        .select('*')
        .single()

      if (error) {
        throw new Error(error.message)
      }

      setItem(fromDatabase(data as DatabaseApparatusRegistry))
      setMessage('Documento eliminado.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Error eliminando documento: ${error.message}`
          : 'Error eliminando documento.',
      )
    } finally {
      setUploadingPhotos(false)
    }
  }

  function updateTechnicalDatum(id: string, field: 'label' | 'value', value: string) {
    updateField(
      'technicalData',
      item.technicalData.map((datum) =>
        datum.id === id ? { ...datum, [field]: value } : datum,
      ),
    )
  }

  function addTechnicalDatum(label = '') {
    updateField('technicalData', [
      ...item.technicalData,
      {
        id: generateId(),
        label,
        value: '',
      },
    ])
  }

  const technicalPresets = [
    'Potencia (kW)',
    'Tensión (V)',
    'Intensidad (A)',
    'Caudal (m³/h)',
    'Presión (bar)',
    'Temperatura (°C)',
    'Capacidad',
    'Refrigerante',
    'Dimensiones',
  ]


  function removeTechnicalDatum(id: string) {
    updateField(
      'technicalData',
      item.technicalData.filter((datum) => datum.id !== id),
    )
  }

  function openReport() {
    if (!item.id) {
      setErrorMessage('El registro todavía no está guardado.')
      return
    }

    const params = new URLSearchParams({
      scope: 'SELECTED',
      selectedId: item.id,
    })

    navigate(`/apparatusregistry/report?${params.toString()}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-5">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-lg">
          Cargando registro…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo
                onActivate={() => requestNavigation('/')}
                className="h-11 w-[104px] shrink-0 object-contain sm:h-13 sm:w-auto"
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                  Equipos e instalaciones
                </h1>
                <p className="text-sm text-slate-500">
                  {isNew ? 'Nuevo registro' : item.code}
                </p>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:justify-end">
              <BackButton
                onBack={() => {
                  if (mode === 'view') {
                    navigate('/apparatusregistry')
                    return
                  }

                  handleFormCancel()
                }}
                disabled={saving || uploadingPhotos}
              />
              <HomeButton onHome={() => requestNavigation('/')} disabled={saving || uploadingPhotos} className="justify-self-center" />
              <div className="col-span-2 lg:col-auto">
                <FormActions
                mode={mode}
                onSave={() => void saveRecord()}
                onCancel={handleFormCancel}
                onEdit={() => setMode('edit')}
                onReport={openReport}
                saving={saving || uploadingPhotos}
              />
              </div>
            </div>
          </div>
        </div>

        {(message || errorMessage) && (
          <div
            className={`mb-4 rounded-xl border p-3 text-sm shadow-sm ${
              errorMessage
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}
          >
            {errorMessage || message}
          </div>
        )}

        <form
          id="apparatus-detail-form"
          onSubmit={handleSave}
          className="rounded-2xl bg-white p-4 shadow-lg sm:p-6"
        >
          <h2 className="mb-4 text-lg font-bold text-slate-900">
            Identificación
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Código
              </span>
              <input
                value={item.code}
                readOnly
                className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 font-semibold uppercase text-slate-700 outline-none"
                placeholder={isNew ? 'Se asignará al guardar' : undefined}
                disabled
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Descripción
              </span>
              <input
                value={item.name}
                placeholder="Descripción del equipo o instalación"
                onChange={(event) => updateField('name', event.target.value)}
                disabled={mode === 'view'}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none transition placeholder:text-slate-400 placeholder:italic focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                required
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Ubicación estructurada
              </span>
              <select
                value={item.locationId ?? ''}
                onChange={(event) => updateField('locationId', event.target.value)}
                disabled={mode === 'view' || !hotel?.id}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
              >
                <option value="">Sin ubicación catalogada</option>
                {locationOptions
                  .filter((location) => location.active || location.id === item.locationId)
                  .map((location) => (
                    <option key={location.id} value={location.id} disabled={!location.active}>
                      {formatLocationPath(location.id, locationOptions)} · {location.location_type}{location.code ? ` · ${location.code}` : ''}{location.active ? '' : ' · Inactiva (referencia existente)'}
                    </option>
                  ))}
              </select>
              <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                Selecciona una ubicación del catálogo del hotel activo. No se crea una ubicación desde esta ficha.
              </span>
            </label>
            {(item.plant || item.location) && (
              <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <strong>Referencia textual anterior:</strong> {[item.plant, item.location].filter(Boolean).join(' · ')}
                <p className="mt-1 text-[11px] text-slate-500">Se conserva para no perder la información histórica. No se convierte automáticamente en una ubicación estructurada.</p>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Tipo de equipo
              </span>
              <input
                value={item.equipmentType}
                placeholder="Ej. Bomba, UTA, cuadro eléctrico…"
                onChange={(event) => updateField('equipmentType', event.target.value)}
                disabled={mode === 'view'}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Sistema
              </span>
              <input
                value={item.systemName}
                placeholder="Sistema o instalación a la que pertenece"
                onChange={(event) => updateField('systemName', event.target.value)}
                disabled={mode === 'view'}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </label>
          </div>

          {item.id && (
            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
              <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <div className="text-sm font-bold text-slate-800">Identificación rápida</div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Enlace directo a la ficha del activo para uso desde móvil.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={`${import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin}/apparatusregistry/${item.id}`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  />
                  <ActionButton
                    icon={Copy}
                    label="Copiar enlace"
                    onClick={() => void navigator.clipboard?.writeText(`${import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin}/apparatusregistry/${item.id}`)}
                  />
                </div>
              </div>
              <AssetQrCode
                value={`${import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin}/apparatusregistry/${item.id}`}
                label={item.code}
              />
            </div>
          )}

          <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="mb-3">
              <div className="text-sm font-bold text-slate-800">
                Datos técnicos del aparato
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Marca, modelo y número de serie del fabricante. Los parámetros propios del aparato son opcionales.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">
                  Fabricante
                </span>
                <input
                  value={item.manufacturer}
                  placeholder="Fabricante"
                  onChange={(event) => updateField('manufacturer', event.target.value)}
                  disabled={mode === 'view'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">
                  Modelo
                </span>
                <input
                  value={item.model}
                  placeholder="Modelo"
                  onChange={(event) => updateField('model', event.target.value)}
                  disabled={mode === 'view'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">
                  Nº de serie
                </span>
                <input
                  value={item.serialNumber}
                  placeholder="Número de serie"
                  onChange={(event) => updateField('serialNumber', event.target.value)}
                  disabled={mode === 'view'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">
                  Fecha de instalación
                </span>
                <input
                  type="date"
                  value={item.installationDate}
                  onChange={(event) => updateField('installationDate', event.target.value)}
                  disabled={mode === 'view'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </label>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    Parámetros técnicos
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                    Añade solo los datos que correspondan a este aparato.
                  </p>
                </div>
                <ActionButton
                  icon={Plus}
                  label="Añadir dato"
                  onClick={() => addTechnicalDatum()}
                  disabled={mode === 'view'}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {technicalPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => addTechnicalDatum(preset)}
                    disabled={mode === 'view'}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              {item.technicalData.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                  Sin parámetros técnicos añadidos
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {item.technicalData.map((datum) => (
                    <div key={datum.id} className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                      <input
                        value={datum.label}
                        placeholder="Parámetro"
                        disabled={mode === 'view'}
                        onChange={(event) => updateTechnicalDatum(datum.id, 'label', event.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                      />
                      <input
                        value={datum.value}
                        placeholder="Valor"
                        disabled={mode === 'view'}
                        onChange={(event) => updateTechnicalDatum(datum.id, 'value', event.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                      />
                      <IconButton
                        icon={Trash2}
                        label="Eliminar dato técnico"
                        title="Eliminar dato técnico"
                        onClick={() => removeTechnicalDatum(datum.id)}
                        disabled={mode === 'view'}
                        className="h-9 w-9"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-800">
                  Mantenimiento
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Este dato queda en la ficha maestra; PAM, OT e histórico se enlazan al mismo activo.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
                Base Arias Suite
              </span>
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Empresa de mantenimiento
              </span>
              <input
                value={item.maintenance}
                placeholder="Empresa que lleva el mantenimiento de este equipo"
                onChange={(event) => updateField('maintenance', event.target.value)}
                disabled={mode === 'view'}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </label>
          </div>

          <hr className="my-6" />

          <h2 className="mb-1 text-lg font-bold text-slate-900">
            Fotografías del activo
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Puedes guardar tantas fotografías como necesites: equipo, placa de características, instalación, cuadro de mando, etc.
          </p>

          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo de fotografía
              </span>
              <select
                value={photoCategory}
                onChange={(event) => setPhotoCategory(event.target.value as ApparatusRegistry['photos'][number]['category'])}
                disabled={mode === 'view' || uploadingPhotos}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 sm:max-w-xs"
              >
                <option value="GENERAL">Foto general</option>
                <option value="NAMEPLATE">Placa de características</option>
                <option value="INSTALLATION">Instalación</option>
                <option value="CONTROL">Cuadro / control</option>
                <option value="OTHER">Otras</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <label
              className={`relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 via-blue-50 to-blue-100/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_2px_5px_rgba(37,99,235,0.12)] transition-all duration-150 ${
                !item.id || mode === 'view' || uploadingPhotos
                  ? 'cursor-not-allowed opacity-45'
                  : 'cursor-pointer hover:-translate-y-1 hover:border-blue-200 hover:from-blue-50 hover:via-blue-100 hover:to-blue-200/80 hover:shadow-[0_8px_16px_rgba(37,99,235,0.18)] active:translate-y-0'
              }`}>
              <Camera size={17} />
              Hacer foto
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={!item.id || mode === 'view' || uploadingPhotos}
                onChange={handlePhotoFiles}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </label>

            <label
              className={`relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 via-blue-50 to-blue-100/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_2px_5px_rgba(37,99,235,0.12)] transition-all duration-150 ${
                !item.id || mode === 'view' || uploadingPhotos
                  ? 'cursor-not-allowed opacity-45'
                  : 'cursor-pointer hover:-translate-y-1 hover:border-blue-200 hover:from-blue-50 hover:via-blue-100 hover:to-blue-200/80 hover:shadow-[0_8px_16px_rgba(37,99,235,0.18)] active:translate-y-0'
              }`}>
              <ImagePlus size={17} />
              Seleccionar imagen
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={!item.id || mode === 'view' || uploadingPhotos}
                onChange={handlePhotoFiles}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </label>
          </div>

          {!item.id && (
            <p className="mt-2 text-xs text-slate-500">
              Guarda el registro para poder añadir fotografías.
            </p>
          )}

          {item.photos.length === 0 ? (
            <div className="mt-4 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Sin fotografías
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {item.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setViewerPhoto(photo.url)
                      setViewerMaximized(false)
                    }}
                    className="block w-full cursor-zoom-in"
                    title="Ver fotografía en grande"
                  >
                    <img
                      src={photo.url}
                      alt={`Fotografía ${photo.category.toLowerCase()} ${item.code}`}
                      className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-slate-900/70 px-2 py-1 text-[9px] font-semibold text-white">
                    {photo.category === 'GENERAL'
                      ? 'General'
                      : photo.category === 'NAMEPLATE'
                        ? 'Placa'
                        : photo.category === 'INSTALLATION'
                          ? 'Instalación'
                          : photo.category === 'CONTROL'
                            ? 'Control'
                            : 'Otras'}
                  </div>
                  <IconButton
                    icon={X}
                    label="Eliminar fotografía"
                    title="Eliminar fotografía"
                    onClick={() => void handleDeletePhoto(photo.id)}
                    disabled={mode === 'view' || uploadingPhotos}
                    className="absolute right-2 top-2 h-8 w-8"
                  />
                </div>
              ))}
            </div>
          )}

          <hr className="my-6" />

          <section>
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              Observaciones
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Información del equipo que no quede recogida en los campos estructurados.
            </p>
            <textarea
              rows={5}
              value={item.observations}
              placeholder="Estado general, acceso, particularidades, incidencias conocidas, recomendaciones…"
              onChange={(event) => updateField('observations', event.target.value)}
              disabled={mode === 'view'}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 placeholder:italic focus:border-blue-500 disabled:bg-slate-100"
            />
          </section>

          <section className="mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="mb-1 text-lg font-bold text-slate-900">
                  Documentación
                </h2>
                <p className="text-xs text-slate-500">
                  Manuales, fichas técnicas, certificados, esquemas e informes asociados al activo.
                </p>
              </div>
              <label className={'relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 via-blue-50 to-blue-100/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-[0_2px_5px_rgba(37,99,235,0.12)] transition-all duration-150 ' + (mode === 'view' || uploadingPhotos ? 'cursor-not-allowed opacity-45' : 'hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_8px_16px_rgba(37,99,235,0.18)]')}>
                <FileUp size={17} />
                Subir documento
                <input
                  ref={documentInputRef}
                  type="file"
                  multiple
                  disabled={mode === 'view' || uploadingPhotos || !item.id}
                  onChange={handleDocumentFiles}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </label>
            </div>

            {item.documents.length === 0 ? (
              <div className="mt-3 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Sin documentos asociados
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {item.documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <FileText className="shrink-0 text-slate-500" size={18} />
                    <div className="min-w-0 flex-1">
                      {documentUrls[document.id] ? (
                        <a
                          href={documentUrls[document.id]}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-semibold text-blue-700 hover:underline"
                        >
                          {document.name}
                        </a>
                      ) : (
                        <span className="block truncate text-sm font-semibold text-slate-500">
                          {document.name}
                        </span>
                      )}
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        Documento del activo
                      </div>
                    </div>
                    <IconButton
                      icon={Trash2}
                      label="Eliminar documento"
                      title="Eliminar documento"
                      onClick={() => void handleDeleteDocument(document.id)}
                      disabled={mode === 'view' || uploadingPhotos}
                      className="h-8 w-8"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <hr className="my-6" />

          <label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={item.active}
              onChange={(event) => updateField('active', event.target.checked)}
              disabled={mode === 'view'}
              className="h-5 w-5 rounded border-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            Registro activo
          </label>


        </form>


        <UnsavedChangesDialog
          open={cancelDialogOpen}
          onCancel={() => setCancelDialogOpen(false)}
          onDiscard={finishCancel}
          onSaveAndContinue={() => void saveAndFinishCancel()}
          title="Hay cambios sin guardar"
          message="¿Quieres guardar los cambios antes de volver a la vista del registro?"
          discardLabel="Descartar cambios"
          saveLabel="Guardar cambios"
          saving={saving}
        />

        <UnsavedChangesDialog
          open={dialogOpen}
          onCancel={cancelNavigation}
          onDiscard={discardNavigation}
          onSaveAndContinue={onSaveAvailable}
          saving={navigatingAndSaving}
        />
        {viewerPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Visor de fotografía"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setViewerPhoto(null)
                setViewerMaximized(false)
              }
            }}
          >
            <div
              className={`relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-all ${
                viewerMaximized
                  ? 'h-full w-full'
                  : 'max-h-[88vh] w-full max-w-4xl'
              }`}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {item.code}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.name}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <IconButton
                    icon={viewerMaximized ? Minimize2 : Maximize2}
                    label={viewerMaximized ? 'Restaurar tamaño' : 'Maximizar'}
                    title={viewerMaximized ? 'Restaurar tamaño' : 'Maximizar'}
                    onClick={() => setViewerMaximized((current) => !current)}
                    className="h-9 w-9"
                  />
                  <IconButton
                    icon={X}
                    label="Cerrar"
                    title="Cerrar"
                    onClick={() => {
                      setViewerPhoto(null)
                      setViewerMaximized(false)
                    }}
                    className="h-9 w-9"
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-900 p-3 sm:p-5">
                <img
                  src={viewerPhoto}
                  alt={`Fotografía ampliada ${item.code}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
