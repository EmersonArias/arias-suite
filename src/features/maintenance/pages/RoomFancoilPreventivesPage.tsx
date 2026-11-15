import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { supabase } from '../../../lib/supabase'

type RoomStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE'
type RoomRecord = {
  status: RoomStatus
  completedAt: string
  technician: string
  notes: string
}
type RoomDraft = RoomRecord

const FLOOR_ROOM_LIMITS: Array<{ floor: number; maxRoom: number }> = [
  { floor: 2, maxRoom: 17 },
  ...Array.from({ length: 9 }, (_, index) => ({ floor: index + 3, maxRoom: 23 })),
  ...Array.from({ length: 3 }, (_, index) => ({ floor: index + 12, maxRoom: 12 })),
  { floor: 15, maxRoom: 2 },
]
const DEFAULT_ROOM_CODES = FLOOR_ROOM_LIMITS.flatMap(({ floor, maxRoom }) =>
  Array.from({ length: maxRoom }, (_, index) => roomCode(floor, index + 1)),
)
const DEFAULT_DONE_CODES = new Set<string>()
const DEFAULT_DONE_RECORDS: Record<string, RoomRecord> = Object.fromEntries(
  [...DEFAULT_DONE_CODES].map((code) => [code, { ...defaultRecord(), status: 'DONE', completedAt: '' }]),
)
const STATUS_LABELS: Record<RoomStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Terminada',
}
const STATUS_CLASSES: Record<RoomStatus, string> = {
  PENDING: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  IN_PROGRESS: 'border-orange-300 bg-orange-400 text-white hover:bg-orange-500',
  DONE: 'border-emerald-300 bg-emerald-500 text-white hover:bg-emerald-600',
}
const STATUS_COLORS: Record<RoomStatus, { fill: string; stroke: string; text: string }> = {
  PENDING: { fill: '#FFFFFF', stroke: '#CBD5E1', text: '#334155' },
  IN_PROGRESS: { fill: '#FB923C', stroke: '#EA580C', text: '#FFFFFF' },
  DONE: { fill: '#22C55E', stroke: '#15803D', text: '#FFFFFF' },
}

function roomCode(floor: number, roomNumber: number) {
  return `${floor}-${String(roomNumber).padStart(2, '0')}`
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function defaultRecord(): RoomRecord {
  return { status: 'PENDING', completedAt: '', technician: '', notes: '' }
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export default function RoomFancoilPreventivesPage() {
  const navigate = useNavigate()
  const { hotel } = useHotelScope()
  const hotelKey = hotel?.id ?? 'hotel-no-seleccionado'
  const storageKey = `arias-suite:room-fancoil-preventives:v1:${hotelKey}`
  const [records, setRecords] = useState<Record<string, RoomRecord>>({})
  const [activeRooms, setActiveRooms] = useState<string[]>(DEFAULT_ROOM_CODES)
  const [loadedKey, setLoadedKey] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [draft, setDraft] = useState<RoomDraft>(defaultRecord())
  const [selectedStatus, setSelectedStatus] = useState<RoomStatus>('IN_PROGRESS')
  const [filter, setFilter] = useState<'ALL' | RoomStatus>('ALL')
  const [notice, setNotice] = useState('')
  const [loggedInTechnician, setLoggedInTechnician] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<
    | { kind: 'status'; code: string; status: RoomStatus }
    | { kind: 'save' }
    | null
  >(null)

  useEffect(() => {
    let cancelled = false

    async function loadTechnician() {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (cancelled) return
      if (userError || !user) {
        setLoggedInTechnician('')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      setLoggedInTechnician(profile?.full_name?.trim() || profile?.email?.trim() || user.email || '')
    }

    void loadTechnician()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadRoomData() {
      setActiveRooms(safeRead<string[]>(`${storageKey}:rooms`, DEFAULT_ROOM_CODES))
      setSelectedRoom(null)
      setLoadedKey(storageKey)

      if (!hotel?.id) {
        setRecords({ ...DEFAULT_DONE_RECORDS })
        setNotice('Selecciona un hotel para guardar los estados de las habitaciones.')
        return
      }

      const { data, error } = await supabase
        .from('maintenance_room_fancoil_tracking')
        .select('room_code, status, completed_at, technician, notes')
        .eq('hotel_id', hotel.id)

      if (cancelled) return
      if (error) {
        setRecords({ ...DEFAULT_DONE_RECORDS })
        setNotice('No se han podido cargar los estados guardados. Comprueba tus permisos de mantenimiento.')
        return
      }

      // Create an initial database row for each configured room, preserving rows already stored.
      const configuredRooms = safeRead<string[]>(`${storageKey}:rooms`, DEFAULT_ROOM_CODES)
      const storedCodes = new Set((data ?? []).map((row) => row.room_code))
      const initialRows = configuredRooms
        .filter((room_code) => !storedCodes.has(room_code))
        .map((room_code) => {
          const initial = DEFAULT_DONE_CODES.has(room_code) ? 'DONE' : 'PENDING'
          return {
            hotel_id: hotel.id,
            room_code,
            status: initial,
            completed_at: null,
            technician: '',
            notes: '',
          }
        })

      let persistedData = data ?? []
      if (initialRows.length) {
        const { error: seedError } = await supabase
          .from('maintenance_room_fancoil_tracking')
          .upsert(initialRows, { onConflict: 'hotel_id,room_code', ignoreDuplicates: true })

        if (cancelled) return
        if (seedError) {
          setNotice('No se han podido inicializar todas las habitaciones en la base de datos. Comprueba tus permisos de mantenimiento.')
        } else {
          const { data: refreshed, error: refreshError } = await supabase
            .from('maintenance_room_fancoil_tracking')
            .select('room_code, status, completed_at, technician, notes')
            .eq('hotel_id', hotel.id)
          if (cancelled) return
          if (!refreshError && refreshed) persistedData = refreshed
        }
      }

      const savedRecords: Record<string, RoomRecord> = Object.fromEntries(
        persistedData.map((row) => [row.room_code, {
          status: row.status as RoomStatus,
          completedAt: row.completed_at ?? '',
          technician: row.technician ?? '',
          notes: row.notes ?? '',
        }]),
      )
      setRecords({ ...DEFAULT_DONE_RECORDS, ...savedRecords })

    }

    void loadRoomData()
    return () => { cancelled = true }
  }, [hotel?.id, storageKey])

  useEffect(() => {
    if (notice !== 'Guardado') return
    const timeout = window.setTimeout(() => setNotice(''), 500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (loadedKey !== storageKey) return
    try {
      localStorage.setItem(`${storageKey}:rooms`, JSON.stringify(activeRooms))
    } catch {
      setNotice('El navegador no ha podido guardar la configuración de habitaciones.')
    }
  }, [activeRooms, loadedKey, storageKey])

  const roomsByFloor = useMemo(
    () => FLOOR_ROOM_LIMITS.map(({ floor, maxRoom }) => ({
      floor,
      rooms: Array.from({ length: maxRoom }, (_, index) => roomCode(floor, index + 1))
        .filter((code) => activeRooms.includes(code))
        .filter((code) => {
          if (filter === 'ALL') return true
          return (records[code]?.status ?? (DEFAULT_DONE_CODES.has(code) ? 'DONE' : 'PENDING')) === filter
        }),
    })).filter((row) => row.rooms.length > 0),
    [activeRooms, filter, records],
  )

  const totals = useMemo(() => {
    const all = activeRooms
    const done = all.filter((code) => (records[code]?.status ?? (DEFAULT_DONE_CODES.has(code) ? 'DONE' : 'PENDING')) === 'DONE').length
    const inProgress = all.filter((code) => (records[code]?.status ?? (DEFAULT_DONE_CODES.has(code) ? 'DONE' : 'PENDING')) === 'IN_PROGRESS').length
    return { total: all.length, done, inProgress, pending: all.length - done - inProgress }
  }, [activeRooms, records])

  const selectedRecord = selectedRoom ? records[selectedRoom] ?? defaultRecord() : null

  useEffect(() => {
    if (selectedRoom) setDraft({ ...(records[selectedRoom] ?? defaultRecord()) })
  }, [records, selectedRoom])

  async function setRoomStatus(code: string, status: RoomStatus) {
    if (!hotel?.id) {
      setNotice('Selecciona un hotel antes de guardar los cambios.')
      return
    }
    const existing = records[code] ?? (DEFAULT_DONE_CODES.has(code) ? { ...defaultRecord(), status: 'DONE' as RoomStatus } : defaultRecord())
    const updated: RoomRecord = {
      ...existing,
      status,
      completedAt: status === 'DONE' ? (existing.completedAt || localDate()) : '',
    }

    const technician = loggedInTechnician || updated.technician
    const { error } = await supabase.from('maintenance_room_fancoil_tracking').upsert({
      hotel_id: hotel.id,
      room_code: code,
      status: updated.status,
      completed_at: updated.completedAt || null,
      technician,
      notes: updated.notes,
    }, { onConflict: 'hotel_id,room_code' })

    if (error) {
      setNotice(`No se ha podido guardar el preventivo de la habitación ${code} en la base de datos. Comprueba tus permisos e inténtalo de nuevo.`)
      return
    }
    setRecords((current) => ({ ...current, [code]: { ...updated, technician: loggedInTechnician || updated.technician } }))
    setNotice('Guardado')
  }

  async function confirmPendingChange() {
    const confirmation = pendingConfirmation
    setPendingConfirmation(null)
    if (!confirmation) return
    if (confirmation.kind === 'status') {
      await setRoomStatus(confirmation.code, confirmation.status)
      return
    }
    await saveRoom()
  }

  async function saveRoom() {
    if (!selectedRoom) return
    if (!hotel?.id) {
      setNotice('Selecciona un hotel antes de guardar los cambios.')
      return
    }
    const roomCodeToSave = selectedRoom
    const completedAt = draft.status === 'DONE' ? (draft.completedAt || localDate()) : ''
    const updated = { ...draft, completedAt, technician: draft.technician.trim() || loggedInTechnician }
    const { error } = await supabase.from('maintenance_room_fancoil_tracking').upsert({
      hotel_id: hotel.id,
      room_code: roomCodeToSave,
      status: updated.status,
      completed_at: updated.completedAt || null,
      technician: updated.technician,
      notes: updated.notes,
    }, { onConflict: 'hotel_id,room_code' })

    if (error) {
      setNotice(`No se ha podido guardar el preventivo de la habitación ${roomCodeToSave}. Comprueba tus permisos e inténtalo de nuevo.`)
      return
    }

    setRecords((current) => ({ ...current, [roomCodeToSave]: updated }))
    setSelectedRoom(null)
    setNotice('Guardado')
  }

  function exportRoomListPdf() {
    // Exportar exactamente las mismas habitaciones que muestra el filtro del cuadrante.
    const rows = roomsByFloor
      .flatMap(({ floor, rooms }) => rooms.map((code) => ({
        code, floor,
        record: records[code] ?? (DEFAULT_DONE_CODES.has(code) ? { ...defaultRecord(), status: 'DONE' as RoomStatus } : defaultRecord()),
      })))
      .sort((a, b) => a.floor - b.floor || a.code.localeCompare(b.code, 'es', { numeric: true }))

    if (!rows.length) {
      setNotice('No hay preventivos en este filtro para exportar.')
      return
    }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const filterLabel = filter === 'ALL' ? 'Todos los estados' : STATUS_LABELS[filter]
    const dateLabel = new Date().toLocaleDateString('es-ES')
    pdf.setFontSize(17)
    pdf.text('PREVENTIVOS DE FANCOILS · Listado de habitaciones', 14, 16)
    pdf.setFontSize(10)
    pdf.text(`Hotel: ${hotel?.name || 'No especificado'}`, 14, 23)
    pdf.text(`Filtro: ${filterLabel} · Fecha de emisión: ${dateLabel} · Habitaciones: ${rows.length}`, 14, 29)

    autoTable(pdf, {
      startY: 34,
      head: [['Habitación', 'Planta', 'Estado', 'Fecha del preventivo', 'Observaciones']],
      body: rows.map(({ code, floor, record }) => [
        code,
        String(floor),
        STATUS_LABELS[record.status],
        record.completedAt ? new Date(`${record.completedAt}T12:00:00`).toLocaleDateString('es-ES') : '—',
        record.notes || '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2.2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 18 },
        2: { cellWidth: 28 },
        3: { cellWidth: 42 },
      },
      margin: { left: 14, right: 14, bottom: 14 },
      didDrawPage: () => {
        const pageCount = pdf.getNumberOfPages()
        pdf.setFontSize(8)
        pdf.text(`Arias Suite · Página ${pageCount}`, pdf.internal.pageSize.getWidth() - 14, pdf.internal.pageSize.getHeight() - 7, { align: 'right' })
      },
    })

    pdf.save(`preventivos-fancoils-listado-${filter === 'ALL' ? 'todos' : filter.toLowerCase()}-${localDate()}.pdf`)
    setNotice('PDF de preventivos descargado.')
  }

  function exportBuildingImage() {
    // La exportación usa las filas visibles; el filtro ya se ha aplicado en roomsByFloor.
    const rows = roomsByFloor
    if (!rows.length) {
      setNotice('No hay habitaciones con el estado seleccionado para exportar.')
      return
    }

    const filterLabel = filter === 'ALL' ? 'Todos los estados' : STATUS_LABELS[filter]
    const filterSlug = filter === 'ALL' ? 'todos' : filter === 'PENDING' ? 'pendientes'
      : filter === 'IN_PROGRESS' ? 'en-curso' : 'terminados'
    const visibleRoomCount = rows.reduce((total, row) => total + row.rooms.length, 0)
    const maxRooms = Math.max(...rows.map((row) => row.rooms.length))
    const padding = 34
    const labelWidth = 142
    const cellWidth = 43
    const cellHeight = 34
    const rowHeight = 43
    const headerHeight = 160
    const width = Math.max(520, padding * 2 + labelWidth + maxRooms * cellWidth)
    const height = headerHeight + rows.length * rowHeight + 74
    const canvas = document.createElement('canvas')
    const scale = 2
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) {
      setNotice('No se ha podido generar la imagen en este navegador.')
      return
    }
    context.scale(scale, scale)
    context.fillStyle = '#F8FAFC'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#0F172A'
    context.font = '700 25px Arial, sans-serif'
    context.fillText('PREVENTIVOS DE FANCOILS', padding, 42)
    context.fillStyle = '#475569'
    context.font = '14px Arial, sans-serif'
    context.fillText(hotel?.name ? `Hotel: ${hotel.name}` : 'Seguimiento de habitaciones', padding, 67)
    context.fillText(`Estado a fecha de ${new Date().toLocaleDateString('es-ES')}`, padding, 89)
    context.fillText(`Filtro: ${filterLabel} · ${visibleRoomCount} habitaciones`, padding, 110)
    context.font = 'bold 13px Arial, sans-serif'
    context.fillStyle = '#475569'

    const legendY = 143
    const legend = ([
      { label: 'Terminada', status: 'DONE' as RoomStatus },
      { label: 'Pendiente', status: 'PENDING' as RoomStatus },
      { label: 'En curso', status: 'IN_PROGRESS' as RoomStatus },
    ]).filter((item) => filter === 'ALL' || item.status === filter)
      .map((item, index) => ({ ...item, x: padding + index * 126 }))
    context.font = '11px Arial, sans-serif'
    legend.forEach((item) => {
      context.fillStyle = STATUS_COLORS[item.status].fill
      context.strokeStyle = STATUS_COLORS[item.status].stroke
      context.lineWidth = 1
      context.fillRect(item.x, legendY - 10, 13, 13)
      context.strokeRect(item.x, legendY - 10, 13, 13)
      context.fillStyle = '#334155'
      context.fillText(item.label, item.x + 19, legendY)
    })

    const startY = headerHeight
    rows.forEach((row, rowIndex) => {
      const y = startY + rowIndex * rowHeight
      context.fillStyle = '#E2E8F0'
      context.fillRect(padding, y, labelWidth - 10, cellHeight)
      context.fillStyle = '#1E293B'
      context.font = 'bold 12px Arial, sans-serif'
      context.textBaseline = 'middle'
      context.fillText(`PLANTA ${row.floor}`, padding + 8, y + cellHeight / 2)
      row.rooms.forEach((code, roomIndex) => {
        const status = records[code]?.status ?? (DEFAULT_DONE_CODES.has(code) ? 'DONE' : 'PENDING')
        const colors = STATUS_COLORS[status]
        const x = padding + labelWidth + roomIndex * cellWidth
        context.fillStyle = colors.fill
        context.strokeStyle = colors.stroke
        context.lineWidth = 1
        context.fillRect(x, y, cellWidth - 4, cellHeight)
        context.strokeRect(x, y, cellWidth - 4, cellHeight)
        context.fillStyle = colors.text
        context.font = 'bold 10px Arial, sans-serif'
        context.textAlign = 'center'
        context.fillText(code.split('-')[1], x + (cellWidth - 4) / 2, y + cellHeight / 2)
        context.textAlign = 'left'
      })
    })
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#64748B'
    context.font = '11px Arial, sans-serif'
    context.fillText('Arias Suite · Control de preventivos por habitación', padding, height - 22)

    canvas.toBlob((blob) => {
      if (!blob) {
        setNotice('No se ha podido crear la imagen. Inténtalo de nuevo.')
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `preventivos-fancoils-${filterSlug}-${localDate()}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice(`Imagen descargada · ${filterLabel} · ${visibleRoomCount} habitaciones.`)
    }, 'image/png')
  }

  return (
    <div className="min-h-screen bg-slate-100 px-2 py-2 text-slate-900 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-[1600px]">
        <header className="room-led-header mb-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
          <div className="room-led-header-layout">
            <div className="room-led-title flex min-w-0 items-center gap-2">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-11" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">Preventivos de Fancoils</h1>
                <p className="mt-0.5 text-[10px] text-slate-400 sm:text-xs">Control visual de preventivos por habitación</p>
              </div>
            </div>
            <div className="room-led-toolbar arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto">
              <BackButton onBack={() => navigate('/maintenance')} />
              <HomeButton onHome={() => navigate('/')} />
              <ActionButton icon={FileText} label="Exportar" onClick={exportRoomListPdf} />
              <ActionButton icon={Download} label="Imagen" onClick={exportBuildingImage} />
            </div>
          </div>
        </header>

        <main className="space-y-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <label htmlFor="room-list-filter" className="text-xs font-semibold text-slate-600">Filtrar listado:</label>
                <select id="room-list-filter" value={filter} onChange={(event) => setFilter(event.target.value as 'ALL' | RoomStatus)} className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800">
                  <option value="ALL">Todos los estados</option>
                  <option value="IN_PROGRESS">En curso</option>
                  <option value="PENDING">Pendientes</option>
                  <option value="DONE">Terminadas</option>
                </select>
              </div>

            <div className="mt-2 flex flex-wrap items-center gap-2" aria-label="Estado que se aplicará al pulsar una habitación">
                <span className="text-[11px] text-slate-500">Marcar:</span>
                {([
                  ['DONE', 'Terminado'],
                  ['IN_PROGRESS', 'En curso'],
                  ['PENDING', 'Pendiente'],
                ] as Array<[RoomStatus, string]>).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setSelectedStatus(value)} aria-pressed={selectedStatus === value} className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${selectedStatus === value ? 'ring-1 ring-slate-500 ring-offset-1' : ''} ${STATUS_CLASSES[value]}`}>
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-slate-500">Terminadas <strong className="text-emerald-700">{totals.done}</strong> · En curso <strong className="text-orange-600">{totals.inProgress}</strong> · Pendientes <strong>{totals.pending}</strong></span>
              </div>

            <div className="mt-3 overflow-x-auto pb-1">
              <div className="min-w-[930px] space-y-1.5">
                {roomsByFloor.map((row) => (
                  <div key={row.floor} className="flex items-center gap-2">
                    <div className="w-[104px] shrink-0 rounded-lg bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700">PLANTA {row.floor}</div>
                    <div className="flex min-w-0 flex-1 gap-1">
                      {row.rooms.map((code) => {
                        const record = records[code] ?? (DEFAULT_DONE_CODES.has(code) ? { ...defaultRecord(), status: 'DONE' as RoomStatus } : defaultRecord())
                        return (
                          <button key={code} type="button" onClick={() => { const currentStatus = records[code]?.status ?? (DEFAULT_DONE_CODES.has(code) ? 'DONE' : 'PENDING'); setNotice(''); if (currentStatus === selectedStatus) { setPendingConfirmation(null); return }; setPendingConfirmation({ kind: 'status', code, status: selectedStatus }) }} onDoubleClick={() => { setSelectedRoom(code); setNotice('') }} aria-label={`Habitación ${code}: ${STATUS_LABELS[record.status]}`} className={`h-9 min-w-8 flex-1 rounded-md border text-[11px] font-bold transition focus:outline-none focus:ring-2 focus:ring-slate-500 ${STATUS_CLASSES[record.status]}`}>
                            {code.split('-')[1]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <Legend color="bg-emerald-500 border-emerald-600" label="Terminada" />
              <Legend color="bg-white border-slate-300" label="Pendiente" />
              <Legend color="bg-orange-400 border-orange-600" label="En curso" />
            </div>
            {notice && (notice === 'Guardado'
              ? <p role="status" aria-live="polite" className="mt-2 text-xs text-emerald-700">Guardado</p>
              : <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{notice}</p>
            )}
          </section>
        </main>
      </div>

      {pendingConfirmation && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/45 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="change-confirmation-title" className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl">
            <h2 id="change-confirmation-title" className="text-base font-bold text-slate-900">Confirmar cambio</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600">
              {pendingConfirmation.kind === 'status'
                ? `¿Cambiar la habitación ${pendingConfirmation.code} a «${STATUS_LABELS[pendingConfirmation.status]}»?`
                : `¿Guardar el preventivo de la habitación ${selectedRoom ?? ''}?`}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setPendingConfirmation(null)} className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => { void confirmPendingChange() }} className="min-h-10 flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">Aceptar</button>
            </div>
          </section>
        </div>
      )}

      {selectedRoom && selectedRecord && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRoom(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="room-detail-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ficha de preventivo</p>
                <h2 id="room-detail-title" className="mt-1 text-xl font-bold text-slate-900">Habitación {selectedRoom}</h2>
                <p className="mt-1 text-sm text-slate-500">Preventivos de Fancoils</p>
              </div>
              <button type="button" onClick={() => setSelectedRoom(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar ficha"><X size={20} /></button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Estado del trabajo</span>
                <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as RoomStatus }))} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200">
                  <option value="PENDING">Pendiente</option>
                  <option value="IN_PROGRESS">En curso</option>
                  <option value="DONE">Terminada</option>
                </select>
              </label>
              {draft.status === 'DONE' && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha del preventivo</span>
                  <input type="date" value={draft.completedAt || localDate()} onChange={(event) => setDraft((current) => ({ ...current, completedAt: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Realizado por</span>
                <input value={draft.technician} onChange={(event) => setDraft((current) => ({ ...current, technician: event.target.value }))} placeholder="Nombre del técnico (opcional)" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Observaciones</span>
                <textarea value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Material, incidencias o detalles del trabajo..." className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelectedRoom(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => setPendingConfirmation({ kind: 'save' })} className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Guardar preventivo</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3.5 w-3.5 rounded-sm border ${color}`} />
      <span>{label}</span>
    </span>
  )
}
