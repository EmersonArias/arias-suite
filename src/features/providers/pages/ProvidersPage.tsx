import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, Globe, Mail, Pencil, Phone, Plus, RefreshCw, Search, UserRound, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'
import IconButton from '../../../shared/components/buttons/IconButton'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { supabase } from '../../../lib/supabase'

type Provider = {
  id: string
  tenant_id: string
  legal_name: string
  trade_name: string | null
  tax_id: string | null
  address_line: string | null
  postal_code: string | null
  city: string | null
  province: string | null
  country: string
  phone_main: string | null
  email_main: string | null
  website_url: string | null
  portal_url: string | null
  emergency_phone: string | null
  notes: string | null
  active: boolean
}

type ProviderContact = {
  id: string
  full_name: string
  position: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  is_primary: boolean
  emergency_available: boolean
  notes: string | null
  active: boolean
}

type ProviderService = {
  id: string
  service_name: string
  description: string | null
  active: boolean
}

type ProviderForm = {
  legal_name: string
  trade_name: string
  tax_id: string
  address_line: string
  postal_code: string
  city: string
  province: string
  country: string
  phone_main: string
  email_main: string
  website_url: string
  portal_url: string
  emergency_phone: string
  contact_name: string
  contact_position: string
  contact_phone: string
  contact_mobile: string
  contact_email: string
  services: string
  notes: string
  active: boolean
}

const EMPTY_FORM: ProviderForm = {
  legal_name: '',
  trade_name: '',
  tax_id: '',
  address_line: '',
  postal_code: '',
  city: '',
  province: '',
  country: 'España',
  phone_main: '',
  email_main: '',
  website_url: '',
  portal_url: '',
  emergency_phone: '',
  contact_name: '',
  contact_position: '',
  contact_phone: '',
  contact_mobile: '',
  contact_email: '',
  services: '',
  notes: '',
  active: true,
}

export default function ProvidersPage() {
  const navigate = useNavigate()
  const [hotelId, setHotelId] = useState('')
  const [hotelName, setHotelName] = useState('')
  const [records, setRecords] = useState<Provider[]>([])
  const [contacts, setContacts] = useState<ProviderContact[]>([])
  const [services, setServices] = useState<ProviderService[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)

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

  async function loadRecords(targetHotelId = hotelId) {
    setLoading(true)
    setErrorMessage('')

    try {
      const currentHotelId = targetHotelId || (await loadContext())

      const relation = await supabase
        .from('provider_hotels')
        .select('provider_id')
        .eq('hotel_id', currentHotelId)
        .eq('active', true)

      if (relation.error) throw relation.error

      const ids = (relation.data ?? []).map((row) => row.provider_id)

      if (ids.length === 0) {
        setRecords([])
        setSelectedId('')
        setContacts([])
        setServices([])
        setLoading(false)
        return
      }

      const providerResult = await supabase
        .from('providers')
        .select('*')
        .in('id', ids)
        .order('legal_name', { ascending: true })

      if (providerResult.error) throw providerResult.error

      const loaded = (providerResult.data ?? []) as Provider[]
      setRecords(loaded)
      setSelectedId((current) =>
        loaded.some((item) => item.id === current) ? current : loaded[0]?.id ?? '',
      )
    } catch (error) {
      setRecords([])
      setSelectedId('')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se han podido cargar los proveedores.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadSelectedDetails(providerId: string) {
    if (!providerId) {
      setContacts([])
      setServices([])
      return
    }

    const [contactResult, serviceResult] = await Promise.all([
      supabase
        .from('provider_contacts')
        .select('*')
        .eq('provider_id', providerId)
        .eq('active', true)
        .order('is_primary', { ascending: false })
        .order('full_name', { ascending: true }),
      supabase
        .from('provider_services')
        .select('*')
        .eq('provider_id', providerId)
        .eq('active', true)
        .order('service_name', { ascending: true }),
    ])

    setContacts(contactResult.error ? [] : ((contactResult.data ?? []) as ProviderContact[]))
    setServices(serviceResult.error ? [] : ((serviceResult.data ?? []) as ProviderService[]))
  }

  useEffect(() => {
    void loadRecords()
  }, [])

  useEffect(() => {
    void loadSelectedDetails(selectedId)
  }, [selectedId])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')

    return records.filter((item) => {
      if (query) {
        const haystack = [
          item.legal_name,
          item.trade_name,
          item.tax_id,
          item.phone_main,
          item.email_main,
          item.city,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es')

        if (!haystack.includes(query)) return false
      }

      if (activeFilter === 'ACTIVE' && !item.active) return false
      if (activeFilter === 'INACTIVE' && item.active) return false

      return true
    })
  }, [records, search, activeFilter])

  const selected = records.find((item) => item.id === selectedId) ?? null

  const gridIds = useMemo(() => filteredRecords.map((item) => item.id), [filteredRecords])
  const { currentIndex, moveSelection, getGridProps, getRowProps } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId,
    onSelectedIdChange: setSelectedId,
    onOpen: (id) => {
      const provider = records.find((item) => item.id === id)
      if (provider) void openEdit(provider)
    },
    autoFocusFirst: true,
  })

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
    setErrorMessage('')
  }

  async function openEdit(provider: Provider) {
    setEditingId(provider.id)
    setErrorMessage('')

    const [contactResult, serviceResult] = await Promise.all([
      supabase
        .from('provider_contacts')
        .select('*')
        .eq('provider_id', provider.id)
        .eq('active', true)
        .order('is_primary', { ascending: false })
        .limit(1),
      supabase
        .from('provider_services')
        .select('*')
        .eq('provider_id', provider.id)
        .eq('active', true)
        .order('service_name', { ascending: true }),
    ])

    const primaryContact = ((contactResult.data ?? []) as ProviderContact[])[0]
    const providerServices = (serviceResult.data ?? []) as ProviderService[]

    setForm({
      legal_name: provider.legal_name,
      trade_name: provider.trade_name ?? '',
      tax_id: provider.tax_id ?? '',
      address_line: provider.address_line ?? '',
      postal_code: provider.postal_code ?? '',
      city: provider.city ?? '',
      province: provider.province ?? '',
      country: provider.country,
      phone_main: provider.phone_main ?? '',
      email_main: provider.email_main ?? '',
      website_url: provider.website_url ?? '',
      portal_url: provider.portal_url ?? '',
      emergency_phone: provider.emergency_phone ?? '',
      contact_name: primaryContact?.full_name ?? '',
      contact_position: primaryContact?.position ?? '',
      contact_phone: primaryContact?.phone ?? '',
      contact_mobile: primaryContact?.mobile ?? '',
      contact_email: primaryContact?.email ?? '',
      services: providerServices.map((item) => item.service_name).join('\n'),
      notes: provider.notes ?? '',
      active: provider.active,
    })
    setFormOpen(true)
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    if (!form.legal_name.trim()) {
      setErrorMessage('La razón social es obligatoria.')
      return
    }

    if (!hotelId) {
      setErrorMessage('No hay un hotel activo seleccionado.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      let providerId = editingId

      if (!editingId) {
        const result = await supabase.rpc('create_provider_for_hotel', {
          target_hotel_id: hotelId,
          provider_legal_name: form.legal_name,
          provider_trade_name: form.trade_name || null,
          provider_tax_id: form.tax_id || null,
          provider_address_line: form.address_line || null,
          provider_postal_code: form.postal_code || null,
          provider_city: form.city || null,
          provider_province: form.province || null,
          provider_country: form.country || 'España',
          provider_phone_main: form.phone_main || null,
          provider_email_main: form.email_main || null,
          provider_website_url: form.website_url || null,
          provider_portal_url: form.portal_url || null,
          provider_emergency_phone: form.emergency_phone || null,
          provider_notes: form.notes || null,
        })

        if (result.error || !result.data) throw result.error ?? new Error('No se ha creado el proveedor.')
        providerId = result.data as string
      } else {
        const result = await supabase
          .from('providers')
          .update({
            legal_name: form.legal_name.trim(),
            trade_name: form.trade_name.trim() || null,
            tax_id: form.tax_id.trim() || null,
            address_line: form.address_line.trim() || null,
            postal_code: form.postal_code.trim() || null,
            city: form.city.trim() || null,
            province: form.province.trim() || null,
            country: form.country.trim() || 'España',
            phone_main: form.phone_main.trim() || null,
            email_main: form.email_main.trim() || null,
            website_url: form.website_url.trim() || null,
            portal_url: form.portal_url.trim() || null,
            emergency_phone: form.emergency_phone.trim() || null,
            notes: form.notes.trim() || null,
            active: form.active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)

        if (result.error) throw result.error
      }

      if (!providerId) throw new Error('No se ha podido identificar el proveedor.')

      const existingContacts = await supabase
        .from('provider_contacts')
        .select('id')
        .eq('provider_id', providerId)
        .eq('is_primary', true)
        .eq('active', true)
        .limit(1)

      if (form.contact_name.trim()) {
        const contactPayload = {
          full_name: form.contact_name.trim(),
          position: form.contact_position.trim() || null,
          phone: form.contact_phone.trim() || null,
          mobile: form.contact_mobile.trim() || null,
          email: form.contact_email.trim() || null,
          is_primary: true,
          active: true,
        }

        if (existingContacts.data?.[0]?.id) {
          const contactUpdate = await supabase
            .from('provider_contacts')
            .update(contactPayload)
            .eq('id', existingContacts.data[0].id)

          if (contactUpdate.error) throw contactUpdate.error
        } else {
          const contactInsert = await supabase
            .from('provider_contacts')
            .insert({
              provider_id: providerId,
              ...contactPayload,
            })

          if (contactInsert.error) throw contactInsert.error
        }
      }

      const serviceNames = Array.from(
        new Set(
          form.services
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      )

      const existingServices = await supabase
        .from('provider_services')
        .select('id, service_name')
        .eq('provider_id', providerId)
        .eq('active', true)

      if (existingServices.error) throw existingServices.error

      const currentServices = (existingServices.data ?? []) as Array<{ id: string; service_name: string }>
      const desired = new Set(serviceNames.map((item) => item.toLocaleLowerCase('es')))
      const toDeactivate = currentServices.filter(
        (item) => !desired.has(item.service_name.toLocaleLowerCase('es')),
      )

      if (toDeactivate.length > 0) {
        const idsToDeactivate = toDeactivate.map((item) => item.id)
        const deactivation = await supabase
          .from('provider_services')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('id', idsToDeactivate)

        if (deactivation.error) throw deactivation.error
      }

      const missingServices = serviceNames.filter(
        (name) =>
          !currentServices.some(
            (item) => item.service_name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'),
          ),
      )

      if (missingServices.length > 0) {
        const insertion = await supabase
          .from('provider_services')
          .insert(
            missingServices.map((serviceName) => ({
              provider_id: providerId,
              service_name: serviceName,
              active: true,
            })),
          )

        if (insertion.error) throw insertion.error
      }

      setFormOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      setSelectedId(providerId)
      await loadRecords(hotelId)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se ha podido guardar el proveedor.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-5">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo onActivate={() => navigate('/')} className="h-9 w-auto shrink-0 object-contain sm:h-13" />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight text-slate-900 sm:text-3xl">Empresas y proveedores</h1>
                <p className="text-sm text-slate-500">
                  Empresas externas, contactos y servicios · {hotelName || 'Hotel activo'}
                </p>
              </div>
            </div>
            <div className="arias-grid-toolbar flex w-full flex-nowrap items-start justify-start gap-1 overflow-x-auto">
              <BackButton onBack={() => navigate('/')} />
              <HomeButton onHome={() => navigate('/')} />
              <ActionButton icon={Plus} label="Nuevo" onClick={openNew} />
              <IconButton
                icon={RefreshCw}
                label="Actualizar"
                title="Actualizar"
                onClick={() => void loadRecords(hotelId)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {(errorMessage || loading) && (
          <div className="mb-4 rounded-xl border bg-white p-3 text-sm shadow-sm">
            {loading
              ? 'Cargando proveedores…'
              : errorMessage.includes('relation') && errorMessage.includes('providers')
                ? 'El maestro de proveedores todavía no está habilitado en la base de datos. Ejecuta la migración 027_provider_master.sql.'
                : errorMessage}
          </div>
        )}

        <div className="mb-4 rounded-2xl bg-white p-3 shadow-lg sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Empresa, CIF, teléfono, ciudad…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 outline-none focus:border-blue-500"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
              <select
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Activos</option>
                <option value="INACTIVE">Inactivos</option>
              </select>
            </label>

            <div className="flex items-end justify-start gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2.5 py-1.5">
                {filteredRecords.length} / {records.length} empresas
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="rounded-2xl bg-white shadow-lg">
            <div className="border-b px-4 py-3 text-sm font-semibold text-slate-800">
              Empresas
            </div>
            <div className="p-2 md:hidden">
              <div className="max-h-[calc(100vh-390px)] space-y-2 overflow-auto">
                {filteredRecords.map((item) => {
                  const isSelected = item.id === selectedId
                  const primaryContact = contacts.find((contact) => contact.is_primary)?.full_name ?? '—'
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
                          <div className="text-sm font-semibold text-slate-800">{item.trade_name || item.legal_name}</div>
                          {item.trade_name && <div className="text-[10px] text-slate-500">{item.legal_name}</div>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          item.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        <div><span className="font-semibold">Contacto:</span> {primaryContact}</div>
                        <div><span className="font-semibold">Teléfono:</span> {item.phone_main || '—'}</div>
                        <div className="col-span-2"><span className="font-semibold">Ciudad:</span> {item.city || '—'}</div>
                      </div>
                    </button>
                  )
                })}
                {!loading && filteredRecords.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    No hay proveedores registrados.
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:block">
              <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
                <GridViewport className="max-h-[calc(100vh-360px)] min-h-[320px]">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Contacto</th>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Servicios</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((item) => {
                    const isSelected = item.id === selectedId
                    return (
                      <tr
                        key={item.id}
                        {...getRowProps(item.id)}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer border-b transition outline-none ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{item.trade_name || item.legal_name}</div>
                          {item.trade_name && <div className="text-[11px] text-slate-500">{item.legal_name}</div>}
                          {item.tax_id && <div className="text-[10px] text-slate-400">{item.tax_id}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {contacts.find((contact) => contact.is_primary)?.full_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.phone_main || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {services.length > 0 && isSelected
                            ? services.slice(0, 2).map((service) => service.service_name).join(', ')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {item.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void openEdit(item)
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            title="Modificar"
                            aria-label={`Modificar ${item.trade_name || item.legal_name}`}
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
                        <div className="text-sm font-semibold text-slate-600">No hay proveedores para mostrar.</div>
                        <div className="mt-1 text-xs text-slate-400">
                          Crea el primer proveedor real cuando ejecutes la migración 027.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
                </GridViewport>
                <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                  <span className="text-[11px] text-slate-500">
                    {filteredRecords.length === 0 ? 'Sin proveedores' : `${currentIndex + 1} / ${filteredRecords.length}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <IconButton icon={ChevronUp} label="Proveedor anterior" title="Anterior" onClick={() => moveSelection(currentIndex - 1)} disabled={filteredRecords.length === 0 || currentIndex === 0} className="h-9 w-9" />
                    <IconButton icon={ChevronDown} label="Proveedor siguiente" title="Siguiente" onClick={() => moveSelection(currentIndex + 1)} disabled={filteredRecords.length === 0 || currentIndex === filteredRecords.length - 1} className="h-9 w-9" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl bg-white shadow-lg">
            <div className="border-b px-4 py-3 text-sm font-semibold text-slate-800">
              Ficha del proveedor
            </div>
            {selected ? (
              <div className="space-y-4 p-4 text-sm">
                <div>
                  <div className="text-lg font-semibold text-slate-900">{selected.trade_name || selected.legal_name}</div>
                  {selected.trade_name && <div className="text-xs text-slate-500">{selected.legal_name}</div>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      selected.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {selected.active ? 'Activo' : 'Inactivo'}
                    </span>
                    {selected.tax_id && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">{selected.tax_id}</span>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 text-slate-600">
                  {selected.phone_main && (
                    <a href={`tel:${selected.phone_main}`} className="flex items-center gap-2 hover:text-slate-900">
                      <Phone size={15} /> {selected.phone_main}
                    </a>
                  )}
                  {selected.emergency_phone && (
                    <a href={`tel:${selected.emergency_phone}`} className="flex items-center gap-2 hover:text-slate-900">
                      <Phone size={15} /> Urgencias: {selected.emergency_phone}
                    </a>
                  )}
                  {selected.email_main && (
                    <a href={`mailto:${selected.email_main}`} className="flex items-center gap-2 hover:text-slate-900">
                      <Mail size={15} /> {selected.email_main}
                    </a>
                  )}
                  {selected.website_url && (
                    <a href={selected.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-slate-900">
                      <Globe size={15} /> Web
                    </a>
                  )}
                  {selected.portal_url && (
                    <a href={selected.portal_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-slate-900">
                      <Globe size={15} /> Portal de cliente
                    </a>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto principal</div>
                  {contacts[0] ? (
                    <div className="space-y-1 text-slate-700">
                      <div className="flex items-center gap-2 font-semibold"><UserRound size={15} /> {contacts[0].full_name}</div>
                      {contacts[0].position && <div className="text-xs text-slate-500">{contacts[0].position}</div>}
                      {contacts[0].mobile && <div className="text-xs text-slate-600">Móvil: {contacts[0].mobile}</div>}
                      {contacts[0].phone && <div className="text-xs text-slate-600">Tel.: {contacts[0].phone}</div>}
                      {contacts[0].email && <div className="text-xs text-slate-600">{contacts[0].email}</div>}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Sin contacto registrado.</div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Wrench size={14} /> Servicios
                  </div>
                  {services.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {services.map((service) => (
                        <span key={service.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                          {service.service_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Sin servicios registrados.</div>
                  )}
                </div>

                {(selected.address_line || selected.postal_code || selected.city || selected.province || selected.country) && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dirección</div>
                    <div className="text-xs leading-5 text-slate-600">
                      {selected.address_line && <div>{selected.address_line}</div>}
                      <div>{[selected.postal_code, selected.city, selected.province].filter(Boolean).join(' · ')}</div>
                      {selected.country && <div>{selected.country}</div>}
                    </div>
                  </div>
                )}

                {selected.notes && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Observaciones</div>
                    <div className="whitespace-pre-wrap text-xs leading-5 text-slate-600">{selected.notes}</div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void openEdit(selected)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Pencil size={14} />
                  Modificar ficha
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400">Selecciona un proveedor.</div>
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
                  {editingId ? 'Modificar proveedor' : 'Nuevo proveedor'}
                </div>
                <div className="text-xs text-slate-500">Maestro de empresas externas</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!saving) setFormOpen(false)
                }}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={saveProvider} className="space-y-5 p-5">
              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Empresa</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">Razón social *</span>
                    <input value={form.legal_name} onChange={(e) => setForm((v) => ({ ...v, legal_name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Nombre comercial</span>
                    <input value={form.trade_name} onChange={(e) => setForm((v) => ({ ...v, trade_name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">CIF / NIF</span>
                    <input value={form.tax_id} onChange={(e) => setForm((v) => ({ ...v, tax_id: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Teléfono</span>
                    <input value={form.phone_main} onChange={(e) => setForm((v) => ({ ...v, phone_main: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Teléfono urgencias</span>
                    <input value={form.emergency_phone} onChange={(e) => setForm((v) => ({ ...v, emergency_phone: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Email</span>
                    <input type="email" value={form.email_main} onChange={(e) => setForm((v) => ({ ...v, email_main: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Web</span>
                    <input value={form.website_url} onChange={(e) => setForm((v) => ({ ...v, website_url: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Portal</span>
                    <input value={form.portal_url} onChange={(e) => setForm((v) => ({ ...v, portal_url: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Dirección</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">Dirección</span>
                    <input value={form.address_line} onChange={(e) => setForm((v) => ({ ...v, address_line: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Código postal</span>
                    <input value={form.postal_code} onChange={(e) => setForm((v) => ({ ...v, postal_code: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Ciudad</span>
                    <input value={form.city} onChange={(e) => setForm((v) => ({ ...v, city: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Provincia</span>
                    <input value={form.province} onChange={(e) => setForm((v) => ({ ...v, province: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">País</span>
                    <input value={form.country} onChange={(e) => setForm((v) => ({ ...v, country: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto principal</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">Nombre</span>
                    <input value={form.contact_name} onChange={(e) => setForm((v) => ({ ...v, contact_name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Cargo</span>
                    <input value={form.contact_position} onChange={(e) => setForm((v) => ({ ...v, contact_position: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Teléfono</span>
                    <input value={form.contact_phone} onChange={(e) => setForm((v) => ({ ...v, contact_phone: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Móvil</span>
                    <input value={form.contact_mobile} onChange={(e) => setForm((v) => ({ ...v, contact_mobile: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Email</span>
                    <input type="email" value={form.contact_email} onChange={(e) => setForm((v) => ({ ...v, contact_email: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Servicios</div>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Un servicio por línea</span>
                  <textarea
                    value={form.services}
                    onChange={(e) => setForm((v) => ({ ...v, services: e.target.value }))}
                    rows={4}
                    placeholder={'Ascensores\nPCI\nClimatización'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </section>

              <section>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Observaciones</div>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </section>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((v) => ({ ...v, active: e.target.checked }))}
                />
                Proveedor activo
              </label>

              <div className="flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Guardando…' : 'Guardar proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
