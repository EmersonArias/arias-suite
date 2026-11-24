import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useSystemDialog } from '../../../shared/components/dialogs/SystemDialogProvider'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import UnsavedChangesDialog from '../../../shared/components/navigation/UnsavedChangesDialog'
import { useGuardedNavigation } from '../../../shared/hooks/useGuardedNavigation'
import { clonePanel, createEmptyPanel, CURRENT_TECHNICIAN, fromDatabase, getNextLocalCodeFromCodes, normalizeIdentity, statusClass, statusLabel, todayInputValue, type ElectricalPanel } from '../lib/electricalPanels'

export default function ElectricalPanelDetailPage() {
  const navigate = useNavigate()
  const { confirm } = useSystemDialog()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const isNew = location.pathname === '/electricalpanels/new'

  const [panel, setPanel] = useState<ElectricalPanel>(() => createEmptyPanel())
  const [baseline, setBaseline] = useState<ElectricalPanel>(() => createEmptyPanel())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => { void initialize() }, [id, isNew])

  const initialize = async () => {
    setLoading(true)
    setErrorMessage('')
    if (isNew) {
      const { data, error } = await supabase.from('electrical_panels').select('code')
      if (error) {
        setErrorMessage(`No se pudo generar el código: ${error.message}`)
        setPanel(createEmptyPanel())
      } else {
        const code = getNextLocalCodeFromCodes((data ?? []).map((row) => String(row.code ?? '')))
        const fresh = createEmptyPanel(code)
        setPanel(fresh)
        setBaseline(clonePanel(fresh))
      }
      setLoading(false)
      return
    }
    if (!id) {
      setErrorMessage('Registro no válido.')
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('electrical_panels').select('*').eq('id', id).single()
    if (error) {
      setErrorMessage(`Error cargando el registro: ${error.message}`)
      setLoading(false)
      return
    }
    const loaded = clonePanel(fromDatabase(data as never))
    setPanel(loaded)
    setBaseline(clonePanel(loaded))
    setLoading(false)
  }

  const updateField = <K extends keyof ElectricalPanel>(field: K, value: ElectricalPanel[K]) => setPanel((current) => ({ ...current, [field]: value }))

  const isDirty = JSON.stringify(panel) !== JSON.stringify(baseline)

  const {
    requestNavigation,
    cancelNavigation,
    discardNavigation,
    saveAndNavigate,
    dialogOpen,
    saving: navigationSaving,
  } = useGuardedNavigation({
    dirty: isDirty,
    onNavigate: navigate,
    onSave: () => save(false),
  })

  const toggleReview = (reviewId: string) => setPanel((current) => ({ ...current, reviews: current.reviews.map((review) => review.id === reviewId ? { ...review, checked: !review.checked } : review), inspectionDate: todayInputValue() }))

  const validate = () => {
    if (!panel.name.trim()) { setErrorMessage('El nombre del cuadro es obligatorio.'); return false }
    if (!panel.location.trim()) { setErrorMessage('La ubicación es obligatoria.'); return false }
    return true
  }

  const findPossibleDuplicate = async () => {
    const nameKey = normalizeIdentity(panel.name)
    const locationKey = normalizeIdentity(panel.location)
    const manufacturerKey = normalizeIdentity(panel.manufacturer)
    const modelKey = normalizeIdentity(panel.model)
    if (!nameKey || !locationKey) return null
    const { data, error } = await supabase.from('electrical_panels').select('id, code, name, location, manufacturer, model')
    if (error) throw new Error(`No se pudo comprobar duplicados: ${error.message}`)
    const rows = (data ?? []) as Array<{ id: string | number; code: string; name: string | null; location: string | null; manufacturer: string | null; model: string | null }>
    for (const row of rows) {
      if (String(row.id) === panel.id) continue
      const sameNameLocation = normalizeIdentity(row.name ?? '') === nameKey && normalizeIdentity(row.location ?? '') === locationKey
      const sameTechnicalIdentity = Boolean(manufacturerKey && modelKey) && normalizeIdentity(row.location ?? '') === locationKey && normalizeIdentity(row.manufacturer ?? '') === manufacturerKey && normalizeIdentity(row.model ?? '') === modelKey
      if (sameNameLocation || sameTechnicalIdentity) return row
    }
    return null
  }

  const buildPayload = (code: string) => ({
    code,
    name: panel.name.trim(),
    location: panel.location.trim(),
    manufacturer: panel.manufacturer.trim() || null,
    model: panel.model.trim() || null,
    installation_date: panel.installationDate || null,
    inspection_date: panel.inspectionDate || null,
    technician: CURRENT_TECHNICIAN,
    status: panel.status,
    observations: panel.observations.trim() || null,
    reviews: panel.reviews.map((review) => ({ id: review.id, name: review.name, sourceName: review.sourceName, checked: review.checked })),
    updated_at: new Date().toISOString(),
  })

  const save = async (navigateAfterSave = true): Promise<boolean> => {
    setErrorMessage('')
    if (!validate()) return false
    setSaving(true)
    try {
      const duplicate = await findPossibleDuplicate()
      if (duplicate) {
        const proceed = await confirm({
          title: 'Posible elemento repetido',
          message: `Ya existe un registro que puede corresponder al mismo elemento:

${duplicate.code} — ${duplicate.name ?? 'Sin identificar'} — ${duplicate.location ?? ''}

¿Deseas continuar de todos modos?`,
          variant: 'warning',
          confirmLabel: 'Continuar',
        })
        if (!proceed) return false
      }
      if (isNew) {
        const { data: codeRows, error: codeError } = await supabase.from('electrical_panels').select('code')
        if (codeError) throw new Error(`No se pudo generar el código: ${codeError.message}`)
        const code = getNextLocalCodeFromCodes((codeRows ?? []).map((row) => String(row.code ?? '')))
        const { data, error } = await supabase.from('electrical_panels').insert(buildPayload(code)).select('*').single()
        if (error) throw new Error(error.message)
        const saved = clonePanel(fromDatabase(data as never))
        setPanel(saved)
        setBaseline(clonePanel(saved))
        if (navigateAfterSave) navigate('/electricalpanels')
        return true
      }
      if (!panel.id) throw new Error('Registro no válido.')
      const { data, error } = await supabase.from('electrical_panels').update(buildPayload(panel.code)).eq('id', panel.id).select('*').single()
      if (error) throw new Error(error.message)
      const saved = clonePanel(fromDatabase(data as never))
      setPanel(saved)
      setBaseline(clonePanel(saved))
      if (navigateAfterSave) navigate('/electricalpanels')
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.')
      return false
    } finally { setSaving(false) }
  }

  const deleteRecord = async () => {
    if (!panel.id) { navigate('/electricalpanels'); return }
    const confirmed = await confirm({
      title: 'Eliminar registro',
      message: `¿Quieres eliminar el registro ${panel.code}? Esta acción no se puede deshacer.`,
      variant: 'warning',
      confirmLabel: 'Eliminar',
    })
    if (!confirmed) return
    setSaving(true)
    const { error } = await supabase.from('electrical_panels').delete().eq('id', panel.id)
    setSaving(false)
    if (error) { setErrorMessage(`Error eliminando el registro: ${error.message}`); return }
    navigate('/electricalpanels')
  }

  if (loading) return <div className="min-h-screen bg-slate-100 p-4"><div className="mx-auto max-w-4xl rounded-2xl bg-white p-10 text-center shadow-lg">Cargando...</div></div>

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <header className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo
                onActivate={() => requestNavigation('/')}
                className="h-12 w-auto shrink-0 object-contain sm:h-14 print:h-10"
              />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-900">Cuadro Eléctrico BT</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-slate-700">{panel.code || '—'}</span><span className={`rounded-full px-2.5 py-1 font-semibold ${statusClass(panel.status)}`}>{statusLabel(panel.status)}</span><span className="text-slate-500">{CURRENT_TECHNICIAN}</span></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-green-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => void deleteRecord()} disabled={saving} className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-red-700 disabled:opacity-50">Eliminar</button><button type="button" onClick={() => navigate(`/electricalpanels/report?scope=SELECTED&selectedId=${encodeURIComponent(panel.id)}`)} disabled={saving || !panel.id} className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white shadow-md hover:bg-slate-800 disabled:opacity-50">PDF</button><button type="button" onClick={() => navigate('/electricalpanels')} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white shadow-md hover:bg-black disabled:opacity-50">Salir</button></div>
          </div>
        </header>

        {errorMessage && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 print:hidden">{errorMessage}</div>}

        <div className="rounded-2xl bg-white p-4 shadow-lg sm:p-6">
          <section>
            <h2 className="mb-4 text-xl font-bold text-slate-900">Datos generales</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Código</span><input readOnly value={panel.code} className="w-full rounded-lg border border-slate-200 bg-slate-100 p-2.5 font-semibold text-slate-600" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Nombre *</span><input value={panel.name} onChange={(e) => updateField('name', e.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5" placeholder="Nombre del cuadro" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Ubicación *</span><input value={panel.location} onChange={(e) => updateField('location', e.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5" placeholder="Ubicación" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Fabricante</span><input value={panel.manufacturer} onChange={(e) => updateField('manufacturer', e.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Modelo</span><input value={panel.model} onChange={(e) => updateField('model', e.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Fecha instalación</span><input type="date" value={panel.installationDate} onChange={(e) => updateField('installationDate', e.target.value)} className="w-full rounded-lg border border-slate-300 p-2.5" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Última revisión</span><input readOnly value={panel.inspectionDate} className="w-full rounded-lg border border-slate-200 bg-slate-100 p-2.5 text-slate-600" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-slate-700">Estado</span><select value={panel.status} onChange={(e) => updateField('status', e.target.value as ElectricalPanel['status'])} className={`w-full rounded-lg border p-2.5 font-semibold ${panel.status === 'OPERATIVE' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}><option value="OPERATIVE">Operativo</option><option value="NOT_OPERATIVE">No operativo</option></select></label>
            </div>
          </section>
          <hr className="my-6" />
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Comprobaciones</h2><span className="text-sm text-slate-500">{panel.reviews.filter((r) => r.checked).length}/{panel.reviews.length}</span></div>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">{panel.reviews.map((review) => <label key={review.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50"><input type="checkbox" checked={review.checked} onChange={() => toggleReview(review.id)} className="mt-0.5 h-5 w-5 rounded border-slate-300" /><span className="text-sm font-medium text-slate-800">{review.name}</span></label>)}</div>
          </section>
          <hr className="my-6" />
          <section><h2 className="mb-4 text-xl font-bold text-slate-900">Observaciones</h2><textarea rows={8} value={panel.observations} onChange={(e) => updateField('observations', e.target.value)} className="w-full rounded-lg border border-slate-300 p-3" placeholder="Observaciones del cuadro o de la revisión" /></section>
        </div>

        <UnsavedChangesDialog
          open={dialogOpen}
          onCancel={cancelNavigation}
          onDiscard={discardNavigation}
          onSaveAndContinue={saveAndNavigate}
          saving={navigationSaving}
        />

        <footer className="py-3 text-center text-[10px] text-slate-400 print:hidden">
          Arias Suite
        </footer>
      </div>
    </div>
  )
}
