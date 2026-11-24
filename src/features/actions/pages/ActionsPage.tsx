import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import { supabase } from '../../../lib/supabase'

type ActionType = 'REPAIR' | 'EXTERNAL_INTERVENTION' | 'LEGIONELLA' | 'PROJECT' | 'OTHER'

type Action = {
  id: string
  code: string | null
  title: string
  action_type: ActionType
  description: string | null
  occurred_at: string
  provider_id: string | null
  performer_name: string | null
  external_reference: string | null
  result: string | null
  cost_amount: number | null
  currency: string
  notes: string | null
  active: boolean
}

type ProviderOption = {
  id: string
  name: string
}

type ActionForm = {
  title: string
  action_type: ActionType
  occurred_at: string
  provider_id: string
  performer_name: string
  external_reference: string
  description: string
  result: string
  cost_amount: string
  notes: string
  active: boolean
}

const EMPTY_FORM: ActionForm = {
  title: '',
  action_type: 'REPAIR',
  occurred_at: new Date().toISOString().slice(0, 16),
  provider_id: '',
  performer_name: '',
  external_reference: '',
  description: '',
  result: '',
  cost_amount: '',
  notes: '',
  active: true,
}

const ACTION_LABELS: Record<ActionType, string> = {
  REPAIR: 'Reparación relevante',
  EXTERNAL_INTERVENTION: 'Intervención externa',
  LEGIONELLA: 'Intervención de Legionella',
  PROJECT: 'Obra / modificación',
  OTHER: 'Otra intervención',
}

export default function ActionsPage() {
  const navigate = useNavigate()
  const [hotelId, setHotelId] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [records, setRecords] = useState<Action[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | ActionType>('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ActionForm>(EMPTY_FORM)

  async function loadContext() {
    const assignment = await supabase
      .from('user_hotel_roles')
      .select('hotel_id')
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (assignment.error || !assignment.data?.hotel_id) {
      throw new Error('No se ha podido determinar el hotel activo.')
    }

    const hotel = await supabase
      .from('hotels')
      .select('id, name')
      .eq('id', assignment.data.hotel_id)
      .eq('active', true)
      .maybeSingle()

    if (hotel.error || !hotel.data?.id) {
      throw new Error('No se ha podido cargar el hotel activo.')
    }

    setHotelId(hotel.data.id)
    setHotelName(hotel.data.name)
    return hotel.data.id
  }

  async function loadData(targetHotelId = hotelId) {
    setLoading(true)
    setErrorMessage('')

    try {
      const currentHotelId = targetHotelId || (await loadContext())

      const actionResult = await supabase
        .from('maintenance_actions')
        .select('*')
        .eq('hotel_id', currentHotelId)
        .order('occurred_at', { ascending: false })

      if (actionResult.error) throw actionResult.error

      const providerRelation = await supabase
        .from('provider_hotels')
        .select('provider_id')
        .eq('hotel_id', currentHotelId)
        .eq('active', true)

      if (providerRelation.error) throw providerRelation.error

      const providerIds = (providerRelation.data ?? []).map((row) => row.provider_id)
      const providerResult = providerIds.length
        ? await supabase
            .from('providers')
            .select('id, legal_name, trade_name')
            .in('id', providerIds)
            .eq('active', true)
            .order('legal_name', { ascending: true })
        : { data: [], error: null }

      if (providerResult.error) throw providerResult.error

      setRecords((actionResult.data ?? []) as Action[])
      setProviders(
        (providerResult.data ?? []).map((provider) => ({
          id: provider.id,
          name: provider.trade_name || provider.legal_name,
        })),
      )
      setSelectedId((current) =>
        (actionResult.data ?? []).some((item) => item.id === current)
          ? current
          : (actionResult.data?.[0]?.id ?? ''),
      )
    } catch (error) {
      setRecords([])
      setSelectedId('')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se han podido cargar las intervenciones.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')

    return records.filter((item) => {
      if (typeFilter !== 'ALL' && item.action_type !== typeFilter) return false
      if (!query) return true

      const haystack = [
        item.code,
        item.title,
        item.description,
        item.performer_name,
        item.external_reference,
        item.result,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es')

      return haystack.includes(query)
    })
  }, [records, search, typeFilter])

  const selected = records.find((item) => item.id === selectedId) ?? null

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
    setErrorMessage('')
  }

  function openEdit(item: Action) {
    setEditingId(item.id)
    setForm({
      title: item.title,
      action_type: item.action_type,
      occurred_at: new Date(item.occurred_at).toISOString().slice(0, 16),
      provider_id: item.provider_id ?? '',
      performer_name: item.performer_name ?? '',
      external_reference: item.external_reference ?? '',
      description: item.description ?? '',
      result: item.result ?? '',
      cost_amount: item.cost_amount == null ? '' : String(item.cost_amount),
      notes: item.notes ?? '',
      active: item.active,
    })
    setFormOpen(true)
    setErrorMessage('')
  }

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    if (!form.title.trim()) {
      setErrorMessage('El título de la intervención es obligatorio.')
      return
    }

    if (!hotelId) {
      setErrorMessage('No hay un hotel activo seleccionado.')
      return
    }

    const parsedCost = form.cost_amount.trim() ? Number(form.cost_amount.replace(',', '.')) : null
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setErrorMessage('El coste debe ser un número válido igual o superior a 0.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const payload = {
        title: form.title.trim(),
        action_type: form.action_type,
        occurred_at: new Date(form.occurred_at).toISOString(),
        provider_id: form.provider_id || null,
        performer_name: form.performer_name.trim() || null,
        external_reference: form.external_reference.trim() || null,
        description: form.description.trim() || null,
        result: form.result.trim() || null,
        cost_amount: parsedCost,
        notes: form.notes.trim() || null,
        active: form.active,
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        const result = await supabase
          .from('maintenance_actions')
          .update(payload)
          .eq('id', editingId)

        if (result.error) throw result.error
      } else {
        const result = await supabase
          .from('maintenance_actions')
          .insert({
            hotel_id: hotelId,
            ...payload,
            created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          })
          .select('id')
          .single()

        if (result.error || !result.data?.id) {
          throw result.error ?? new Error('No se ha podido crear la intervención.')
        }

        setSelectedId(result.data.id)
      }

      setFormOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await loadData(hotelId)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se ha podido guardar la intervención.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex flex-col gap-2.5 sm:gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-13" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-3xl">Intervenciones</h1>
                <p className="text-sm text-slate-500">
                  Intervenciones relevantes, reparaciones y trabajos especiales · {hotelName || 'Hotel activo'}
                </p>
              </div>
            </div>

            <div className="arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto sm:w-auto">
              <BackButton onBack={() => navigate('/maintenance')} />
              <HomeButton onHome={() => navigate('/')} />
              <ActionButton
                icon={Plus}
                label="Nueva"
                onClick={openNew}
              />
              <IconButton
                icon={RefreshCw}
                label="Actualizar"
                title="Actualizar"
                onClick={() => void loadData(hotelId)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {(errorMessage || loading) && (
          <div className="mb-4 rounded-xl border bg-white p-3 text-sm shadow-sm">
            {loading
              ? 'Cargando intervenciones…'
              : errorMessage.includes('relation') && errorMessage.includes('maintenance_actions')
                ? 'El registro de intervenciones todavía no está habilitado en la base de datos. Ejecuta la migración 028_maintenance_actions.sql.'
                : errorMessage}
          </div>
        )}

        <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Título, descripción, empresa, referencia…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 outline-none focus:border-blue-500"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as 'ALL' | ActionType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="ALL">Todas</option>
                {Object.entries(ACTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="rounded-2xl bg-white shadow-lg">
            <div className="border-b px-4 py-3 text-sm font-semibold text-slate-800">
              Registro histórico
            </div>
            <div className="p-2 md:hidden">
              <div className="max-h-[calc(100vh-390px)] space-y-2 overflow-auto">
                {filteredRecords.map((item) => {
                  const providerName = providers.find((provider) => provider.id === item.provider_id)?.name ?? '—'
                  const isSelected = item.id === selectedId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-xl border p-3 text-left ${
                        isSelected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {new Date(item.occurred_at).toLocaleDateString('es-ES')} · {ACTION_LABELS[item.action_type]}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          {item.cost_amount == null ? '—' : `${item.cost_amount.toFixed(2)} €`}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        <div><span className="font-semibold">Empresa:</span> {providerName}</div>
                        <div><span className="font-semibold">Estado:</span> {item.active ? 'Activa' : 'Inactiva'}</div>
                        {item.external_reference && <div className="col-span-2"><span className="font-semibold">Referencia:</span> {item.external_reference}</div>}
                      </div>
                    </button>
                  )
                })}
                {!loading && filteredRecords.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    No hay intervenciones registradas.
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:block max-h-[calc(100vh-360px)] min-h-[320px] overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Intervención</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Coste</th>
                    <th className="px-4 py-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((item) => {
                    const providerName = providers.find((provider) => provider.id === item.provider_id)?.name ?? '—'
                    const isSelected = item.id === selectedId

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer border-b transition ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {new Date(item.occurred_at).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{item.title}</div>
                          {item.external_reference && (
                            <div className="text-[10px] text-slate-400">{item.external_reference}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {ACTION_LABELS[item.action_type]}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{providerName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {item.cost_amount == null ? '—' : `${item.cost_amount.toFixed(2)} €`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openEdit(item)
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            title="Modificar"
                            aria-label={`Modificar ${item.title}`}
                          >
                            <Pencil size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {!loading && filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <div className="text-sm font-semibold text-slate-600">No hay intervenciones registradas.</div>
                        <div className="mt-1 text-xs text-slate-400">
                          Las intervenciones quedan como histórico técnico relevante y no sustituyen al PAM ni a los tickets.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="rounded-2xl bg-white shadow-lg">
            <div className="border-b px-4 py-3 text-sm font-semibold text-slate-800">Ficha de intervención</div>
            {selected ? (
              <div className="space-y-4 p-4">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{selected.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {new Date(selected.occurred_at).toLocaleString('es-ES')}
                  </div>
                </div>
                <div className="grid gap-2 text-sm text-slate-600">
                  <div><span className="font-semibold">Tipo:</span> {ACTION_LABELS[selected.action_type]}</div>
                  <div>
                    <span className="font-semibold">Empresa:</span>{' '}
                    {providers.find((provider) => provider.id === selected.provider_id)?.name ?? '—'}
                  </div>
                  {selected.performer_name && <div><span className="font-semibold">Realizó:</span> {selected.performer_name}</div>}
                  {selected.external_reference && <div><span className="font-semibold">Referencia:</span> {selected.external_reference}</div>}
                  {selected.result && <div><span className="font-semibold">Resultado:</span> {selected.result}</div>}
                  {selected.cost_amount != null && <div><span className="font-semibold">Coste:</span> {selected.cost_amount.toFixed(2)} €</div>}
                </div>
                {selected.description && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Descripción</div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.description}</div>
                  </div>
                )}
                {selected.notes && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Observaciones</div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.notes}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(selected)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Pencil size={14} />
                  Modificar intervención
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">Selecciona una intervención.</div>
            )}
          </aside>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3">
          <div className="max-h-[calc(100vh-24px)] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">
                  {editingId ? 'Modificar intervención' : 'Nueva intervención'}
                </div>
                <div className="text-xs text-slate-500">Registro histórico de intervenciones relevantes</div>
              </div>
              <button
                type="button"
                onClick={() => !saving && setFormOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={saveAction} className="space-y-5 p-5">
              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Intervención</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">Título *</span>
                    <input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Tipo</span>
                    <select value={form.action_type} onChange={(e) => setForm((v) => ({ ...v, action_type: e.target.value as ActionType }))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                      {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Fecha y hora</span>
                    <input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm((v) => ({ ...v, occurred_at: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Proveedor</span>
                    <select value={form.provider_id} onChange={(e) => setForm((v) => ({ ...v, provider_id: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2">
                      <option value="">Sin proveedor</option>
                      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Referencia externa</span>
                    <input value={form.external_reference} onChange={(e) => setForm((v) => ({ ...v, external_reference: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Persona / técnico</span>
                    <input value={form.performer_name} onChange={(e) => setForm((v) => ({ ...v, performer_name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Coste (€)</span>
                    <input inputMode="decimal" value={form.cost_amount} onChange={(e) => setForm((v) => ({ ...v, cost_amount: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Resultado</span>
                    <input value={form.result} onChange={(e) => setForm((v) => ({ ...v, result: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                </div>
              </section>

              <section>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Descripción</span>
                  <textarea rows={5} value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              </section>

              <section>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Observaciones</span>
                  <textarea rows={3} value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              </section>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((v) => ({ ...v, active: e.target.checked }))} />
                Intervención activa en el registro
              </label>

              <div className="flex justify-end gap-2 border-t pt-4">
                <button type="button" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? 'Guardando…' : 'Guardar intervención'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
