import { previewPdf } from '../../../shared/components/reports/pdfPreview'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  History,

  Droplets,
  FileText,
  Plus,
  Save,

  Waves,
} from 'lucide-react'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import ActionButton from '../../../shared/components/buttons/ActionButton'

import { useAuth } from '../../auth/context/AuthProvider'
import { useHotelScope } from '../../../shared/context/HotelScopeContext'
import { isDemoUser } from '../../../core/access/demoReadOnly'
import { createEntry } from '../../technicalbooks/bookModel'
import { loadBookRecords, saveBookRecord } from '../../technicalbooks/bookRepository'
import type { BookEntry } from '../../technicalbooks/types'
import { decodeSample, encodeSample, waterBook } from '../waterBooks'
import type { Sample, WaterBookType } from '../waterBooks'
import { hotelDay } from '../../../shared/maintenance/preventiveSchedule'

import { chlorineKeys, resolveChlorine } from '../chlorine'
import PamTicketPicker from '../../technicalbooks/PamTicketPicker'

export type WaterQualityBookType = WaterBookType
type Disinfectant = Sample['disinfectant']
interface WaterQualityBookPageProps {
  type: WaterQualityBookType
}

const emptySample: Sample = {
  date: '',
  time: '',
  temperature: '',
  freeChlorine: '',
  combinedChlorine: '',
  totalChlorine: '',
  bromine: '',
  ph: '',
  transparency: null,
  turbidity: '',
  filteredWater: '',
  filtersCleaned: null,
  technician: '',
  notes: '',
  disinfectant: 'CHLORINE',
}

function localTime() {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date())
}

function toNumber(value: string) {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

type Status = 'EMPTY' | 'OK' | 'OUT' | 'CRITICAL'

function rangeStatus(value: string, min?: number, max?: number, criticalMin?: number, criticalMax?: number): Status {
  const number = toNumber(value)
  if (number === null) return 'EMPTY'
  if (criticalMin !== undefined && number < criticalMin) return 'CRITICAL'
  if (criticalMax !== undefined && number > criticalMax) return 'CRITICAL'
  if (min !== undefined && number < min) return 'OUT'
  if (max !== undefined && number > max) return 'OUT'
  return 'OK'
}

function statusText(status: Status) {
  if (status === 'OK') return 'Dentro de referencia'
  if (status === 'OUT') return 'Fuera de referencia'
  if (status === 'CRITICAL') return 'Límite crítico'
  return 'Sin medir'
}

function statusClass(status: Status) {
  if (status === 'OK') return 'border-green-200 bg-green-50 text-green-700'
  if (status === 'OUT') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'CRITICAL') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

function ParameterCard({
  label,
  unit,
  reference,
  value,
  onChange,
  type = 'number',
  step = '0.1',
  status = 'EMPTY',
  calculated = false,
  disabled = false,
  placeholder,
  helper,
}: {
  label: string
  unit?: string
  reference: string
  value: string
  onChange: (value: string) => void
  type?: 'number' | 'text'
  step?: string
  status?: Status
  disabled?: boolean
  placeholder?: string
  calculated?: boolean
  helper?: string
}) {
  return (
    <div className={'rounded-2xl border bg-white p-3 shadow-sm ' + (status === 'CRITICAL' ? 'border-red-200' : 'border-slate-200')}>
      <div className='flex flex-wrap items-start justify-between gap-1'>
        <div className='min-w-0'>
          <div className='text-sm font-bold text-slate-800'>{label}</div>
          <details className="text-[10px] text-slate-500"><summary>Referencia</summary>{reference} {helper}</details>
        </div>
        <span className={'shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ' + statusClass(status)}>
          {calculated ? 'Calculado' : statusText(status)}
        </span>
      </div>
      <div className='mt-2 flex items-center gap-2'>
        <input
          type={type}
          aria-label={label}
          inputMode={type === 'number' ? 'decimal' : 'text'}
          step={type === 'number' ? step : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className='w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-base font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500'
        />
        {unit && <span className='shrink-0 text-right text-xs font-semibold text-slate-500'>{unit}</span>}
      </div>
    </div>
  )
}

export default function WaterQualityBookPage({ type }: WaterQualityBookPageProps) {
  const { session } = useAuth()
  const { hotel } = useHotelScope()
  if (!hotel || !session?.user.id) return <p>Selecciona un hotel para consultar el libro.</p>
  return <WaterSamples key={[hotel.id, session.user.id, type].join(':')} type={type} hotelId={hotel.id} userId={session.user.id} hotelName={hotel.name} />
}

function WaterSamples({ type, hotelId, userId, hotelName }: { type: WaterBookType; hotelId: string; userId: string; hotelName: string }) {
  const book = useMemo(() => waterBook(type), [type])
  const demo = isDemoUser(userId)
  const navigate = useNavigate()
  const { alert: showAlert, confirm } = useSystemDialog()
  const isSpa = type === 'spa'
  const title = isSpa ? 'Libro de SPA' : 'Libro de Piscina'

  const [records, setRecords] = useState<BookEntry[]>([])
  const [form, setForm] = useState<Sample>(() => ({
    ...emptySample,
    date: hotelDay(),
    time: localTime(),
  }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editable, setEditing] = useState(!demo)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [loadError, setLoadError] = useState('')
  const [attempt, retry] = useState(0)
  const [history, setHistory] = useState(false)
  const [ticket, setTicket] = useState<string>()
  const [outcome, setOutcome] = useState<BookEntry['pamOutcome']>()
  const [draftId, setDraftId] = useState(() => crypto.randomUUID())
  const selected = records.find(r => r.id === selectedId)
  const editing = editable && !demo && !busy && !loading && !loadError
  useEffect(() => {
    let active = true
    setLoading(true)
    loadBookRecords(hotelId, type).then(rows => {
      if (active) { setRecords(rows); setLoadError('') }
    }).catch(e => { if (active) setLoadError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [hotelId, type, attempt])
  const [disinfectant, setDisinfectant] = useState<Disinfectant>('CHLORINE')


  useEffect(() => {
    setForm((current) => ({ ...current, disinfectant }))
  }, [disinfectant])

  const updateField = <K extends keyof Sample>(field: K, value: Sample[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const chlorine = resolveChlorine({ freeChlorine: form.freeChlorine, combinedChlorine: form.combinedChlorine, totalChlorine: form.totalChlorine })
  const temperatureStatus = isSpa
    ? rangeStatus(form.temperature, undefined, 36, undefined, 40)
    : 'EMPTY'
  const freeChlorineStatus = rangeStatus(chlorine.values.freeChlorine, 0.5, 2, 0, 5)
  const combinedChlorineStatus = rangeStatus(chlorine.values.combinedChlorine, undefined, 0.6, undefined, 3)
  const phStatus = rangeStatus(form.ph, 7.2, 8.0, 6, 9)
  const turbidityStatus = rangeStatus(form.turbidity, undefined, 5, undefined, 20)
  const bromineStatus = rangeStatus(form.bromine, 2, 5, undefined, 10)

  function handleNew() {
    setDraftId(crypto.randomUUID())
    setTicket(undefined); setOutcome(undefined); setHistory(false)
    setSelectedId(null)
    setForm({ ...emptySample, date: hotelDay(), time: localTime(), disinfectant })
    setEditing(true)

  }

  function handleSelect(record: BookEntry) {
    const sample = decodeSample(record)
    setSelectedId(record.id)
    // Older water forms always calculated total chlorine.
    const derived = chlorineKeys.find(key => record.answers[key]?.note === 'Calculado a partir de las otras dos lecturas.')
      ?? (sample.freeChlorine && sample.combinedChlorine && sample.totalChlorine ? 'totalChlorine' : null)
    setForm(derived ? { ...sample, [derived]: '' } : sample)
    setTicket(record.pamTicketId); setOutcome(record.pamOutcome); setHistory(false)

    setDisinfectant(sample.disinfectant)
    setEditing(record.status === 'DRAFT' && record.userId === userId && !demo)
  }

  async function handleSave(finalize: boolean) {
    if (!editing || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const draft = selected?.status === 'DRAFT' ? selected : null
      if (finalize && ticket && !outcome) throw new Error('Selecciona el resultado del ticket PAM.')
      if (finalize && ticket && !await confirm({ title: 'Finalizar muestra y ticket', message: '¿Se ha completado todo el trabajo del ticket seleccionado?', confirmLabel: 'Finalizar' })) return
      if (disinfectant === 'CHLORINE' && chlorine.error) throw new Error(chlorine.error)
      const base = draft ?? createEntry(book, { hotelId, userId })
      const entry = encodeSample({ ...base, id: draft?.id ?? draftId, template: book, pamTicketId: ticket, pamOutcome: outcome }, { ...form, ...chlorine.values, disinfectant })
      if (disinfectant === 'CHLORINE' && chlorine.calculated) entry.answers[chlorine.calculated].note = 'Calculado a partir de las otras dos lecturas.'
      const saved = await saveBookRecord({ hotelId, userId }, book, entry, finalize, draft)
      setRecords(rows => [saved, ...rows.filter(row => row.id !== saved.id)])
      handleSelect(saved)
      await showAlert({ title: finalize ? 'Muestra finalizada' : 'Borrador guardado', message: 'Disponible en el historial del hotel.', variant: 'success' })
    } catch (error) {
      await showAlert({ title: 'No se ha confirmado el guardado', message: error instanceof Error ? error.message : 'Revisa la conexión.', variant: 'warning' })
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function exportPdf() {
    try {
      const { buildBookPdf } = await import('../../technicalbooks/bookPdf')
      const printable = selected ? [selected] : records.length ? records : [encodeSample(createEntry(book, { hotelId, userId }), form)]
      previewPdf(await buildBookPdf(book, printable, hotelName, demo), (demo ? 'PRUEBA-' : '') + book.code + '.pdf')
    } catch (e) {
      await showAlert({ title: 'Error al generar el PDF', message: String(e), variant: 'warning' })
    }
  }

  const notesWarning = [...(disinfectant === 'CHLORINE' ? [freeChlorineStatus, combinedChlorineStatus] : []), phStatus, turbidityStatus, isSpa ? temperatureStatus : 'OK', disinfectant === 'BROMINE' ? bromineStatus : 'OK']
    .some((status) => status === 'OUT' || status === 'CRITICAL')

  return (
    <div className='book-screen min-h-screen bg-slate-100 px-2 py-2 text-slate-900 sm:px-5 sm:py-5'>
      <div className='mx-auto max-w-[1280px]'>
        <header className='mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex min-w-0 items-center gap-3'>
              <BrandLogo onActivate={() => navigate('/')} className='h-9 w-auto shrink-0 object-contain sm:h-12' />
              <div className='min-w-0'>
                <h1 className='text-xl font-bold leading-tight sm:text-3xl'>{title}</h1>
                <p className='text-xs text-slate-500 sm:text-sm'>{book.code} · {hotelName}</p>
              </div>
            </div>
            <div className='book-action-row'>
              <BackButton onBack={() => navigate('/registros-tecnicos')} />
              <HomeButton onHome={() => navigate('/')} />
              <div className='contents'>
                <ActionButton icon={FileText} label={selected || !records.length ? 'PDF de la muestra' : 'PDF del historial'} disabled={(!records.length && !demo) || busy || loading} onClick={() => void exportPdf()} />
                <ActionButton icon={History} label={history ? 'Formulario' : 'Historial'} onClick={() => setHistory(!history)} />
                {!demo && <>
                  <ActionButton icon={Plus} label='Nueva muestra' disabled={busy} onClick={handleNew} />
                  <ActionButton icon={Save} label='Guardar borrador' disabled={!editing} onClick={() => void handleSave(false)} />
                  <ActionButton icon={Save} label='Finalizar muestra' tone='success' disabled={!editing} onClick={() => void handleSave(true)} />
                </>}
              </div>
            </div>
          </div>
        </header>

        {loadError && <p role='alert'>{loadError} <button onClick={() => retry(n => n + 1)}>Reintentar</button></p>}
        {loading && <p role='status'>Cargando muestras…</p>}
        {demo && <p>PRUEBA · Solo lectura</p>}
        {!history && <main className="space-y-2">
            <p className="text-xs text-slate-600">{selected ? [selected.date, selected.time, selected.technician].join(' · ') : 'Fecha, hora y operario se registran al guardar.'}</p>
            <PamTicketPicker hotelId={hotelId} bookId={book.id} ticketId={ticket} outcome={outcome} readOnly={!editing} onSelect={t => { setTicket(t?.ticket_id); setOutcome(undefined) }} onOutcome={setOutcome} />
            <section className='rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4'>
              <div className='mb-3 flex items-start justify-between gap-3'>
                <div>
                  <h2 className='text-base font-bold sm:text-lg'>Parámetros de agua</h2>
                  {notesWarning && <span className='text-xs text-amber-800'>Revisar lectura</span>}
                </div>
                {isSpa ? <Waves className='text-blue-600' size={22} /> : <Droplets className='text-blue-600' size={22} />}
              </div>

              {isSpa && (
                <div className='mb-3 rounded-2xl border border-slate-200 bg-white p-3'>
                  <div className='mb-2 text-sm font-bold text-slate-800'>Desinfectante</div>
                  <div className='grid grid-cols-2 gap-2'>
                    <button type='button' onClick={() => setDisinfectant('CHLORINE')} disabled={!editing} className={'rounded-xl border px-3 py-3 text-sm font-bold transition ' + (disinfectant === 'CHLORINE' ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600')}>Cloro</button>
                    <button type='button' onClick={() => setDisinfectant('BROMINE')} disabled={!editing} className={'rounded-xl border px-3 py-3 text-sm font-bold transition ' + (disinfectant === 'BROMINE' ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600')}>Bromo</button>
                  </div>
                  <div className='mt-2 text-[10px] leading-4 text-slate-500'>Cloro: 0,5–2,0 mg/L. Bromo total: 2–5 mg/L según el RD 742/2013.</div>
                </div>
              )}

              <div className='grid grid-cols-2 gap-2 xl:grid-cols-3'>
                <ParameterCard label='Temperatura' unit='°C' reference={isSpa ? '≤ 36 °C en hidromasaje' : '24–30 °C si el vaso está climatizado'} value={form.temperature} onChange={(value) => updateField('temperature', value)} status={temperatureStatus} disabled={!editing} step='0.1' helper={isSpa ? 'Cierre del vaso si supera 40 °C.' : 'En piscina exterior no climatizada se registra la Tª, pero la banda 24–30 °C aplica a vasos climatizados.'} />
                {disinfectant === 'CHLORINE' && chlorineKeys.map(key => <ParameterCard key={key}
                  label={{ freeChlorine: 'Cloro libre', totalChlorine: 'Cloro total', combinedChlorine: 'Cloro combinado' }[key]} unit='mg/L'
                  reference={{ freeChlorine: '0,5–2,0 mg/L', totalChlorine: 'Libre + combinado', combinedChlorine: '≤ 0,6 mg/L' }[key]}
                  value={chlorine.values[key]} calculated={chlorine.calculated === key} onChange={value => updateField(key, value)}
                  status={key === 'freeChlorine' ? freeChlorineStatus : key === 'combinedChlorine' ? combinedChlorineStatus : 'EMPTY'}
                  disabled={!editing || chlorine.calculated === key} step='0.01' />)}
                {disinfectant === 'CHLORINE' && chlorine.error && <p role="alert" className="text-sm text-red-700">{chlorine.error}</p>}
                {disinfectant === 'BROMINE' && <ParameterCard label='Bromo total' unit='mg/L' reference='2–5 mg/L' value={form.bromine} onChange={(value) => updateField('bromine', value)} status={bromineStatus} disabled={!editing} step='0.01' helper='Cierre si > 10 mg/L.' />}
                <ParameterCard label='pH' reference='7,2–8,0' value={form.ph} onChange={(value) => updateField('ph', value)} status={phStatus} disabled={!editing} step='0.1' helper='Cierre si < 6,0 o > 9,0.' />
                <ParameterCard label='Turbidez' unit='UNF' reference='≤ 5 UNF' value={form.turbidity} onChange={(value) => updateField('turbidity', value)} status={turbidityStatus} disabled={!editing} step='0.1' helper='Cierre si > 20 UNF.' />
              </div>
            </section>

            <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'>
              <div className='mb-3'>
                <h2 className='text-base font-bold sm:text-lg'>Controles del vaso y tratamiento</h2>
                <p className='text-[11px] text-slate-500'>Campos procedentes del libro actual, adaptados a la toma desde móvil.</p>
              </div>
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='rounded-2xl border border-slate-200 p-3'>
                  <div className='text-sm font-bold text-slate-800'>Transparencia</div>
                  <div className='mt-0.5 text-[11px] text-slate-500'>Referencia: fondo/desagüe visible.</div>
                  <div className='mt-2 grid grid-cols-2 gap-2'>
                    <button type='button' disabled={!editing} onClick={() => updateField('transparency', true)} className={'rounded-xl border px-3 py-3 text-sm font-bold ' + (form.transparency === true ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600')}>Visible</button>
                    <button type='button' disabled={!editing} onClick={() => updateField('transparency', false)} className={'rounded-xl border px-3 py-3 text-sm font-bold ' + (form.transparency === false ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600')}>No visible</button>
                  </div>
                </div>
                <label className='rounded-2xl border border-slate-200 p-3'>
                  <span className='text-sm font-bold text-slate-800'>Agua depurada</span>
                  <span className='mt-0.5 block text-[11px] text-slate-500'>Registrar lectura del contador de m³.</span>
                  <div className='mt-2 flex items-center gap-2'>
                    <input type='number' inputMode='decimal' step='0.01' value={form.filteredWater} disabled={!editing} onChange={(event) => updateField('filteredWater', event.target.value)} className='w-full rounded-xl border border-slate-300 px-2 py-1.5 text-base font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100' />
                    <span className='text-xs font-semibold text-slate-500'>m³</span>
                  </div>
                </label>
                <div className='rounded-2xl border border-slate-200 p-3 sm:col-span-2'>
                  <div className='text-sm font-bold text-slate-800'>Limpieza de filtros</div>
                  <div className='mt-0.5 text-[11px] text-slate-500'>Indicar si se ha realizado durante el control.</div>
                  <div className='mt-2 grid grid-cols-2 gap-2 sm:max-w-[420px]'>
                    <button type='button' disabled={!editing} onClick={() => updateField('filtersCleaned', true)} className={'rounded-xl border px-3 py-3 text-sm font-bold ' + (form.filtersCleaned === true ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600')}>Sí, realizada</button>
                    <button type='button' disabled={!editing} onClick={() => updateField('filtersCleaned', false)} className={'rounded-xl border px-3 py-3 text-sm font-bold ' + (form.filtersCleaned === false ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600')}>No realizada</button>
                  </div>
                </div>
              </div>
            </section>

            <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'>
              <div className='mb-2 flex items-center gap-2'>
                <FileText size={18} className='text-slate-500' />
                <h2 className='text-base font-bold sm:text-lg'>Incidencias / observaciones</h2>
              </div>
              <textarea rows={4} disabled={!editing} value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder='Anota incidencias, correcciones realizadas o cualquier observación de la muestra…' className='w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100' />
            </section>
          </main>}

          {history && <aside className='space-y-2'>
            <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-base font-bold'>Historial de muestras</h2>
                  <p className='text-[11px] text-slate-500'>{records.length} en el historial del hotel</p>
                </div>
                <button type='button' disabled={busy || demo} onClick={handleNew} className='rounded-xl border border-blue-100 bg-blue-50 p-2 text-blue-700 sm:hidden' aria-label='Nueva muestra'>
                  <Plus size={18} />
                </button>
              </div>
              <div className='mt-3 max-h-[420px] space-y-2 overflow-auto pr-1'>
                {records.map((record) => (
                  <button key={record.id} type='button' disabled={busy} onClick={() => handleSelect(record)} className={'w-full rounded-xl border p-3 text-left transition ' + (selectedId === record.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-sm font-bold text-slate-800'>{record.date}</span>
                      <span className='text-[11px] font-semibold text-slate-500'>{record.time}</span>
                    </div>
                    <div className='mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500'>
                      <span>{record.technician || 'Sin técnico'}</span>
                      <span>{record.answers.disinfectant?.value} · Rev. {record.revision} · {record.status === 'FINAL' ? 'Finalizada' : 'Borrador'}</span>
                    </div>
                  </button>
                ))}
                {!loadError && !loading && records.length === 0 && <div className='rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500'>Todavía no hay muestras en el historial.</div>}
              </div>
            </section>

          </aside>}

        <div className='pointer-events-none fixed bottom-3 right-4 z-10 hidden sm:block'>
          <div className='rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[9px] font-medium text-slate-400 shadow-sm backdrop-blur'>
            Ref. normativa · RD 742/2013
          </div>
        </div>


      </div>
    </div>
  )
}
