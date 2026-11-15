import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  ClipboardPlus,
  Droplets,
  FileText,
  Plus,
  Save,
  Trash2,
  Waves,
} from 'lucide-react'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import ActionButton from '../../../shared/components/buttons/ActionButton'

export type WaterQualityBookType = 'pool' | 'spa'
type Disinfectant = 'CHLORINE' | 'BROMINE'

interface SampleRecord {
  id: string
  date: string
  time: string
  temperature: string
  freeChlorine: string
  combinedChlorine: string
  totalChlorine: string
  bromine: string
  ph: string
  transparency: boolean | null
  turbidity: string
  filteredWater: string
  filtersCleaned: boolean | null
  technician: string
  notes: string
  disinfectant: Disinfectant
}

interface WaterQualityBookPageProps {
  type: WaterQualityBookType
}

const emptySample: SampleRecord = {
  id: '',
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

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function localTime() {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
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
  helper?: string
}) {
  return (
    <div className={'rounded-2xl border bg-white p-3 shadow-sm ' + (status === 'CRITICAL' ? 'border-red-200' : 'border-slate-200')}>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-sm font-bold text-slate-800'>{label}</div>
          <div className='mt-0.5 text-[11px] leading-4 text-slate-500'>Referencia: {reference}</div>
          {helper && <div className='text-[10px] leading-4 text-slate-400'>{helper}</div>}
        </div>
        <span className={'shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ' + statusClass(status)}>
          {statusText(status)}
        </span>
      </div>
      <div className='mt-2 flex items-center gap-2'>
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : 'text'}
          step={type === 'number' ? step : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className='w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-lg font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500'
        />
        {unit && <span className='w-14 shrink-0 text-right text-xs font-semibold text-slate-500'>{unit}</span>}
      </div>
    </div>
  )
}

export default function WaterQualityBookPage({ type }: WaterQualityBookPageProps) {
  const navigate = useNavigate()
  const { alert: showAlert, confirm } = useSystemDialog()
  const isSpa = type === 'spa'
  const title = isSpa ? 'Libro de SPA' : 'Libro de Piscina'
  const subtitle = isSpa ? 'Control de calidad del agua del vaso de hidromasaje' : 'Control de calidad del agua de la piscina'
  const [records, setRecords] = useState<SampleRecord[]>([])
  const [form, setForm] = useState<SampleRecord>(() => ({
    ...emptySample,
    date: localDate(),
    time: localTime(),
  }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(true)
  const [disinfectant, setDisinfectant] = useState<Disinfectant>('CHLORINE')
  const technicianRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setForm((current) => ({ ...current, disinfectant }))
  }, [disinfectant])

  const updateField = <K extends keyof SampleRecord>(field: K, value: SampleRecord[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const calculatedTotalChlorine = useMemo(() => {
    const free = toNumber(form.freeChlorine)
    const combined = toNumber(form.combinedChlorine)
    if (free === null || combined === null) return ''
    return (free + combined).toFixed(2)
  }, [form.freeChlorine, form.combinedChlorine])

  useEffect(() => {
    if (form.totalChlorine !== calculatedTotalChlorine) {
      setForm((current) => ({ ...current, totalChlorine: calculatedTotalChlorine }))
    }
  }, [calculatedTotalChlorine, form.totalChlorine])

  const temperatureStatus = isSpa
    ? rangeStatus(form.temperature, undefined, 36, undefined, 40)
    : 'EMPTY'
  const freeChlorineStatus = rangeStatus(form.freeChlorine, 0.5, 2, 0, 5)
  const combinedChlorineStatus = rangeStatus(form.combinedChlorine, undefined, 0.6, undefined, 3)
  const phStatus = rangeStatus(form.ph, 7.2, 8.0, 6, 9)
  const turbidityStatus = rangeStatus(form.turbidity, undefined, 5, undefined, 20)
  const bromineStatus = rangeStatus(form.bromine, 2, 5, undefined, 10)

  function handleNew() {
    setSelectedId(null)
    setForm({ ...emptySample, date: localDate(), time: localTime(), disinfectant })
    setEditing(true)
    requestAnimationFrame(() => technicianRef.current?.focus())
  }

  function handleSelect(record: SampleRecord) {
    setSelectedId(record.id)
    setForm({ ...record })
    setDisinfectant(record.disinfectant)
    setEditing(false)
  }

  async function handleSave() {
    if (!form.date || !form.time || !form.technician.trim()) {
      await showAlert({
        title: 'Datos obligatorios',
        message: 'Debes indicar fecha, hora y técnico antes de guardar la muestra.',
        variant: 'warning',
      })
      return
    }

    const next = { ...form, totalChlorine: calculatedTotalChlorine }

    if (selectedId) {
      setRecords((current) => current.map((record) => record.id === selectedId ? next : record))
    } else {
      const newRecord = { ...next, id: crypto.randomUUID() }
      setRecords((current) => [newRecord, ...current])
      setSelectedId(newRecord.id)
      setForm(newRecord)
    }

    setEditing(false)
    await showAlert({
      title: 'Muestra guardada',
      message: 'La muestra queda registrada en la pantalla para esta sesión.',
      variant: 'success',
    })
  }

  async function handleDelete() {
    if (!selectedId) return
    const confirmed = await confirm({
      title: 'Eliminar muestra',
      message: '¿Quieres eliminar esta muestra? Esta acción no se puede deshacer.',
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    setRecords((current) => current.filter((record) => record.id !== selectedId))
    setSelectedId(null)
    setForm({ ...emptySample, date: localDate(), time: localTime(), disinfectant })
    setEditing(true)
  }

  const notesWarning = [freeChlorineStatus, combinedChlorineStatus, phStatus, turbidityStatus, isSpa ? temperatureStatus : 'OK', disinfectant === 'BROMINE' ? bromineStatus : 'OK']
    .some((status) => status === 'OUT' || status === 'CRITICAL')

  return (
    <div className='min-h-screen bg-slate-100 px-3 py-3 pb-24 text-slate-900 sm:px-5 sm:py-5'>
      <div className='mx-auto max-w-[1280px]'>
        <header className='mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex min-w-0 items-center gap-3'>
              <BrandLogo onActivate={() => navigate('/')} className='h-9 w-auto shrink-0 object-contain sm:h-12' />
              <div className='min-w-0'>
                <h1 className='text-xl font-bold leading-tight sm:text-3xl'>{title}</h1>
                <p className='text-xs text-slate-500 sm:text-sm'>{subtitle}</p>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <BackButton onBack={() => navigate('/registros-tecnicos')} />
              <HomeButton onHome={() => navigate('/')} />
              <div className='hidden sm:flex gap-2'>
                <ActionButton icon={Plus} label='Nueva muestra' onClick={handleNew} />
                <ActionButton icon={Save} label='Guardar' tone='success' onClick={() => void handleSave()} />
                <ActionButton icon={Trash2} label='Eliminar' tone='danger' disabled={!selectedId} onClick={() => void handleDelete()} />
              </div>
            </div>
          </div>
        </header>

        <section className='mb-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 shadow-sm sm:p-4'>
          <div className='flex items-start gap-3'>
            <ClipboardPlus className='mt-0.5 shrink-0 text-blue-700' size={20} />
            <div className='min-w-0'>
              <div className='text-sm font-bold text-slate-800'>Referencia para la toma de muestras</div>
              <p className='mt-1 text-xs leading-5 text-slate-600'>
                Los valores se muestran junto a cada lectura para comparar la muestra en el momento de introducirla. Referencia sanitaria estatal: Real Decreto 742/2013.
              </p>
              <p className='mt-1 text-[10px] leading-4 text-slate-500'>
                En Cataluña, el Manual técnico de piscinas de ASPCAT indica que su contenido se basa en el Decreto 95/2000 y es vigente en lo que no contradiga el RD 742/2013.
              </p>
            </div>
          </div>
        </section>

        <div className='grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]'>
          <main className='space-y-3'>
            <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-base font-bold sm:text-lg'>Datos de la muestra</h2>
                  <p className='text-[11px] text-slate-500'>Registra una toma por cada control realizado.</p>
                </div>
                {notesWarning && <span className='rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700'>Revisar lectura</span>}
              </div>
              <div className='grid gap-3 sm:grid-cols-3'>
                <label className='block'>
                  <span className='mb-1 block text-xs font-semibold text-slate-600'>Fecha</span>
                  <input type='date' value={form.date} disabled={!editing} onChange={(event) => updateField('date', event.target.value)} className='w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100' />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs font-semibold text-slate-600'>Hora</span>
                  <input type='time' value={form.time} disabled={!editing} onChange={(event) => updateField('time', event.target.value)} className='w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100' />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs font-semibold text-slate-600'>Técnico</span>
                  <input ref={technicianRef} value={form.technician} disabled={!editing} onChange={(event) => updateField('technician', event.target.value)} placeholder='Nombre o iniciales' className='w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-500 disabled:bg-slate-100' />
                </label>
              </div>
            </section>

            <section className='rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4'>
              <div className='mb-3 flex items-start justify-between gap-3'>
                <div>
                  <h2 className='text-base font-bold sm:text-lg'>Parámetros de agua</h2>
                  <p className='text-[11px] text-slate-500'>La referencia aparece siempre debajo del parámetro.</p>
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

              <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                <ParameterCard label='Temperatura' unit='°C' reference={isSpa ? '≤ 36 °C en hidromasaje' : '24–30 °C si el vaso está climatizado'} value={form.temperature} onChange={(value) => updateField('temperature', value)} status={temperatureStatus} disabled={!editing} step='0.1' helper={isSpa ? 'Cierre del vaso si supera 40 °C.' : 'En piscina exterior no climatizada se registra la Tª, pero la banda 24–30 °C aplica a vasos climatizados.'} />
                {disinfectant === 'CHLORINE' && <ParameterCard label='Cloro libre residual' unit='mg/L' reference='0,5–2,0 mg/L' value={form.freeChlorine} onChange={(value) => updateField('freeChlorine', value)} status={freeChlorineStatus} disabled={!editing} step='0.01' helper='Cierre si ausencia de cloro o > 5 mg/L.' />}
                {disinfectant === 'CHLORINE' && <ParameterCard label='Cloro combinado residual' unit='mg/L' reference='≤ 0,6 mg/L' value={form.combinedChlorine} onChange={(value) => updateField('combinedChlorine', value)} status={combinedChlorineStatus} disabled={!editing} step='0.01' helper='Cierre si > 3 mg/L.' />}
                {disinfectant === 'CHLORINE' && <div className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm'>
                  <div className='text-sm font-bold text-slate-800'>Cloro total</div>
                  <div className='mt-0.5 text-[11px] leading-4 text-slate-500'>Calculado: cloro libre + cloro combinado</div>
                  <div className='mt-2 flex items-center gap-2'>
                    <div className='w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-lg font-bold text-slate-800'>{form.totalChlorine || '—'}</div>
                    <span className='w-14 shrink-0 text-right text-xs font-semibold text-slate-500'>mg/L</span>
                  </div>
                  <div className='mt-1 text-[10px] leading-4 text-slate-400'>No tiene valor paramétrico independiente en el RD 742/2013.</div>
                </div>}
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
                    <input type='number' inputMode='decimal' step='0.01' value={form.filteredWater} disabled={!editing} onChange={(event) => updateField('filteredWater', event.target.value)} className='w-full rounded-xl border border-slate-300 px-3 py-3 text-lg font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100' />
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
          </main>

          <aside className='space-y-3'>
            <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'>
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-base font-bold'>Muestras registradas</h2>
                  <p className='text-[11px] text-slate-500'>{records.length} en esta sesión</p>
                </div>
                <button type='button' onClick={handleNew} className='rounded-xl border border-blue-100 bg-blue-50 p-2 text-blue-700 sm:hidden' aria-label='Nueva muestra'>
                  <Plus size={18} />
                </button>
              </div>
              <div className='mt-3 max-h-[420px] space-y-2 overflow-auto pr-1'>
                {records.map((record) => (
                  <button key={record.id} type='button' onClick={() => handleSelect(record)} className={'w-full rounded-xl border p-3 text-left transition ' + (selectedId === record.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-sm font-bold text-slate-800'>{record.date}</span>
                      <span className='text-[11px] font-semibold text-slate-500'>{record.time}</span>
                    </div>
                    <div className='mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500'>
                      <span>{record.technician || 'Sin técnico'}</span>
                      <span>{record.disinfectant === 'BROMINE' ? 'Bromo' : 'Cloro'}</span>
                    </div>
                  </button>
                ))}
                {records.length === 0 && <div className='rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500'>Todavía no hay muestras en esta sesión.</div>}
              </div>
            </section>

            <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4'>
              <div className='mb-2 text-sm font-bold text-slate-800'>Recordatorio de referencia</div>
              <div className='space-y-2 text-xs text-slate-600'>
                <div className='flex items-center justify-between gap-3'><span>pH</span><strong>7,2–8,0</strong></div>
                <div className='flex items-center justify-between gap-3'><span>Cloro libre</span><strong>0,5–2,0 mg/L</strong></div>
                <div className='flex items-center justify-between gap-3'><span>Cloro combinado</span><strong>≤ 0,6 mg/L</strong></div>
                <div className='flex items-center justify-between gap-3'><span>Turbidez</span><strong>≤ 5 UNF</strong></div>
                <div className='flex items-center justify-between gap-3'><span>{isSpa ? 'Temperatura SPA' : 'Temperatura climatizada'}</span><strong>{isSpa ? '≤ 36 °C' : '24–30 °C'}</strong></div>
              </div>
              <div className='mt-3 rounded-xl bg-slate-50 p-2 text-[10px] leading-4 text-slate-500'>La ficha no sustituye el protocolo sanitario del establecimiento ni los controles periódicos de laboratorio.</div>
            </section>

            <section className='hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:block sm:p-4'>
              <div className='flex items-center gap-2 text-sm font-bold text-slate-800'><Camera size={18} /> Evidencia</div>
              <p className='mt-1 text-[11px] leading-4 text-slate-500'>La captura fotográfica del fotómetro puede integrarse en la siguiente fase, ligada a la muestra.</p>
            </section>
          </aside>
        </div>

        <div className='pointer-events-none fixed bottom-3 right-4 z-10 hidden sm:block'>
          <div className='rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[9px] font-medium text-slate-400 shadow-sm backdrop-blur'>
            Ref. normativa · RD 742/2013
          </div>
        </div>

        <div className='fixed inset-x-3 bottom-3 z-20 sm:hidden'>
          <div className='grid grid-cols-[1fr_1.4fr] gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur'>
            <button type='button' onClick={handleNew} className='inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-bold text-blue-800'><Plus size={17} /> Nueva</button>
            <button type='button' onClick={() => void handleSave()} className='inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white shadow-sm'><Save size={17} /> Guardar muestra</button>
          </div>
        </div>
      </div>
    </div>
  )
}