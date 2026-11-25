import { previewPdf } from '../../../shared/components/reports/pdfPreview'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle, Archive, ArrowDownToLine, ArrowUpFromLine, Boxes,
  CheckCircle2, ChevronRight, ClipboardList, ExternalLink, FileDown, Mail, Package,
  Pencil, Plus, RefreshCw, Search, ShoppingCart, SlidersHorizontal, X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { validateMaterialDraft } from '../materialRequestValidation'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { useAuth } from '../../auth/context/AuthProvider'
import { supabase } from '../../../lib/supabase'

type Material = {
  id: string
  hotel_id: string
  description: string
  order_code: string
  reference_code: string | null
  provider_id: string
  active: boolean
  unit_of_measure: string
  stock_quantity: number
  stock_verified: boolean
  stock_counted_at: string | null
  minimum_stock: number
  purchase_url: string | null
  storage_location: string | null
  notes: string | null
  updated_at: string
}

type Provider = {
  id: string
  label: string
  email_main: string | null
  portal_url: string | null
  website_url: string | null
}

type RequestRecord = {
  id: string
  request_number: string
  hotel_id: string
  requester_name: string
  department: string
  cause: string
  delivery_date: string | null
  notes: string | null
  status: 'CONFIRMED' | 'CANCELLED'
  email_status: 'NOT_SENT' | 'SENDING' | 'SENT' | 'FAILED'
  recipient_email: string | null
  email_sent_at: string | null
  email_error: string | null
  confirmed_at: string
  created_at: string
}

type RequestLine = {
  id?: string
  request_id?: string
  material_id: string | null
  description: string
  reference_code: string | null
  order_code: string | null
  provider_id: string | null
  provider_name: string | null
  unit_of_measure: string
  quantity: number
  delivery_date: string | null
  purchase_url: string | null
}

type DraftLine = {
  key: string
  query: string
  material_id: string
  quantity: string
}

type MaterialForm = {
  description: string
  order_code: string
  reference_code: string
  provider_id: string
  unit_of_measure: string
  minimum_stock: string
  initial_stock: string
  purchase_url: string
  storage_location: string
  notes: string
}

type MovementForm = {
  type: 'RECEIVE' | 'ISSUE' | 'ADJUSTMENT'
  quantity: string
  reason: string
  reference: string
}

type TabKey = 'request' | 'inventory' | 'catalog' | 'history'

// Email delivery is deferred; keep the integration available for a later rollout.
const MATERIAL_REQUEST_EMAIL_ENABLED = false

const EMPTY_MATERIAL_FORM: MaterialForm = {
  description: '',
  order_code: '',
  reference_code: '',
  provider_id: '',
  unit_of_measure: 'ud',
  minimum_stock: '0',
  initial_stock: '',
  purchase_url: '',
  storage_location: '',
  notes: '',
}

const EMPTY_MOVEMENT: MovementForm = {
  type: 'RECEIVE',
  quantity: '',
  reason: '',
  reference: '',
}

function normalize(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value + (value.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-ES')
}

function formatQuantity(value: number | string | null | undefined) {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)
}

function isValidUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? '').trim())
}

function makeKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random())
}

function emailStatusLabel(status: RequestRecord['email_status']) {
  if (status === 'SENT') return 'Correo enviado'
  if (status === 'SENDING') return 'Enviando…'
  if (status === 'FAILED') return 'Error de envío'
  return 'Sin enviar'
}

function emailStatusClass(status: RequestRecord['email_status']) {
  if (status === 'SENT') return 'bg-emerald-100 text-emerald-700'
  if (status === 'FAILED') return 'bg-rose-100 text-rose-700'
  if (status === 'SENDING') return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-600'
}

export default function MaterialsInventoryPage() {
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const { session } = useAuth()

  const [tab, setTab] = useState<TabKey>('request')
  const [materials, setMaterials] = useState<Material[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [moduleReady, setModuleReady] = useState(false)
  const [migrationNotice, setMigrationNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')

  const [requesterName, setRequesterName] = useState(session?.user.fullName || session?.user.email || '')
  const [cause, setCause] = useState('Reposición de material')
  const [requestNotes, setRequestNotes] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ key: makeKey(), query: '', material_id: '', quantity: '1' }])
  const [openLineKey, setOpenLineKey] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [lastRequest, setLastRequest] = useState<{ request: RequestRecord; lines: RequestLine[] } | null>(null)

  const [materialEditorOpen, setMaterialEditorOpen] = useState(false)
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null)
  const [materialForm, setMaterialForm] = useState<MaterialForm>(EMPTY_MATERIAL_FORM)
  const [savingMaterial, setSavingMaterial] = useState(false)

  const [movementMaterial, setMovementMaterial] = useState<Material | null>(null)
  const [movementForm, setMovementForm] = useState<MovementForm>(EMPTY_MOVEMENT)
  const [savingMovement, setSavingMovement] = useState(false)
  const [countingMaterial, setCountingMaterial] = useState<Material | null>(null)
  const [stockCountForm, setStockCountForm] = useState({ quantity: '', reason: 'Inventario físico', reference: '' })
  const [savingStockCount, setSavingStockCount] = useState(false)

  const [historySelected, setHistorySelected] = useState<{ request: RequestRecord; lines: RequestLine[] } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [emailTarget, setEmailTarget] = useState<{ request: RequestRecord; lines: RequestLine[] } | null>(null)
  const [emailAddress, setEmailAddress] = useState('')
  const [emailRecipientChoice, setEmailRecipientChoice] = useState('__manual__')
  const [senderEmail, setSenderEmail] = useState(session?.user.email ?? '')

  async function loadData() {
    if (!hotel?.id) {
      setMaterials([])
      setProviders([])
      setRequests([])
      setMovements([])
      setModuleReady(false)
      setMigrationNotice('')
      setLoading(false)
      setError('Selecciona un hotel antes de gestionar materiales.')
      return
    }

    setLoading(true)
    const [materialResult, providerLinks, requestResult, movementResult, stockSchemaResult, linesSchemaResult] = await Promise.all([
      supabase.from('maintenance_material_catalog').select('*').eq('hotel_id', hotel.id).order('description', { ascending: true }),
      supabase.from('provider_hotels').select('provider_id').eq('hotel_id', hotel.id).eq('active', true),
      supabase.from('maintenance_material_requests').select('*').eq('hotel_id', hotel.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('maintenance_stock_movements').select('id, hotel_id, material_id, movement_type, quantity_delta, stock_before, stock_after, reason, reference, created_by, created_at').eq('hotel_id', hotel.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('maintenance_material_catalog').select('stock_verified, stock_counted_at, stock_quantity, minimum_stock').eq('hotel_id', hotel.id).limit(1),
      supabase.from('maintenance_material_request_lines').select('id').limit(1),
    ])

    if (materialResult.error) {
      setMaterials([])
      setRequests([])
      setMovements([])
      setModuleReady(false)
      setMigrationNotice('No se pudo cargar el catálogo de materiales. Detalle técnico: ' + materialResult.error.message)
      setLoading(false)
      return
    }

    const providerIds = Array.from(new Set((providerLinks.data ?? []).map((item) => item.provider_id as string)))
    let loadedProviders: Provider[] = []
    if (providerIds.length > 0) {
      const providerResult = await supabase
        .from('providers')
        .select('id, legal_name, trade_name, email_main, portal_url, website_url')
        .in('id', providerIds)
        .eq('active', true)
        .order('legal_name', { ascending: true })
      if (!providerResult.error) {
        loadedProviders = (providerResult.data ?? []).map((provider) => ({
          id: provider.id,
          label: provider.trade_name?.trim() || provider.legal_name,
          email_main: provider.email_main,
          portal_url: provider.portal_url,
          website_url: provider.website_url,
        }))
      }
    }

    const loadedMaterials = ((materialResult.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
      ...item,
      reference_code: (item.reference_code as string | null | undefined) ?? null,
      unit_of_measure: (item.unit_of_measure as string | null | undefined) ?? 'ud',
      stock_quantity: Number(item.stock_quantity ?? 0),
      stock_verified: Boolean(item.stock_verified ?? false),
      stock_counted_at: (item.stock_counted_at as string | null | undefined) ?? null,
      minimum_stock: Number(item.minimum_stock ?? 0),
      purchase_url: (item.purchase_url as string | null | undefined) ?? null,
      storage_location: (item.storage_location as string | null | undefined) ?? null,
      notes: (item.notes as string | null | undefined) ?? null,
    })) as unknown as Material[]

    setMaterials(loadedMaterials)
    setProviders(loadedProviders)
    setRequests(requestResult.error ? [] : (requestResult.data ?? []) as RequestRecord[])
    setMovements(movementResult.error ? [] : (movementResult.data ?? []) as Array<Record<string, unknown>>)

    const missingParts = [
      requestResult.error ? 'solicitudes/pedidos' : '',
      movementResult.error ? 'movimientos de stock' : '',
      stockSchemaResult.error ? 'inventario físico del catálogo' : '',
      linesSchemaResult.error ? 'detalle de peticiones' : '',
    ].filter(Boolean)
    const schemaReady = missingParts.length === 0
    setModuleReady(schemaReady)
    setMigrationNotice(schemaReady ? '' :
      'La migración 078 no aparece aplicada o completa en Supabase. El catálogo se conserva y se muestra en modo de consulta, pero no se pueden confirmar pedidos ni registrar movimientos de stock hasta corregir la base de datos. No se ha creado ni modificado ningún pedido. Detalle técnico: ' +
      [requestResult.error?.message, movementResult.error?.message, stockSchemaResult.error?.message, linesSchemaResult.error?.message].filter(Boolean).join(' · '))
    setLoading(false)
  }

  useEffect(() => {
    setRequesterName(session?.user.fullName || session?.user.email || '')
  }, [session?.user.fullName, session?.user.email])

  useEffect(() => {
    void loadData()
  }, [hotel?.id])

  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])
  const emailRecipientOptions = useMemo(() => {
    if (!emailTarget) return []
    const options = new Map<string, { email: string; label: string }>()
    for (const line of emailTarget.lines) {
      const provider = line.provider_id ? providerById.get(line.provider_id) : undefined
      const email = provider?.email_main?.trim().toLowerCase() ?? ''
      if (!isValidEmail(email)) continue
      const existing = options.get(email)
      const label = provider?.label || line.provider_name || 'Proveedor'
      options.set(email, {
        email,
        label: existing && !existing.label.includes(label) ? existing.label + ', ' + label : (existing?.label ?? label),
      })
    }
    return Array.from(options.values())
  }, [emailTarget, providerById])
  const activeMaterials = useMemo(() => materials.filter((material) => material.active), [materials])
  const lowStockMaterials = useMemo(
    () => moduleReady ? activeMaterials.filter((material) => material.stock_verified && Number(material.stock_quantity) <= Number(material.minimum_stock)) : [],
    [activeMaterials, moduleReady],
  )
  const uncountedMaterials = useMemo(
    () => moduleReady ? activeMaterials.filter((material) => !material.stock_verified) : [],
    [activeMaterials, moduleReady],
  )
  const inventoryFiltered = useMemo(() => {
    const q = normalize(globalSearch)
    if (!q) return activeMaterials
    return activeMaterials.filter((material) => normalize([
      material.description, material.order_code, material.reference_code ?? '',
      providerById.get(material.provider_id)?.label ?? '', material.storage_location ?? '',
    ].join(' ')).includes(q))
  }, [activeMaterials, globalSearch, providerById])

  const catalogFiltered = useMemo(() => {
    const q = normalize(globalSearch)
    const source = materials
    if (!q) return source
    return source.filter((material) => normalize([
      material.description, material.order_code, material.reference_code ?? '',
      providerById.get(material.provider_id)?.label ?? '', material.storage_location ?? '',
    ].join(' ')).includes(q))
  }, [materials, globalSearch, providerById])

  const draftValidation = useMemo(() => validateMaterialDraft(draftLines, activeMaterials), [draftLines, activeMaterials])
  const selectedDraftLines = draftValidation.lines
  const requestValidationError = draftValidation.error || (requesterName.trim().length < 2
    ? 'Indica la persona solicitante.' : cause.trim().length < 2 ? 'Indica la causa de la petición.' : '')
  const canReviewRequest = moduleReady && !requestValidationError

  function getSuggestions(query: string) {
    const q = normalize(query)
    const base = activeMaterials
    if (!q) return base.slice(0, 8)
    return base.filter((material) => normalize([
      material.description, material.order_code, material.reference_code ?? '',
      providerById.get(material.provider_id)?.label ?? '',
    ].join(' ')).includes(q)).slice(0, 8)
  }

  function updateDraftLine(key: string, patch: Partial<DraftLine>) {
    setDraftLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))
  }

  function chooseMaterial(lineKey: string, material: Material) {
    updateDraftLine(lineKey, { material_id: material.id, query: material.description })
    setOpenLineKey(null)
  }

  function addDraftLine() {
    setDraftLines((current) => [...current, { key: makeKey(), query: '', material_id: '', quantity: '1' }])
  }

  function removeDraftLine(key: string) {
    setDraftLines((current) => current.filter((line) => line.key !== key))
    setOpenLineKey(null)
  }

  function resetRequestForm() {
    setRequesterName(session?.user.fullName || session?.user.email || '')
    setCause('Reposición de material')
    setRequestNotes('')
    setDraftLines([{ key: makeKey(), query: '', material_id: '', quantity: '1' }])
    setReviewOpen(false)
  }

  function openNewMaterial() {
    setEditingMaterialId(null)
    setMaterialForm(EMPTY_MATERIAL_FORM)
    setError('')
    setMaterialEditorOpen(true)
  }

  function openEditMaterial(material: Material) {
    setEditingMaterialId(material.id)
    setMaterialForm({
      description: material.description,
      order_code: material.order_code,
      reference_code: material.reference_code ?? '',
      provider_id: material.provider_id,
      unit_of_measure: material.unit_of_measure || 'ud',
      minimum_stock: String(material.minimum_stock ?? 0),
      initial_stock: '',
      purchase_url: material.purchase_url ?? '',
      storage_location: material.storage_location ?? '',
      notes: material.notes ?? '',
    })
    setError('')
    setMaterialEditorOpen(true)
  }

  async function saveMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hotel?.id || savingMaterial) return
    if (!moduleReady) { setError('La migración 078 no está disponible. No se ha guardado el artículo.'); return }
    if (materialForm.description.trim().length < 2 || !materialForm.order_code.trim() || !materialForm.provider_id) {
      setError('Indica artículo, código del proveedor y proveedor.')
      return
    }
    if (!isValidUrl(materialForm.purchase_url)) {
      setError('El enlace de compra debe ser una URL válida que empiece por https:// o http://.')
      return
    }
    const minimum = Number(materialForm.minimum_stock || 0)
    const hasInitialStock = materialForm.initial_stock.trim() !== ''
    const initial = Number(materialForm.initial_stock)
    if (!Number.isFinite(minimum) || minimum < 0 || (hasInitialStock && (!Number.isFinite(initial) || initial < 0))) {
      setError('Las cantidades de stock no pueden ser negativas.')
      return
    }
    const prompt = editingMaterialId
      ? '¿Confirmas los cambios del artículo «' + materialForm.description.trim() + '»?'
      : '¿Confirmas el alta del artículo «' + materialForm.description.trim() + '»' + (hasInitialStock ? ' con inventario físico inicial de ' + formatQuantity(initial) + ' ' + materialForm.unit_of_measure : ' dejando el stock pendiente de inventario') + '?'
    if (!window.confirm(prompt)) return

    setSavingMaterial(true)
    setError('')
    setSuccess('')
    let savedSuccessfully = false
    const payload = {
      description: materialForm.description.trim(),
      order_code: materialForm.order_code.trim(),
      reference_code: materialForm.reference_code.trim() || null,
      provider_id: materialForm.provider_id,
      unit_of_measure: materialForm.unit_of_measure.trim() || 'ud',
      minimum_stock: minimum,
      purchase_url: materialForm.purchase_url.trim() || null,
      storage_location: materialForm.storage_location.trim() || null,
      notes: materialForm.notes.trim() || null,
      active: editingMaterialId ? materials.find((item) => item.id === editingMaterialId)?.active ?? true : true,
      updated_at: new Date().toISOString(),
    }

    let savedId = editingMaterialId
    if (editingMaterialId) {
      const result = await supabase.from('maintenance_material_catalog').update(payload).eq('hotel_id', hotel.id).eq('id', editingMaterialId).select('id').single()
      if (result.error) setError('No se pudo guardar el artículo: ' + result.error.message)
      else { savedSuccessfully = true; setSuccess('Artículo actualizado.') }
    } else {
      const result = await supabase.from('maintenance_material_catalog').insert({ ...payload, hotel_id: hotel.id }).select('id').single()
      if (result.error) setError('No se pudo crear el artículo: ' + result.error.message)
      else {
        savedSuccessfully = true
        savedId = result.data.id
        if (hasInitialStock && savedId) {
          const count = await supabase.rpc('count_maintenance_material_stock', {
            target_hotel_id: hotel.id, target_material_id: savedId, target_quantity: initial,
            target_reason: 'Inventario físico inicial de alta de artículo', target_reference: 'Alta de catálogo',
          })
          if (count.error) setError('El artículo se creó, pero no se pudo registrar el conteo inicial: ' + count.error.message)
          else setSuccess('Artículo creado e inventario físico inicial registrado.')
        } else {
          setSuccess('Artículo creado. El stock queda pendiente de inventario físico.')
        }
      }
    }

    if (savedSuccessfully) setMaterialEditorOpen(false)
    setSavingMaterial(false)
    await loadData()
  }

  function openStockCount(material: Material) {
    setCountingMaterial(material)
    setStockCountForm({ quantity: material.stock_verified ? String(material.stock_quantity) : '', reason: 'Inventario físico', reference: '' })
    setError('')
  }

  async function saveStockCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hotel?.id || !countingMaterial || savingStockCount) return
    if (!moduleReady) { setError('La migración 078 no está disponible. No se ha guardado el conteo.'); return }
    if (stockCountForm.quantity.trim() === '') { setError('Introduce la cantidad contada, incluido 0 si el inventario físico es cero.'); return }
    const quantity = Number(stockCountForm.quantity)
    if (!Number.isFinite(quantity) || quantity < 0 || Math.abs(Math.round(quantity * 100) - quantity * 100) > 1e-8) { setError('La cantidad contada debe ser cero o mayor, con máximo dos decimales.'); return }
    if (stockCountForm.reason.trim().length < 2) { setError('Indica el motivo del conteo físico.'); return }
    if (!window.confirm('¿Confirmas el conteo físico de ' + formatQuantity(quantity) + ' ' + countingMaterial.unit_of_measure + ' para «' + countingMaterial.description + '»? El saldo anterior se ajustará al recuento.')) return
    setSavingStockCount(true); setError('')
    const result = await supabase.rpc('count_maintenance_material_stock', {
      target_hotel_id: hotel.id, target_material_id: countingMaterial.id, target_quantity: quantity,
      target_reason: stockCountForm.reason.trim(), target_reference: stockCountForm.reference.trim() || null,
    })
    setSavingStockCount(false)
    if (result.error) { setError('No se registró el conteo físico: ' + result.error.message); return }
    setCountingMaterial(null)
    setSuccess('Conteo físico guardado. El stock y el movimiento histórico se han actualizado.')
    await loadData()
  }

  function openMovement(material: Material, type: MovementForm['type']) {
    if (!material.stock_verified) { setError('Antes de registrar entradas, salidas o ajustes, confirma el inventario físico del artículo.'); return }
    setMovementMaterial(material)
    setMovementForm({ ...EMPTY_MOVEMENT, type })
    setError('')
  }

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hotel?.id || !movementMaterial || savingMovement) return
    if (!moduleReady) { setError('La migración 078 no está disponible. No se ha registrado el movimiento.'); return }
    if (!movementMaterial.stock_verified) { setError('Primero registra un conteo físico del stock.'); return }
    const quantity = Number(movementForm.quantity)
    if (!Number.isFinite(quantity) || Math.abs(Math.round(quantity * 100) - quantity * 100) > 1e-8 || (movementForm.type === 'ADJUSTMENT' ? quantity === 0 : quantity <= 0)) {
      setError(movementForm.type === 'ADJUSTMENT' ? 'Introduce una diferencia distinta de cero (positiva o negativa).' : 'Introduce una cantidad mayor que cero.')
      return
    }
    if (movementForm.reason.trim().length < 2) {
      setError('El motivo es obligatorio para mantener la trazabilidad.')
      return
    }
    let delta = quantity
    if (movementForm.type === 'ISSUE') delta = -quantity
    const label = movementForm.type === 'RECEIVE' ? 'entrada' : movementForm.type === 'ISSUE' ? 'salida' : 'ajuste'
    if (!window.confirm('¿Confirmas la ' + label + ' de ' + formatQuantity(Math.abs(delta)) + ' ' + movementMaterial.unit_of_measure + ' para «' + movementMaterial.description + '»? Stock estimado: ' + formatQuantity(Number(movementMaterial.stock_quantity) + delta) + '.')) return

    setSavingMovement(true)
    setError('')
    const result = await supabase.rpc('record_maintenance_stock_movement', {
      target_hotel_id: hotel.id,
      target_material_id: movementMaterial.id,
      target_movement_type: movementForm.type,
      target_quantity_delta: delta,
      target_reason: movementForm.reason.trim(),
      target_reference: movementForm.reference.trim() || null,
    })
    setSavingMovement(false)
    if (result.error) {
      setError('No se registró el movimiento: ' + result.error.message)
      return
    }
    setSuccess('Movimiento registrado. Stock actualizado de forma trazable.')
    setMovementMaterial(null)
    await loadData()
  }

  async function buildPdf(request: RequestRecord, lines: RequestLine[]) {
    const { buildMaterialRequestPdf } = await import('../materialRequestPdf')
    return buildMaterialRequestPdf(request, lines, hotel?.name ?? 'Hotel')
  }

  async function downloadPdf(request: RequestRecord, lines: RequestLine[]) {
    previewPdf(await buildPdf(request, lines), request.request_number + '.pdf')
  }

  async function base64Pdf(request: RequestRecord, lines: RequestLine[]) {
    const dataUrl = (await buildPdf(request, lines)).output('datauristring')
    return dataUrl.split(',')[1] ?? ''
  }

  async function confirmRequest() {
    if (!hotel?.id || saving || !canReviewRequest) return
    if (!moduleReady) { setError('La migración 078 no está disponible. No se ha guardado la petición.'); return }
    if (!window.confirm('Confirmas y guardas la petición ' + hotel.name + ' con ' + selectedDraftLines.length + ' línea(s) de material? Esta acción creará un registro definitivo.')) return
    setSaving(true)
    setError('')
    setSuccess('')
    const result = await supabase.rpc('create_maintenance_material_request', {
      target_hotel_id: hotel.id,
      target_requester_name: requesterName.trim(),
      target_department: 'MANTENIMIENTO',
      target_cause: cause,
      target_delivery_date: null,
      target_notes: requestNotes.trim() || null,
      target_lines: selectedDraftLines.map((line) => ({ material_id: line.material?.id, quantity: Number(line.quantity), delivery_date: null })),
    })

    if (result.error) {
      setError('No se pudo confirmar la petición: ' + result.error.message)
      setSaving(false)
      return
    }

    const data = (Array.isArray(result.data) ? result.data[0] : result.data) as { id: string; request_number: string; confirmed_at?: string }
    const request: RequestRecord = {
      id: data.id,
      request_number: data.request_number,
      hotel_id: hotel.id,
      requester_name: requesterName.trim(),
      department: 'MANTENIMIENTO',
      cause,
      delivery_date: null,
      notes: requestNotes.trim() || null,
      status: 'CONFIRMED',
      email_status: 'NOT_SENT',
      recipient_email: null,
      email_sent_at: null,
      email_error: null,
      confirmed_at: data.confirmed_at ?? new Date().toISOString(),
      created_at: data.confirmed_at ?? new Date().toISOString(),
    }
    const lines: RequestLine[] = selectedDraftLines.map((line) => {
      const material = line.material!
      return {
        request_id: request.id,
        material_id: material.id,
        description: material.description,
        reference_code: material.reference_code,
        order_code: material.order_code,
        provider_id: material.provider_id,
        provider_name: providerById.get(material.provider_id)?.label ?? null,
        unit_of_measure: material.unit_of_measure,
        quantity: Number(line.quantity),
        delivery_date: null,
        purchase_url: material.purchase_url,
      }
    })

    setLastRequest({ request, lines })
    setRequests((current) => [request, ...current])
    setReviewOpen(false)
    resetRequestForm()
    setSuccess('Petición ' + request.request_number + ' confirmada y guardada. Puedes descargar el PDF y adjuntarlo a tu correo de empresa.')
    setSaving(false)
    await loadData()
  }

  async function loadRequestLines(request: RequestRecord) {
    const result = await supabase
      .from('maintenance_material_request_lines')
      .select('*')
      .eq('request_id', request.id)
      .order('created_at', { ascending: true })
    if (result.error) throw result.error
    return (result.data ?? []) as RequestLine[]
  }

  async function selectHistoryRequest(request: RequestRecord) {
    setHistoryLoading(true)
    setError('')
    try {
      const lines = await loadRequestLines(request)
      setHistorySelected({ request, lines })
    } catch (e) {
      setError('No se pudo abrir el detalle: ' + (e instanceof Error ? e.message : 'error desconocido'))
    } finally {
      setHistoryLoading(false)
    }
  }

  async function openEmail(request: RequestRecord, lines: RequestLine[]) {
    if (!MATERIAL_REQUEST_EMAIL_ENABLED) return
    const providerEmails = Array.from(new Set(lines
      .map((line) => line.provider_id ? providerById.get(line.provider_id)?.email_main?.trim().toLowerCase() ?? '' : '')
      .filter((email) => isValidEmail(email))))
    const previousEmail = request.recipient_email?.trim().toLowerCase() ?? ''
    const choice = isValidEmail(previousEmail) && providerEmails.includes(previousEmail)
      ? previousEmail
      : providerEmails.length === 1 ? providerEmails[0] : '__manual__'

    setEmailRecipientChoice(choice)
    setEmailAddress(choice === '__manual__' ? previousEmail : choice)

    let activeEmail = session?.user.email?.trim().toLowerCase() ?? ''
    if (!isValidEmail(activeEmail) && session?.user.id) {
      const profileResult = await supabase.from('profiles').select('email').eq('id', session.user.id).maybeSingle()
      if (!profileResult.error) activeEmail = profileResult.data?.email?.trim().toLowerCase() ?? ''
    }
    setSenderEmail(activeEmail)
    setEmailTarget({ request, lines })
    setError('')
  }

  async function sendRequestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!emailTarget || sending) return
    const recipient = emailRecipientChoice === '__manual__' ? emailAddress.trim() : emailRecipientChoice
    if (!isValidEmail(recipient)) {
      setError('Selecciona una dirección válida o introduce el correo manualmente.')
      return
    }
    if (!isValidEmail(senderEmail)) {
      setError('La cuenta activa no tiene un correo de contacto válido. Revisa el correo de tu perfil antes de enviar.')
      return
    }
    if (!window.confirm('Confirma el envío del PDF ' + emailTarget.request.request_number + '.pdf a ' + recipient + '. Las respuestas se dirigirán al correo del usuario activo: ' + senderEmail + '.')) return

    setSending(true)
    setError('')
    try {
      const response = await supabase.functions.invoke('send-material-request', {
        body: {
          request_id: emailTarget.request.id,
          recipient_email: recipient,
          pdf_filename: emailTarget.request.request_number + '.pdf',
          pdf_base64: await base64Pdf(emailTarget.request, emailTarget.lines),
        },
      })
      if (response.data?.error) throw new Error(String(response.data.error))
      if (response.error) throw new Error(response.error.message)
      const deliveryStateWarning = response.data?.warning ? String(response.data.warning) : ''
      const updatedRequest = { ...emailTarget.request, email_status: 'SENT' as const, recipient_email: recipient, email_sent_at: new Date().toISOString(), email_error: null }
      setRequests((current) => current.map((request) => request.id === updatedRequest.id ? updatedRequest : request))
      setLastRequest((current) => current?.request.id === updatedRequest.id ? { ...current, request: updatedRequest } : current)
      setHistorySelected((current) => current?.request.id === updatedRequest.id ? { ...current, request: updatedRequest } : current)
      setEmailTarget(null)
      setSuccess(deliveryStateWarning ? 'El proveedor aceptó el correo a ' + recipient + ', pero el historial no confirmó el estado: ' + deliveryStateWarning : 'Correo enviado correctamente a ' + recipient + '.')
      await loadData()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se ha podido enviar el correo.'
      setError('El envío no se ha completado. ' + message + ' Comprueba que la función send-material-request y sus secretos estén configurados.')
    } finally {
      setSending(false)
    }
  }

  function openLinePurchaseLink(url: string | null) {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const availableTabs: Array<{ key: TabKey; label: string; icon: typeof Package }> = [
    { key: 'request', label: 'Petición material', icon: ShoppingCart },
    { key: 'inventory', label: 'Stock', icon: Boxes },
    { key: 'catalog', label: 'Catálogo', icon: Package },
    { key: 'history', label: 'Historial', icon: ClipboardList },
  ]

  const errorBanner = error ? (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{error}</div>
      <button type="button" onClick={() => setError('')} aria-label="Cerrar aviso" className="ml-auto rounded-md p-1 hover:bg-rose-100"><X size={14}/></button>
    </div>
  ) : null

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11"/>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight sm:text-2xl">Materiales y stock</h1>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{hotel?.name ?? 'Sin hotel seleccionado'} · Catálogo, existencias y peticiones</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <BackButton onBack={() => navigate('/')} />
              <HomeButton onHome={() => navigate('/')} />
            </div>
          </div>
        </header>

        {migrationNotice && (
          <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>{migrationNotice}</div>
          </div>
        )}
        {errorBanner}
        {success && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0"/><span>{success}</span>
            <button type="button" onClick={() => setSuccess('')} aria-label="Cerrar confirmación" className="ml-auto rounded-md p-1 hover:bg-emerald-100"><X size={14}/></button>
          </div>
        )}

        <section className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Artículos activos', value: activeMaterials.length, icon: Package },
            { label: 'Bajo mínimo', value: moduleReady ? lowStockMaterials.length : '—', icon: AlertTriangle },
            { label: 'Peticiones guardadas', value: moduleReady ? requests.length : '—', icon: ClipboardList },
            { label: 'Movimientos recientes', value: moduleReady ? movements.length : '—', icon: RefreshCw },
          ].map((metric) => {
            const MetricIcon = metric.icon
            return (
              <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 sm:text-xs">{metric.label}</span>
                  <MetricIcon size={16} className="text-slate-400"/>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{loading ? '—' : metric.value}</div>
              </div>
            )
          })}
        </section>

        <nav className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Secciones de materiales">
          {availableTabs.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.key} type="button" onClick={() => { setTab(item.key); setError(''); setGlobalSearch('') }} className={'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4 ' + (tab === item.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                <Icon size={15}/>{item.label}
              </button>
            )
          })}
          <button type="button" onClick={() => void loadData()} disabled={loading} className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14}/><span className="hidden sm:inline">Actualizar</span></button>
        </nav>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Cargando catálogo, stock y peticiones…</div>
        )}

        {!loading && tab === 'request' && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Formulario petición material</h2>
                <p className="mt-0.5 text-xs text-slate-500">Los artículos seleccionados recuperan su código, proveedor y enlace de compra del catálogo.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Borrador · Sin guardar</span>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Establecimiento</span>
                  <input readOnly value={hotel?.name ?? ''} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"/>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Departamento</span>
                  <input readOnly value="MANTENIMIENTO" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600"/>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Causa de la petición *</span>
                  <select value={cause} onChange={(event) => setCause(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                    <option>Reposición de material</option>
                    <option>Reparación / avería</option>
                    <option>Trabajo planificado</option>
                    <option>Nuevo material</option>
                    <option>Otro</option>
                  </select>
                </label>
                <label className="block sm:col-span-2 lg:col-span-4">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Persona solicitante *</span>
                  <input value={requesterName} onChange={(event) => setRequesterName(event.target.value)} placeholder="Nombre y apellidos" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
                </label>
              </div>

              <div className="overflow-visible rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Material necesario</h3>
                  <span className="text-[10px] text-slate-500">{draftLines.length} línea(s)</span>
                </div>
                <div className="space-y-3 p-3">
                  {draftLines.map((line, index) => {
                    const material = activeMaterials.find((item) => item.id === line.material_id)
                    const suggestions = getSuggestions(line.query)
                    const provider = material ? providerById.get(material.provider_id) : null
                    return (
                      <div key={line.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_100px_42px] sm:items-start">
                        <div className="min-w-0">
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Artículo {index + 1} *</label>
                          <div className="relative">
                            <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400"/>
                            <input value={line.query} onFocus={() => setOpenLineKey(line.key)} onChange={(event) => { updateDraftLine(line.key, { query: event.target.value, material_id: '' }); setOpenLineKey(line.key) }} placeholder="Escribe artículo, referencia, código o proveedor…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-500"/>
                            {openLineKey === line.key && (
                              <>
                                <button type="button" aria-label="Cerrar sugerencias" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpenLineKey(null)}/>
                                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                                  {suggestions.map((suggestion) => (
                                    <button key={suggestion.id} type="button" onClick={() => chooseMaterial(line.key, suggestion)} className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50">
                                      <span className="min-w-0">
                                        <span className="block text-xs font-semibold text-slate-800">{suggestion.description}</span>
                                        <span className="mt-0.5 block text-[10px] text-slate-500">{suggestion.order_code}{suggestion.reference_code ? ' · Ref. ' + suggestion.reference_code : ''} · {providerById.get(suggestion.provider_id)?.label ?? 'Sin proveedor'}</span>
                                      </span>
                                      <ChevronRight size={14} className="mt-1 shrink-0 text-slate-400"/>
                                    </button>
                                  ))}
                                  {suggestions.length === 0 && <div className="p-4 text-xs text-slate-500">No hay coincidencias en el catálogo. Añade el artículo desde la pestaña Catálogo.</div>}
                                </div>
                              </>
                            )}
                          </div>
                          {material && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                              <span>Proveedor: <strong className="text-slate-700">{provider?.label ?? 'Sin proveedor'}</strong></span>
                              <span>Código: <strong className="text-slate-700">{material.order_code}</strong></span>
                              <span>Stock actual: <strong className={moduleReady && material.stock_verified && Number(material.stock_quantity) <= Number(material.minimum_stock) ? 'text-rose-700' : 'text-slate-700'}>{moduleReady ? (material.stock_verified ? formatQuantity(material.stock_quantity) : 'Pendiente de inventario') : '—'} {moduleReady && material.stock_verified ? material.unit_of_measure : ''}</strong></span>
                              {material.purchase_url && <button type="button" onClick={() => openLinePurchaseLink(material.purchase_url)} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><ExternalLink size={11}/> Enlace de compra</button>}
                            </div>
                          )}
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Unidades *</span>
                          <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => updateDraftLine(line.key, { quantity: event.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
                          {material && <span className="mt-1 block text-[10px] text-slate-400">{material.unit_of_measure}</span>}
                        </label>
                        <button type="button" onClick={() => removeDraftLine(line.key)} disabled={draftLines.length === 1} title="Quitar línea" aria-label="Quitar línea" className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 sm:mt-0"><X size={15}/></button>
                      </div>
                    )
                  })}
                  <button type="button" onClick={addDraftLine} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Plus size={15}/>Añadir artículo</button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observaciones</span>
                <textarea value={requestNotes} onChange={(event) => setRequestNotes(event.target.value)} rows={3} placeholder="Indica el motivo, la urgencia o cualquier detalle de la petición…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
              </label>

              <div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                <p className="text-[11px] leading-5 text-slate-500">Guarda la petición y descarga el PDF para adjuntarlo a tu correo de empresa. La petición no modifica las existencias.</p>
                <button type="button" disabled={!moduleReady || saving} onClick={() => { if (!canReviewRequest) { setError(requestValidationError); return }; setError(''); setReviewOpen(true) }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><ClipboardList size={16}/>Revisar y confirmar</button>
              </div>
            </div>
          </section>
        )}

        {!loading && tab === 'inventory' && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div><h2 className="text-base font-bold">Existencias actuales</h2><p className="mt-1 text-xs text-slate-500">Las entradas, salidas y ajustes crean un movimiento histórico y validan el stock disponible.</p></div>
              <label className="relative block w-full sm:w-72"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Buscar artículo o proveedor…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-xs"/></label>
            </div>
            {lowStockMaterials.length > 0 && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><span><strong>{lowStockMaterials.length} artículo(s)</strong> están en su mínimo o por debajo. El indicador no crea una petición automática.</span></div>
            )}
            {uncountedMaterials.length > 0 && (
              <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600"><ClipboardList size={16} className="mt-0.5 shrink-0"/><span><strong>{uncountedMaterials.length} artículo(s)</strong> están pendientes de inventario físico. No se contabilizan como stock cero ni generan falsas alertas de mínimo.</span></div>
            )}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead><tr className="border-b bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Artículo / referencia</th><th className="px-3 py-3">Proveedor</th><th className="px-3 py-3">Ubicación</th><th className="px-3 py-3">Stock</th><th className="px-3 py-3">Mínimo</th><th className="px-3 py-3">Compra</th><th className="px-3 py-3">Movimientos</th>
                </tr></thead>
                <tbody>
                  {inventoryFiltered.map((material) => {
                    const provider = providerById.get(material.provider_id)
                    const low = moduleReady && material.stock_verified && Number(material.stock_quantity) <= Number(material.minimum_stock)
                    return <tr key={material.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-3"><div className="font-semibold text-slate-800">{material.description}</div><div className="mt-0.5 text-[10px] text-slate-500">{material.order_code}{material.reference_code ? ' · ' + material.reference_code : ''}</div></td>
                      <td className="px-3 py-3 text-slate-600">{provider?.label ?? '—'}</td>
                      <td className="px-3 py-3 text-slate-500">{material.storage_location || '—'}</td>
                      <td className="px-3 py-3"><span className={'font-bold tabular-nums ' + (low ? 'text-rose-700' : 'text-slate-800')}>{moduleReady ? (material.stock_verified ? formatQuantity(material.stock_quantity) : 'Pendiente de inventario') : '—'} {moduleReady && material.stock_verified ? material.unit_of_measure : ''}</span></td>
                      <td className="px-3 py-3 text-slate-600">{moduleReady ? formatQuantity(material.minimum_stock) : '—'} {moduleReady ? material.unit_of_measure : ''}</td>
                      <td className="px-3 py-3">{material.purchase_url ? <button type="button" onClick={() => openLinePurchaseLink(material.purchase_url)} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><ExternalLink size={13}/>Abrir</button> : '—'}</td>
                      <td className="px-3 py-3"><div className="flex gap-1.5">
                        <button type="button" title="Registrar conteo físico" onClick={() => openStockCount(material)} disabled={!moduleReady} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-40"><ClipboardList size={14}/></button>
                        <button type="button" title="Registrar entrada" onClick={() => openMovement(material, 'RECEIVE')} disabled={!moduleReady || !material.stock_verified} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><ArrowDownToLine size={14}/></button>
                        <button type="button" title="Registrar salida" onClick={() => openMovement(material, 'ISSUE')} disabled={!moduleReady || !material.stock_verified} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40"><ArrowUpFromLine size={14}/></button>
                        <button type="button" title="Ajustar diferencia" onClick={() => openMovement(material, 'ADJUSTMENT')} disabled={!moduleReady || !material.stock_verified} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><SlidersHorizontal size={14}/></button>
                      </div></td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {inventoryFiltered.map((material) => {
                const provider = providerById.get(material.provider_id)
                const low = moduleReady && material.stock_verified && Number(material.stock_quantity) <= Number(material.minimum_stock)
                return <div key={material.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm font-semibold text-slate-800">{material.description}</div><div className="mt-1 text-[10px] text-slate-500">{material.order_code} · {provider?.label ?? 'Sin proveedor'}</div></div><div className={'shrink-0 text-right text-sm font-bold ' + (low ? 'text-rose-700' : 'text-slate-800')}>{moduleReady ? (material.stock_verified ? formatQuantity(material.stock_quantity) : 'Pendiente de inventario') : '—'}<div className="text-[9px] font-medium text-slate-400">{moduleReady && material.stock_verified ? material.unit_of_measure : ''}</div></div></div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => openStockCount(material)} disabled={!moduleReady} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-200 px-2.5 text-[10px] font-semibold text-blue-700 disabled:opacity-40"><ClipboardList size={13}/>Conteo</button>
                      <button type="button" onClick={() => openMovement(material, 'RECEIVE')} disabled={!moduleReady || !material.stock_verified} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 px-2.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-40"><ArrowDownToLine size={13}/>Entrada</button>
                      <button type="button" onClick={() => openMovement(material, 'ISSUE')} disabled={!moduleReady || !material.stock_verified} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-2.5 text-[10px] font-semibold text-amber-700 disabled:opacity-40"><ArrowUpFromLine size={13}/>Salida</button>
                      <button type="button" onClick={() => openMovement(material, 'ADJUSTMENT')} disabled={!moduleReady || !material.stock_verified} className="inline-flex min-h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40" aria-label="Ajustar diferencia"><SlidersHorizontal size={13}/></button>
                    </div>
                    {material.purchase_url && <button type="button" onClick={() => openLinePurchaseLink(material.purchase_url)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700"><ExternalLink size={12}/>Comprar</button>}
                  </div>
                </div>
              })}
            </div>
            {inventoryFiltered.length === 0 && <div className="p-8 text-center text-xs text-slate-400">No hay artículos que coincidan con la búsqueda.</div>}
          </section>
        )}

        {!loading && tab === 'catalog' && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div><h2 className="text-base font-bold">Catálogo maestro de materiales</h2><p className="mt-1 text-xs text-slate-500">Cada artículo se vincula al proveedor maestro existente. Los artículos se desactivan, no se borran físicamente.</p></div>
              <div className="flex w-full gap-2 sm:w-auto">
                <label className="relative min-w-0 flex-1 sm:w-64"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Buscar catálogo…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-xs"/></label>
                <button type="button" onClick={openNewMaterial} disabled={!moduleReady} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Plus size={15}/>Nuevo</button>
              </div>
            </div>
            <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalogFiltered.map((material) => {
                const provider = providerById.get(material.provider_id)
                const low = moduleReady && material.stock_verified && Number(material.stock_quantity) <= Number(material.minimum_stock)
                return <article key={material.id} className={'rounded-xl border p-3 ' + (material.active ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50 opacity-70')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="text-sm font-semibold text-slate-800">{material.description}</h3><p className="mt-1 text-[10px] text-slate-500">{material.order_code}{material.reference_code ? ' · Ref. ' + material.reference_code : ''}</p></div>
                    <span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ' + (material.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}>{material.active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg bg-slate-50 p-2"><span className="block text-slate-400">Proveedor</span><strong className="mt-0.5 block text-slate-700">{provider?.label ?? '—'}</strong></div>
                    <div className="rounded-lg bg-slate-50 p-2"><span className="block text-slate-400">Stock actual</span><strong className={'mt-0.5 block ' + (low ? 'text-rose-700' : 'text-slate-700')}>{moduleReady ? (material.stock_verified ? formatQuantity(material.stock_quantity) : 'Pendiente de inventario') : '—'} {moduleReady && material.stock_verified ? material.unit_of_measure : ''}</strong></div>
                  </div>
                  {material.purchase_url && <button type="button" onClick={() => openLinePurchaseLink(material.purchase_url)} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 hover:underline"><ExternalLink size={13}/>Enlace / portal de compra</button>}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[10px] text-slate-400">Mínimo {moduleReady ? formatQuantity(material.minimum_stock) : '—'} {moduleReady ? material.unit_of_measure : ''}</span>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => openEditMaterial(material)} disabled={!moduleReady} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={12}/>Editar</button>
                      <button type="button" onClick={async () => {
                        const nextActive = !material.active
                        if (!window.confirm('¿Confirmas ' + (nextActive ? 'reactivar' : 'desactivar') + ' el artículo «' + material.description + '»?')) return
                        const result = await supabase.from('maintenance_material_catalog').update({ active: nextActive, updated_at: new Date().toISOString() }).eq('hotel_id', material.hotel_id).eq('id', material.id)
                        if (result.error) setError('No se pudo cambiar el estado: ' + result.error.message)
                        else { setSuccess(nextActive ? 'Artículo reactivado.' : 'Artículo desactivado. Se conserva su histórico.'); await loadData() }
                      }} disabled={!moduleReady} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Archive size={12}/>{material.active ? 'Desactivar' : 'Reactivar'}</button>
                    </div>
                  </div>
                </article>
              })}
            </div>
            {catalogFiltered.length === 0 && <div className="p-8 text-center text-xs text-slate-400">El catálogo está vacío. Crea el primer artículo para empezar.</div>}
          </section>
        )}

        {!loading && tab === 'history' && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4"><h2 className="text-base font-bold">Historial de peticiones y movimientos</h2><p className="mt-1 text-xs text-slate-500">Las solicitudes confirmadas se conservan aunque cambie el catálogo del artículo.</p></div>
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Peticiones de material</h3>
                <div className="space-y-2">
                  {requests.map((request) => (
                    <button key={request.id} type="button" onClick={() => void selectHistoryRequest(request)} className={'w-full rounded-xl border p-3 text-left transition hover:bg-slate-50 ' + (historySelected?.request.id === request.id ? 'border-slate-500 bg-slate-50' : 'border-slate-200')}>
                      <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-semibold text-slate-800">{request.request_number}</div><div className="mt-0.5 text-[10px] text-slate-500">{formatDate(request.confirmed_at)} · {request.requester_name}</div></div>{MATERIAL_REQUEST_EMAIL_ENABLED && <span className={'rounded-full px-2 py-1 text-[9px] font-semibold ' + emailStatusClass(request.email_status)}>{emailStatusLabel(request.email_status)}</span>}</div>
                      <div className="mt-2 text-xs text-slate-600">{request.cause}</div>
                    </button>
                  ))}
                  {requests.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">Aún no hay peticiones confirmadas.</div>}
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Detalle de solicitud</h3>
                {historyLoading && <div className="rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-400">Cargando detalle…</div>}
                {!historyLoading && historySelected && (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-800">{historySelected.request.request_number}</h4><p className="mt-1 text-[10px] text-slate-500">{historySelected.request.requester_name} · {formatDate(historySelected.request.confirmed_at)}</p></div>{MATERIAL_REQUEST_EMAIL_ENABLED && <span className={'rounded-full px-2 py-1 text-[9px] font-semibold ' + emailStatusClass(historySelected.request.email_status)}>{emailStatusLabel(historySelected.request.email_status)}</span>}</div>
                    <div className="mt-3 space-y-2">
                      {historySelected.lines.map((line, index) => <div key={line.id ?? index} className="rounded-lg bg-slate-50 p-2.5"><div className="text-xs font-semibold text-slate-800">{line.description}</div><div className="mt-1 text-[10px] text-slate-500">{formatQuantity(line.quantity)} {line.unit_of_measure} · {line.provider_name ?? 'Sin proveedor'} · {line.order_code ?? 'Sin código'}</div>{line.purchase_url && <button type="button" onClick={() => openLinePurchaseLink(line.purchase_url)} className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700"><ExternalLink size={11}/>Enlace de compra</button>}</div>)}
                    </div>
                    {MATERIAL_REQUEST_EMAIL_ENABLED && historySelected.request.email_error && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-[10px] text-rose-700">{historySelected.request.email_error}</p>}
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button type="button" onClick={() => downloadPdf(historySelected.request, historySelected.lines)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700"><FileDown size={14}/>Descargar PDF</button>
                      {MATERIAL_REQUEST_EMAIL_ENABLED && historySelected.request.email_status !== 'SENT' && <button type="button" onClick={() => void openEmail(historySelected.request, historySelected.lines)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-[11px] font-semibold text-white"><Mail size={14}/>Enviar correo</button>}
                    </div>
                  </div>
                )}
                {!historyLoading && !historySelected && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">Selecciona una petición para ver sus líneas, descargar el PDF o enviarla por correo.</div>}
              </div>
            </div>
            <div className="border-t border-slate-200 p-3">
              <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Últimos movimientos de stock</h3>
              <div className="space-y-1.5">
                {movements.slice(0, 12).map((movement, index) => {
                  const material = materials.find((item) => item.id === movement.material_id)
                  const delta = Number(movement.quantity_delta ?? 0)
                  const movementType = String(movement.movement_type ?? '')
                  const movementLabel = movementType === 'COUNT' ? 'Conteo físico'
                    : movementType === 'RECEIVE' ? 'Entrada'
                    : movementType === 'ISSUE' ? 'Salida / consumo'
                    : movementType === 'ADJUSTMENT' ? 'Ajuste'
                    : 'Movimiento'
                  const previousStock = movement.stock_before == null ? null : Number(movement.stock_before)
                  const currentStock = movement.stock_after == null ? null : Number(movement.stock_after)
                  const stockSummary = movementType === 'COUNT' && previousStock === null
                    ? 'Saldo establecido: ' + formatQuantity(currentStock ?? 0) + ' ' + (material?.unit_of_measure ?? '')
                    : (delta > 0 ? '+' : '') + formatQuantity(delta) + ' ' + (material?.unit_of_measure ?? '')
                  const quantityTone = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-slate-600'
                  return <div key={String(movement.id ?? index)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[10px]">
                    <div className="min-w-0"><span className="font-semibold text-slate-700">{material?.description ?? 'Artículo'}</span><span className="ml-2 text-slate-500">{movementLabel} · {String(movement.reason ?? '')}</span><div className="mt-0.5 text-slate-400">{new Date(String(movement.created_at)).toLocaleString('es-ES')}</div></div>
                    <div className={'shrink-0 font-bold tabular-nums ' + quantityTone}>{stockSummary}</div>
                  </div>
                })}
                {movements.length === 0 && <p className="px-1 py-3 text-xs text-slate-400">Todavía no hay movimientos registrados.</p>}
              </div>
            </div>
          </section>
        )}
      </div>

      {reviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
          <section className="max-h-[calc(100vh-24px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
              <div><h2 className="text-base font-bold text-slate-900">Confirmar petición de material</h2><p className="mt-1 text-xs text-slate-500">Revisa artículos, cantidades y observaciones antes de guardar.</p></div>
              <button type="button" onClick={() => setReviewOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X size={17}/></button>
            </header>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] uppercase text-slate-400">Establecimiento</span><strong className="mt-1 block">{hotel?.name}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] uppercase text-slate-400">Solicitante</span><strong className="mt-1 block">{requesterName}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] uppercase text-slate-400">Causa</span><strong className="mt-1 block">{cause}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] uppercase text-slate-400">Líneas de material</span><strong className="mt-1 block">{selectedDraftLines.length}</strong></div>
              </div>
              <div className="space-y-2">
                {selectedDraftLines.map((line) => (
                  <div key={line.key} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0"><div className="text-xs font-semibold text-slate-800">{line.material?.description}</div><div className="mt-1 text-[10px] text-slate-500">{line.material?.order_code} · {providerById.get(line.material?.provider_id ?? '')?.label ?? 'Sin proveedor'}</div>{line.material?.purchase_url && <button type="button" onClick={() => openLinePurchaseLink(line.material?.purchase_url ?? null)} className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700"><ExternalLink size={11}/>Enlace de compra</button>}</div>
                    <strong className="shrink-0 text-sm tabular-nums text-slate-800">{formatQuantity(line.quantity)} {line.material?.unit_of_measure}</strong>
                  </div>
                ))}
              </div>
              {requestNotes && <div className="rounded-xl border border-slate-200 p-3 text-xs"><span className="font-semibold">Observaciones:</span> {requestNotes}</div>}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Confirmación:</strong> esta acción guardará una petición definitiva en el historial. No enviará correos ni modificará las existencias. Después podrás descargar el PDF y adjuntarlo a tu correo de empresa.</div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setReviewOpen(false)} disabled={saving} className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Volver a editar</button>
                <button type="button" onClick={() => void confirmRequest()} disabled={saving || !canReviewRequest} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 size={15}/>{saving ? 'Guardando petición…' : 'Confirmar y guardar'}</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {lastRequest && (
        <div className="fixed bottom-4 left-3 right-3 z-40 mx-auto max-w-3xl rounded-2xl border border-emerald-200 bg-white p-3 shadow-2xl sm:bottom-5 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600"/><div><div className="text-sm font-bold text-slate-900">Petición {lastRequest.request.request_number} guardada</div><p className="mt-0.5 text-xs text-slate-500">Descarga el PDF y adjúntalo a tu correo de empresa.</p></div></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadPdf(lastRequest.request, lastRequest.lines)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"><FileDown size={14}/>PDF</button>
              {MATERIAL_REQUEST_EMAIL_ENABLED && <button type="button" onClick={() => void openEmail(lastRequest.request, lastRequest.lines)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"><Mail size={14}/>Enviar email</button>}
              <button type="button" onClick={() => { setLastRequest(null); resetRequestForm(); setTab('request') }} aria-label="Cerrar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={14}/></button>
            </div>
          </div>
        </div>
      )}

      {materialEditorOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
          <form onSubmit={(event) => void saveMaterial(event)} className="max-h-[calc(100vh-24px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4"><div><h2 className="text-base font-bold">{editingMaterialId ? 'Editar material' : 'Nuevo material'}</h2><p className="mt-1 text-xs text-slate-500">El proveedor se enlaza al catálogo maestro de proveedores.</p></div><button type="button" onClick={() => setMaterialEditorOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16}/></button></header>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Artículo / descripción *</span><input required minLength={2} value={materialForm.description} onChange={(event) => setMaterialForm((value) => ({ ...value, description: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" placeholder="Ej. Aceite WD-40"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Código del proveedor *</span><input required value={materialForm.order_code} onChange={(event) => setMaterialForm((value) => ({ ...value, order_code: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Referencia interna</span><input value={materialForm.reference_code} onChange={(event) => setMaterialForm((value) => ({ ...value, reference_code: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Proveedor *</span><select required value={materialForm.provider_id} onChange={(event) => setMaterialForm((value) => ({ ...value, provider_id: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Selecciona proveedor…</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Unidad de medida</span><select value={materialForm.unit_of_measure} onChange={(event) => setMaterialForm((value) => ({ ...value, unit_of_measure: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="ud">Unidad (ud)</option><option value="paquete">Paquete</option><option value="caja">Caja</option><option value="m">Metro (m)</option><option value="m²">Metro cuadrado (m²)</option><option value="l">Litro (l)</option><option value="kg">Kilogramo (kg)</option><option value="rollo">Rollo</option><option value="par">Par</option></select></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Stock mínimo</span><input type="number" min="0" step="0.01" value={materialForm.minimum_stock} onChange={(event) => setMaterialForm((value) => ({ ...value, minimum_stock: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              {!editingMaterialId && <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Conteo físico inicial (opcional)</span><input type="number" min="0" step="0.01" value={materialForm.initial_stock} onChange={(event) => setMaterialForm((value) => ({ ...value, initial_stock: event.target.value }))} placeholder="Déjalo vacío si no está contado" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><span className="mt-1 block text-[10px] text-slate-400">Si introduces 0, queda confirmado como cero real. En blanco, el stock se marcará pendiente de inventario.</span></label>}
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Enlace de compra / portal</span><input type="url" value={materialForm.purchase_url} onChange={(event) => setMaterialForm((value) => ({ ...value, purchase_url: event.target.value }))} placeholder="https://…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><span className="mt-1 block text-[10px] text-slate-400">Puedes guardar el enlace directo al producto o al portal del proveedor.</span></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Ubicación del almacén</span><input value={materialForm.storage_location} onChange={(event) => setMaterialForm((value) => ({ ...value, storage_location: event.target.value }))} placeholder="Ej. Almacén SSTT · Estantería B2" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Notas</span><textarea rows={2} value={materialForm.notes} onChange={(event) => setMaterialForm((value) => ({ ...value, notes: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setMaterialEditorOpen(false)} disabled={savingMaterial} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600">Cancelar</button><button type="submit" disabled={!moduleReady || savingMaterial || providers.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 size={14}/>{savingMaterial ? 'Guardando…' : 'Guardar artículo'}</button></footer>
          </form>
        </div>
      )}

      {countingMaterial && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
          <form onSubmit={(event) => void saveStockCount(event)} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4"><div><h2 className="text-base font-bold">Conteo físico de stock</h2><p className="mt-1 text-xs text-slate-500">{countingMaterial.description}</p></div><button type="button" onClick={() => setCountingMaterial(null)} disabled={savingStockCount} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16}/></button></header>
            <div className="space-y-3 p-4">
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{countingMaterial.stock_verified ? 'El conteo reemplazará el saldo contable actual de ' + formatQuantity(countingMaterial.stock_quantity) + ' ' + countingMaterial.unit_of_measure + '.' : 'El saldo anterior es desconocido. Este conteo establecerá el primer stock fiable; no se asumirá que el cero por defecto era real.'}</div>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Cantidad contada *</span><input required type="number" min="0" step="0.01" value={stockCountForm.quantity} onChange={(event) => setStockCountForm((value) => ({ ...value, quantity: event.target.value }))} placeholder="Incluye 0 si no hay existencias" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><span className="mt-1 block text-[10px] text-slate-400">Cantidad real encontrada en almacén, no una previsión.</span></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Motivo *</span><input required minLength={2} value={stockCountForm.reason} onChange={(event) => setStockCountForm((value) => ({ ...value, reason: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Referencia / hoja de inventario</span><input value={stockCountForm.reference} onChange={(event) => setStockCountForm((value) => ({ ...value, reference: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setCountingMaterial(null)} disabled={savingStockCount} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold">Cancelar</button><button type="submit" disabled={!moduleReady || savingStockCount} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 size={14}/>{savingStockCount ? 'Guardando conteo…' : 'Confirmar conteo'}</button></footer>
          </form>
        </div>
      )}

      {movementMaterial && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
          <form onSubmit={(event) => void saveMovement(event)} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4"><div><h2 className="text-base font-bold">{movementForm.type === 'RECEIVE' ? 'Entrada de stock' : movementForm.type === 'ISSUE' ? 'Salida de stock' : 'Ajuste de stock'}</h2><p className="mt-1 text-xs text-slate-500">{movementMaterial.description} · Actual: {formatQuantity(movementMaterial.stock_quantity)} {movementMaterial.unit_of_measure}</p></div><button type="button" onClick={() => setMovementMaterial(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16}/></button></header>
            <div className="space-y-3 p-4">
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Tipo de movimiento</span><select value={movementForm.type} onChange={(event) => setMovementForm((value) => ({ ...value, type: event.target.value as MovementForm['type'] }))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="RECEIVE">Entrada / recepción</option><option value="ISSUE">Salida / consumo</option><option value="ADJUSTMENT">Ajuste por inventario</option></select></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">{movementForm.type === 'ADJUSTMENT' ? 'Diferencia de stock *' : 'Cantidad *'}</span><input required type="number" min={movementForm.type === 'ADJUSTMENT' ? undefined : 0.01} step="0.01" value={movementForm.quantity} onChange={(event) => setMovementForm((value) => ({ ...value, quantity: event.target.value }))} placeholder={movementForm.type === 'ADJUSTMENT' ? 'Ej. -2 para restar o 5 para sumar' : 'Cantidad'} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><span className="mt-1 block text-[10px] text-slate-400">{movementForm.type === 'ADJUSTMENT' ? 'Introduce la diferencia: positiva para sumar, negativa para restar.' : 'El sistema convierte la salida en un movimiento negativo.'}</span></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Motivo *</span><input required minLength={2} value={movementForm.reason} onChange={(event) => setMovementForm((value) => ({ ...value, reason: event.target.value }))} placeholder="Ej. Recepción pedido nº…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Referencia / albarán</span><input value={movementForm.reference} onChange={(event) => setMovementForm((value) => ({ ...value, reference: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" onClick={() => setMovementMaterial(null)} disabled={savingMovement} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold">Cancelar</button><button type="submit" disabled={!moduleReady || savingMovement} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 size={14}/>{savingMovement ? 'Registrando…' : 'Revisar y registrar'}</button></footer>
          </form>
        </div>
      )}

      {MATERIAL_REQUEST_EMAIL_ENABLED && emailTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px]">
          <form onSubmit={(event) => void sendRequestEmail(event)} className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4"><div><h2 className="text-base font-bold">Confirmar envío por correo</h2><p className="mt-1 text-xs text-slate-500">Se enviará el PDF adjunto de {emailTarget.request.request_number}.</p></div><button type="button" onClick={() => setEmailTarget(null)} disabled={sending} className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16}/></button></header>
            <div className="space-y-3 p-4">
              <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Destinatario *</span>
                <select required value={emailRecipientChoice} onChange={(event) => { const value = event.target.value; setEmailRecipientChoice(value); if (value !== '__manual__') setEmailAddress(value) }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
                  {emailRecipientOptions.map((option) => <option key={option.email} value={option.email}>{option.label} · {option.email}</option>)}
                  <option value="__manual__">Introducir correo manualmente</option>
                </select>
              </label>
              {emailRecipientChoice === '__manual__' && <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Correo del destinatario *</span><input required type="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} placeholder="compras@empresa.com" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>}
              <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <div><strong>Responder a:</strong> {senderEmail || 'La cuenta activa no tiene un correo de contacto disponible.'}</div>
                <div className="mt-1 text-[11px]">El servicio enviará desde una dirección autorizada y verificada; las respuestas se dirigirán al correo del usuario activo.</div>
                <div className="mt-2"><strong>Asunto:</strong> {emailTarget.request.request_number} · Petición de material · {hotel?.name}</div><div><strong>Adjunto:</strong> {emailTarget.request.request_number}.pdf</div><div><strong>Artículos:</strong> {emailTarget.lines.map((line) => line.description).join(', ')}</div>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">No se enviará nada hasta pulsar «Confirmar y enviar». El correo requiere que el servicio esté configurado y que el usuario activo tenga un correo de contacto válido.</p>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEmailTarget(null)} disabled={sending} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600">Cancelar</button><button type="submit" disabled={sending || !isValidEmail(emailRecipientChoice === '__manual__' ? emailAddress : emailRecipientChoice) || !isValidEmail(senderEmail)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"><Mail size={14}/>{sending ? 'Enviando correo…' : 'Confirmar y enviar'}</button></footer>
          </form>
        </div>
      )}
    </div>
  )
}
