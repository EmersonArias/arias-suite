import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderTree,
  MapPin,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'

type HotelLocation = {
  id: string
  hotel_id: string
  parent_location_id: string | null
  location_type: string
  code: string | null
  name: string
  description: string | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

type LocationTreeRow = HotelLocation & {
  depth: number
  path: string
  hasChildren: boolean
}

type LocationForm = {
  parent_location_id: string
  location_type: string
  customType: string
  code: string
  name: string
  description: string
  sort_order: string
}

const LOCATION_TYPES = [
  { value: 'PLANTA', label: 'Planta' },
  { value: 'SOTANO', label: 'Sótano' },
  { value: 'HABITACION', label: 'Habitación' },
  { value: 'SALA_TECNICA', label: 'Sala técnica' },
  { value: 'ZONA_COMUN', label: 'Zona común' },
  { value: 'CUBIERTA', label: 'Cubierta' },
  { value: 'ALMACEN', label: 'Almacén' },
  { value: 'AREA_SERVICIO', label: 'Área de servicio' },
  { value: 'OTRO', label: 'Otro' },
] as const

const EMPTY_FORM: LocationForm = {
  parent_location_id: '',
  location_type: 'OTRO',
  customType: '',
  code: '',
  name: '',
  description: '',
  sort_order: '0',
}

function typeLabel(value: string) {
  return LOCATION_TYPES.find((item) => item.value === value)?.label ?? value
}

function sortLocations(items: HotelLocation[]) {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true })
  })
}

function buildTreeRows(
  locations: HotelLocation[],
  expandedIds: Set<string>,
  searchTerm: string,
): LocationTreeRow[] {
  const byId = new Map(locations.map((item) => [item.id, item]))
  const childrenByParent = new Map<string | null, HotelLocation[]>()

  for (const item of locations) {
    const validParent = item.parent_location_id && byId.has(item.parent_location_id)
      ? item.parent_location_id
      : null
    const children = childrenByParent.get(validParent) ?? []
    children.push(item)
    childrenByParent.set(validParent, children)
  }

  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, sortLocations(children))
  }

  const allRows: LocationTreeRow[] = []
  const visited = new Set<string>()

  function visit(item: HotelLocation, depth: number, parentPath: string[]) {
    if (visited.has(item.id)) return
    visited.add(item.id)

    const pathParts = [...parentPath, item.name]
    const children = childrenByParent.get(item.id) ?? []
    allRows.push({
      ...item,
      depth,
      path: pathParts.join(' / '),
      hasChildren: children.length > 0,
    })

    for (const child of children) visit(child, depth + 1, pathParts)
  }

  for (const root of childrenByParent.get(null) ?? []) visit(root, 0, [])
  // A second pass keeps malformed/orphaned records visible instead of hiding them.
  for (const item of sortLocations(locations)) {
    if (!visited.has(item.id)) visit(item, 0, [])
  }

  const query = searchTerm.trim().toLocaleLowerCase('es')
  if (query) {
    const included = new Set<string>()
    const matches = allRows.filter((row) =>
      [row.name, row.code ?? '', typeLabel(row.location_type), row.description ?? '', row.path]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query),
    )

    for (const match of matches) {
      let current: HotelLocation | undefined = match
      const lineage = new Set<string>()
      while (current && !lineage.has(current.id)) {
        lineage.add(current.id)
        included.add(current.id)
        current = current.parent_location_id ? byId.get(current.parent_location_id) : undefined
      }
    }

    return allRows.filter((row) => included.has(row.id))
  }

  const visibleIds = new Set<string>()
  return allRows.filter((row) => {
    const validParent = row.parent_location_id && byId.has(row.parent_location_id)
      ? row.parent_location_id
      : null

    if (validParent && (!visibleIds.has(validParent) || !expandedIds.has(validParent))) {
      return false
    }

    visibleIds.add(row.id)
    return true
  })
}

function descendantIds(locations: HotelLocation[], rootId: string) {
  const result = new Set<string>()
  const queue = [rootId]

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue

    for (const item of locations) {
      if (item.parent_location_id === current && !result.has(item.id)) {
        result.add(item.id)
        queue.push(item.id)
      }
    }
  }

  return result
}

export default function HotelStructurePage() {
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const { confirm, alert: showAlert } = useSystemDialog()
  const hotelId = hotel?.id ?? ''

  const [locations, setLocations] = useState<HotelLocation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [copyRootName, setCopyRootName] = useState('')
  const [copyTargetParentId, setCopyTargetParentId] = useState('')
  const [copying, setCopying] = useState(false)

  const loadLocations = useCallback(async (targetHotelId: string, preferredId?: string) => {
    if (!targetHotelId) {
      setLocations([])
      setSelectedId('')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError('')

    const { data, error } = await supabase
      .from('hotel_locations')
      .select('id, hotel_id, parent_location_id, location_type, code, name, description, sort_order, active, created_at, updated_at')
      .eq('hotel_id', targetHotelId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      setLoadError(
        `No se pudo cargar la estructura del hotel: ${error.message}. Comprueba que la migración 066 está aplicada y que tu usuario tiene acceso al módulo de mantenimiento.`,
      )
      setLoading(false)
      return
    }

    const loaded = (data ?? []) as HotelLocation[]
    setLocations(loaded)
    setExpandedIds(new Set(loaded.map((item) => item.id)))
    setSelectedId((current) => {
      const preferred = preferredId ?? current
      return loaded.some((item) => item.id === preferred)
        ? preferred
        : loaded[0]?.id ?? ''
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadLocations(hotelId)
  }, [hotelId, loadLocations])

  const selected = locations.find((item) => item.id === selectedId) ?? null
  const activeCount = locations.filter((item) => item.active).length
  const inactiveCount = locations.length - activeCount
  const rootCount = locations.filter((item) => !item.parent_location_id).length

  const treeRows = useMemo(
    () => buildTreeRows(locations, expandedIds, search),
    [locations, expandedIds, search],
  )

  const visibleRows = useMemo(
    () => treeRows.filter((item) =>
      statusFilter === 'ALL'
        ? true
        : statusFilter === 'ACTIVE'
          ? item.active
          : !item.active,
    ),
    [treeRows, statusFilter],
  )

  const descendantsOfEditing = useMemo(
    () => editingId ? descendantIds(locations, editingId) : new Set<string>(),
    [locations, editingId],
  )
  const descendantsOfCopy = useMemo(
    () => copySourceId ? descendantIds(locations, copySourceId) : new Set<string>(),
    [locations, copySourceId],
  )

  function startCreate(parentId: string | null = null) {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      parent_location_id: parentId ?? '',
      sort_order: parentId
        ? String((locations.filter((item) => item.parent_location_id === parentId).length + 1) * 10)
        : String((locations.filter((item) => !item.parent_location_id).length + 1) * 10),
    })
    setFormOpen(true)
    setActionError('')
    if (parentId) {
      setExpandedIds((current) => new Set(current).add(parentId))
    }
  }

  function startEdit(item: HotelLocation) {
    const presetType = LOCATION_TYPES.some((option) => option.value === item.location_type)
    setEditingId(item.id)
    setForm({
      parent_location_id: item.parent_location_id ?? '',
      location_type: presetType ? item.location_type : '__CUSTOM__',
      customType: presetType ? '' : item.location_type,
      code: item.code ?? '',
      name: item.name,
      description: item.description ?? '',
      sort_order: String(item.sort_order),
    })
    setFormOpen(true)
    setActionError('')
  }

  function startCopy(item: HotelLocation) {
    if (!item.active) return
    setFormOpen(false)
    setEditingId(null)
    setCopySourceId(item.id)
    setCopyRootName(`${item.name} (copia)`)
    setCopyTargetParentId(item.parent_location_id ?? '')
    setCopyOpen(true)
    setActionError('')
  }

  function changeForm<K extends keyof LocationForm>(key: K, value: LocationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setActionError('')
  }

  async function copySubtree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hotelId || !copySourceId || !copyRootName.trim()) {
      setActionError('Indica el nombre de la copia.')
      return
    }
    if (copyTargetParentId && descendantsOfCopy.has(copyTargetParentId)) {
      setActionError('El destino no puede estar dentro de la estructura que se copia.')
      return
    }
    setCopying(true)
    setActionError('')
    try {
      const { data, error } = await supabase.rpc('copy_hotel_location_subtree', {
        target_hotel_id: hotelId,
        source_location_id: copySourceId,
        target_parent_location_id: copyTargetParentId || null,
        target_root_name: copyRootName.trim(),
      })
      if (error) {
        setActionError(`No se pudo copiar la estructura: ${error.message}`)
        return
      }
      const value = Array.isArray(data) ? data[0] : data
      const copiedId = typeof value === 'string'
        ? value
        : value && typeof value === 'object'
          ? Object.values(value as Record<string, unknown>).find((part): part is string => typeof part === 'string') ?? ''
          : ''
      setCopyOpen(false)
      setCopySourceId(null)
      await loadLocations(hotelId, copiedId || undefined)
    } catch (error) {
      setActionError(error instanceof Error ? `No se pudo copiar la estructura: ${error.message}` : 'No se pudo copiar la estructura.')
    } finally {
      setCopying(false)
    }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hotelId) {
      setActionError('No hay un hotel activo seleccionado.')
      return
    }

    const name = form.name.trim()
    const customType = form.customType.trim()
    const locationType = form.location_type === '__CUSTOM__' ? customType : form.location_type

    if (!name) {
      setActionError('El nombre de la ubicación es obligatorio.')
      return
    }
    if (!locationType) {
      setActionError('Indica el tipo de ubicación personalizado.')
      return
    }
    if (form.parent_location_id) {
      const parent = locations.find((item) => item.id === form.parent_location_id)
      if (!parent || !parent.active) {
        setActionError('La ubicación superior debe existir y estar activa.')
        return
      }
    }

    setSaving(true)
    setActionError('')

    try {
      const payload = {
        parent_location_id: form.parent_location_id || null,
        location_type: locationType,
        code: form.code.trim() || null,
        name,
        description: form.description.trim() || null,
        sort_order: Number.isFinite(Number(form.sort_order)) ? Number(form.sort_order) : 0,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const { error } = await supabase
          .from('hotel_locations')
          .update(payload)
          .eq('hotel_id', hotelId)
          .eq('id', editingId)

        if (error) {
          setActionError(`No se pudo modificar la ubicación: ${error.message}`)
          return
        }

        await loadLocations(hotelId, editingId)
      } else {
        const { data, error } = await supabase
          .from('hotel_locations')
          .insert({ ...payload, hotel_id: hotelId })
          .select('id')
          .single()

        if (error) {
          setActionError(`No se pudo crear la ubicación: ${error.message}`)
          return
        }

        const createdId = (data as { id: string }).id
        const parentId = form.parent_location_id
        if (parentId) setExpandedIds((current) => new Set(current).add(parentId))
        await loadLocations(hotelId, createdId)
      }

      setFormOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item: HotelLocation) {
    const action = item.active ? 'desactivar' : 'activar'
    const accepted = await confirm({
      title: item.active ? 'Desactivar ubicación' : 'Activar ubicación',
      message: item.active
        ? `Se desactivará “${item.name}”. El registro y sus relaciones históricas se conservarán. Si contiene ubicaciones activas, tendrás que desactivarlas primero.`
        : `Se volverá a activar “${item.name}”.`,
      variant: item.active ? 'warning' : 'info',
      confirmLabel: item.active ? 'Desactivar' : 'Activar',
      cancelLabel: 'Cancelar',
    })
    if (!accepted || !hotelId) return

    setActionError('')
    const descendants = descendantIds(locations, item.id)
    if (item.active && locations.some((candidate) =>
      candidate.active && descendants.has(candidate.id),
    )) {
      await showAlert({
        title: 'Hay ubicaciones activas debajo',
        message: 'Desactiva primero las ubicaciones hijas y vuelve a intentarlo. No se ha modificado ningún registro.',
        variant: 'warning',
      })
      return
    }

    const { error } = await supabase
      .from('hotel_locations')
      .update({ active: !item.active, updated_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('id', item.id)

    if (error) {
      setActionError(`No se pudo ${action} la ubicación: ${error.message}`)
      return
    }

    await loadLocations(hotelId, item.id)
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight sm:text-2xl">Estructura del hotel</h1>
                <p className="text-xs text-slate-500 sm:text-sm">Configura las ubicaciones físicas de cada hotel sin duplicar equipos.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BackButton onBack={() => navigate('/maintenance/configuration')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
          </div>
        </header>

        <section className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hotel activo</div>
            <div className="mt-1 truncate text-base font-bold text-slate-900">{hotel?.name ?? '—'}</div>
            <p className="mt-1 text-xs text-slate-500">Cada hotel mantiene su propia estructura y sus propios nombres.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong>{activeCount}</strong> activas</div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong>{rootCount}</strong> principales</div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong>{inactiveCount}</strong> inactivas</div>
          </div>
        </section>

        {(loadError || actionError) && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {actionError || loadError}
          </div>
        )}

        <section className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:max-w-2xl">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar ubicación</span>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nombre, código, tipo o ruta…"
                    className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                  <option value="ACTIVE">Solo activas</option>
                  <option value="ALL">Todas</option>
                  <option value="INACTIVE">Solo inactivas</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={RefreshCw} label={loading ? 'Cargando…' : 'Actualizar'} onClick={() => void loadLocations(hotelId, selectedId)} disabled={loading || !hotelId} />
              <ActionButton icon={Plus} label="Nueva ubicación" tone="primary" onClick={() => startCreate()} disabled={!hotelId || loading} />
              <ActionButton icon={Plus} label="Añadir hija" onClick={() => selected && startCreate(selected.id)} disabled={!selected || !selected.active || loading} />
              <ActionButton icon={Copy} label="Copiar estructura" onClick={() => selected && startCopy(selected)} disabled={!selected || !selected.active || loading || copying} />
              <ActionButton icon={Pencil} label="Modificar" onClick={() => selected && startEdit(selected)} disabled={!selected || loading} />
              <ActionButton icon={Power} label={selected?.active ? 'Desactivar' : 'Activar'} onClick={() => selected && void toggleActive(selected)} disabled={!selected || loading} />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            No se borran ubicaciones desde esta pantalla. Se desactivan para conservar sus referencias e histórico.
          </p>
        </section>

        {formOpen && (
          <section className="mb-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{editingId ? 'Modificar ubicación' : 'Nueva ubicación'}</h2>
                <p className="mt-1 text-xs text-slate-500">Elige el tipo y la ubicación superior cuando corresponda. No es obligatorio crear plantas o habitaciones si el hotel no las necesita.</p>
              </div>
              <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); setActionError('') }} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" aria-label="Cerrar formulario"><X size={16} /></button>
            </div>
            <form className="mt-4" onSubmit={(event) => void saveLocation(event)}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre *</span>
                  <input autoFocus value={form.name} onChange={(event) => changeForm('name', event.target.value)} maxLength={160} required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Ej. Planta 2, Habitación 201, Cuarto de bombas" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo *</span>
                  <select value={form.location_type} onChange={(event) => changeForm('location_type', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                    {LOCATION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    <option value="__CUSTOM__">Tipo personalizado…</option>
                  </select>
                </label>
                {form.location_type === '__CUSTOM__' && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo personalizado *</span>
                    <input autoFocus value={form.customType} onChange={(event) => changeForm('customType', event.target.value)} required maxLength={80} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Ej. Cuarto de bombas" />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Ubicación superior</span>
                  <select value={form.parent_location_id} onChange={(event) => changeForm('parent_location_id', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Sin ubicación superior</option>
                    {form.parent_location_id && locations.some((item) => item.id === form.parent_location_id && !item.active) && (
                      <option value={form.parent_location_id} disabled>
                        {locations.find((item) => item.id === form.parent_location_id)?.name} · inactiva (vínculo actual)
                      </option>
                    )}
                    {sortLocations(locations).filter((item) => item.active && item.id !== editingId && !descendantsOfEditing.has(item.id)).map((item) => (
                      <option key={item.id} value={item.id}>{item.name} · {typeLabel(item.location_type)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Código (opcional)</span>
                  <input value={form.code} onChange={(event) => changeForm('code', event.target.value)} maxLength={80} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Código interno del espacio" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Orden dentro del nivel</span>
                  <input type="number" value={form.sort_order} onChange={(event) => changeForm('sort_order', event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </label>
                <label className="block md:col-span-2 xl:col-span-3">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción / notas</span>
                  <textarea rows={2} value={form.description} onChange={(event) => changeForm('description', event.target.value)} maxLength={1000} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Información útil para el equipo de mantenimiento (opcional)." />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <ActionButton icon={X} label="Cancelar" onClick={() => { setFormOpen(false); setEditingId(null); setActionError('') }} />
                <ActionButton icon={Save} label={saving ? 'Guardando…' : 'Guardar ubicación'} type="submit" tone="primary" disabled={saving} />
              </div>
            </form>
          </section>
        )}


        {copyOpen && copySourceId && (
          <section className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Copiar estructura</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Se copiarán únicamente las ubicaciones de esta rama. No se copian equipos, números de serie, fotos, documentos, PAM, OTs ni históricos. Los códigos de ubicación se dejan vacíos para evitar duplicados.
                </p>
              </div>
              <button type="button" onClick={() => { setCopyOpen(false); setCopySourceId(null); setActionError('') }} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" aria-label="Cerrar copia"><X size={16} /></button>
            </div>
            <form className="mt-4" onSubmit={(event) => void copySubtree(event)}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nombre de la nueva raíz *</span>
                  <input value={copyRootName} onChange={(event) => { setCopyRootName(event.target.value); setActionError('') }} maxLength={160} required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Copiar debajo de</span>
                  <select value={copyTargetParentId} onChange={(event) => { setCopyTargetParentId(event.target.value); setActionError('') }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Sin ubicación superior (raíz del hotel)</option>
                    {sortLocations(locations)
                      .filter((item) => item.active && item.id !== copySourceId && !descendantsOfCopy.has(item.id))
                      .map((item) => (
                        <option key={item.id} value={item.id}>{item.name} · {typeLabel(item.location_type)}</option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <ActionButton icon={X} label="Cancelar" onClick={() => { setCopyOpen(false); setCopySourceId(null); setActionError('') }} disabled={copying} />
                <ActionButton icon={Copy} label={copying ? 'Copiando…' : 'Copiar estructura'} type="submit" tone="primary" disabled={copying || !copyRootName.trim()} />
              </div>
            </form>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FolderTree size={19} className="text-slate-500" />
            <h2 className="font-bold text-slate-900">Ubicaciones configuradas</h2>
            <span className="ml-auto text-xs text-slate-400">{visibleRows.length} visibles</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Cargando ubicaciones…</div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
              <Building2 className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">{locations.length ? 'No hay coincidencias' : 'Todavía no hay ubicaciones para este hotel'}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{locations.length ? 'Cambia la búsqueda o el filtro de estado.' : 'Crea la primera ubicación real del hotel. No se añadirán plantas ni habitaciones automáticamente.'}</p>
              {!locations.length && <div className="mt-4 flex justify-center"><ActionButton icon={Plus} label="Crear primera ubicación" tone="primary" onClick={() => startCreate()} /></div>}
            </div>
          ) : (
            <div className="space-y-1">
              {visibleRows.map((item) => {
                const isSelected = item.id === selectedId
                const hasChildren = item.hasChildren
                return (
                  <div key={item.id} className={[
                    'flex items-start gap-2 rounded-xl border px-2 py-2 transition sm:items-center sm:px-3',
                    isSelected ? 'border-blue-200 bg-blue-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50',
                    !item.active ? 'opacity-75' : '',
                  ].join(' ')}>
                    <div className="flex min-w-0 flex-1 items-start gap-1.5 sm:items-center" style={{ paddingLeft: `${Math.min(item.depth, 8) * 16}px` }}>
                      <button type="button" onClick={() => hasChildren && toggleExpanded(item.id)} disabled={!hasChildren || Boolean(search.trim())} className="mt-1 shrink-0 rounded p-1 text-slate-400 hover:bg-white disabled:cursor-default disabled:opacity-30 sm:mt-0" aria-label={expandedIds.has(item.id) ? 'Contraer ubicaciones hijas' : 'Expandir ubicaciones hijas'}>
                        {hasChildren ? (expandedIds.has(item.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="block w-4" />}
                      </button>
                      <button type="button" onClick={() => setSelectedId(item.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <MapPin size={15} className="shrink-0 text-slate-400" />
                          <span className="font-semibold text-slate-800">{item.name}</span>
                          {item.code && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{item.code}</span>}
                          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">{typeLabel(item.location_type)}</span>
                          {!item.active && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Inactiva</span>}
                        </div>
                        {(item.depth > 0 || search.trim()) && <div className="mt-1 break-words text-[11px] text-slate-500">{item.path}</div>}
                        {item.description && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description}</div>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <footer className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
          Esta primera versión administra el catálogo de ubicaciones. Los campos de texto históricos no se migran automáticamente y ningún equipo, plan PAM u OT se duplica. La asociación de registros existentes se hará expresamente cuando se confirme la ubicación correcta.
        </footer>
      </div>
    </div>
  )
}
