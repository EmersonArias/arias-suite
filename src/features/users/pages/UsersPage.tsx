import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, Search, UserPlus, UsersRound, Plus, Trash2, Pencil, Power, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../auth/context/AuthProvider'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import IconButton from '../../../shared/components/buttons/IconButton'
import GridViewport from '../../../shared/components/grid/GridViewport'
import { useGridKeyboardNavigation } from '../../../shared/components/grid/useGridKeyboardNavigation'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

type Profile = {
  id: string
  full_name: string | null
  email: string | null
  login_identifier: string
  active: boolean
  account_status: 'PENDING_INVITATION' | 'ACTIVE' | 'INACTIVE'
  created_at?: string
}

type Hotel = { id: string; name: string; code: string; active: boolean }
type Role = { id: string; name: string; code: string; active: boolean }
type UserHotelRole = {
  user_id: string
  hotel_id: string
  role_id: string
  active: boolean
}

type Assignment = {
  hotelId: string
  roleId: string
  active: boolean
  hotelName: string
  hotelCode: string
  roleName: string
  roleCode: string
}

type UserRow = Profile & { assignments: Assignment[] }

type DraftAssignment = {
  hotelId: string
  roleId: string
}

type UserForm = {
  fullName: string
  email: string
  loginIdentifier: string
  active: boolean
  assignments: DraftAssignment[]
}

const emptyForm: UserForm = {
  fullName: '',
  email: '',
  loginIdentifier: '',
  active: true,
  assignments: [],
}

export default function UsersPage() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [hotels, setHotels] = useState<Hotel[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [userHotelRoles, setUserHotelRoles] = useState<UserHotelRole[]>([])
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [resendingInvitation, setResendingInvitation] = useState(false)
  const [generatingAccessCode, setGeneratingAccessCode] = useState(false)
  const [accessCodeNotice, setAccessCodeNotice] = useState<{
    code: string
    userName: string
    identifier: string
  } | null>(null)

  async function checkPlatformAccess() {
    if (!session?.user.id) {
      setAuthorized(false)
      return false
    }

    const { data, error: accessError } = await supabase
      .from('platform_admins')
      .select('active')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (accessError) {
      setAuthorized(false)
      setError('No se ha podido verificar el acceso.')
      return false
    }

    const allowed = data?.active === true
    setAuthorized(allowed)
    return allowed
  }

  async function loadData() {
    setLoading(true)
    setError('')

    const allowed = await checkPlatformAccess()
    if (!allowed) {
      setLoading(false)
      return
    }

    const [
      profilesResult,
      hotelsResult,
      rolesResult,
      assignmentsResult,
      platformAdminsResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, login_identifier, active, account_status, created_at')
        .order('full_name', { ascending: true }),
      supabase
        .from('hotels')
        .select('id, name, code, active')
        .order('name', { ascending: true }),
      supabase
        .from('roles')
        .select('id, name, code, active')
        .order('name', { ascending: true }),
      supabase
        .from('user_hotel_roles')
        .select('user_id, hotel_id, role_id, active'),
      supabase
        .from('platform_admins')
        .select('user_id')
        .eq('active', true),
    ])

    const firstError =
      profilesResult.error ??
      hotelsResult.error ??
      rolesResult.error ??
      assignmentsResult.error ??
      platformAdminsResult.error

    if (firstError) {
      setError('No se han podido cargar los usuarios.')
      setLoading(false)
      return
    }

    const platformAdminIds = new Set(
      (platformAdminsResult.data ?? []).map((item) => item.user_id),
    )

    setProfiles(
      (profilesResult.data ?? []).filter(
        (profile) => !platformAdminIds.has(profile.id),
      ),
    )
    setHotels(hotelsResult.data ?? [])
    setRoles(rolesResult.data ?? [])
    setUserHotelRoles(assignmentsResult.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [session?.user.id])

  const rows = useMemo<UserRow[]>(() => {
    const hotelById = new Map(hotels.map((hotel) => [hotel.id, hotel]))
    const roleById = new Map(roles.map((role) => [role.id, role]))

    return profiles.map((profile) => ({
      ...profile,
      assignments: userHotelRoles
        .filter((assignment) => assignment.user_id === profile.id)
        .map((assignment) => {
          const hotel = hotelById.get(assignment.hotel_id)
          const role = roleById.get(assignment.role_id)

          return {
            hotelId: assignment.hotel_id,
            roleId: assignment.role_id,
            active: assignment.active,
            hotelName: hotel?.name ?? 'Hotel no disponible',
            hotelCode: hotel?.code ?? '—',
            roleName: role?.name ?? 'Rol no disponible',
            roleCode: role?.code ?? '—',
          }
        }),
    }))
  }, [hotels, profiles, roles, userHotelRoles])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es')
    if (!query) return rows

    return rows.filter((row) => {
      const haystack = [
        row.full_name ?? '',
        row.email ?? '',
        row.login_identifier,
        ...row.assignments.flatMap((assignment) => [
          assignment.hotelName,
          assignment.hotelCode,
          assignment.roleName,
          assignment.roleCode,
        ]),
      ]
        .join(' ')
        .toLocaleLowerCase('es')

      return haystack.includes(query)
    })
  }, [rows, search])

  const selectedUser = rows.find((row) => row.id === selectedUserId) ?? null

  const gridIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows])
  const { currentIndex, moveSelection, getGridProps, getRowProps } = useGridKeyboardNavigation({
    ids: gridIds,
    selectedId: selectedUserId,
    onSelectedIdChange: setSelectedUserId,
    autoFocusFirst: true,
  })
  const isOwnAccount = selectedUser?.id === session?.user.id

  function openCreate() {
    const firstHotel = hotels.find((hotel) => hotel.active)
    const firstRole = roles.find((role) => role.active)

    setForm({
      ...emptyForm,
      loginIdentifier: '',
      assignments:
        firstHotel && firstRole ? [{ hotelId: firstHotel.id, roleId: firstRole.id }] : [],
    })
    setFormError('')
    setFormMode('create')
  }

  function openEdit(activeOverride?: boolean) {
    if (!selectedUser || isOwnAccount) return

    setForm({
      fullName: selectedUser.full_name ?? '',
      email: selectedUser.email ?? '',
      loginIdentifier: selectedUser.login_identifier,
      active: activeOverride ?? selectedUser.active,
      assignments: selectedUser.assignments.map((assignment) => ({
        hotelId: assignment.hotelId,
        roleId: assignment.roleId,
      })),
    })
    setFormError('')
    setFormMode('edit')
  }

  function addAssignment() {
    const availableHotel = hotels.find(
      (hotel) =>
        hotel.active &&
        !form.assignments.some((assignment) => assignment.hotelId === hotel.id),
    )
    const availableRole = roles.find((role) => role.active)

    if (!availableHotel || !availableRole) return

    setForm((current) => ({
      ...current,
      assignments: [
        ...current.assignments,
        { hotelId: availableHotel.id, roleId: availableRole.id },
      ],
    }))
  }

  function removeAssignment(index: number) {
    setForm((current) => ({
      ...current,
      assignments: current.assignments.filter((_, currentIndex) => currentIndex !== index),
    }))
  }

  function updateAssignment(index: number, field: keyof DraftAssignment, value: string) {
    setForm((current) => ({
      ...current,
      assignments: current.assignments.map((assignment, currentIndex) =>
        currentIndex === index ? { ...assignment, [field]: value } : assignment,
      ),
    }))
  }

  function getAccountStatusLabel(status: Profile['account_status']) {
    if (status === 'PENDING_INVITATION') return 'Pendiente de activación'
    if (status === 'INACTIVE') return 'Inactivo'
    return 'Activo'
  }

  function getAccountStatusClass(status: Profile['account_status']) {
    if (status === 'PENDING_INVITATION') return 'text-amber-700'
    if (status === 'INACTIVE') return 'text-slate-400'
    return 'text-slate-700'
  }

  async function generateAccessCode() {
    if (!selectedUser || isOwnAccount || selectedUser.email) return
    if (generatingAccessCode) return

    setGeneratingAccessCode(true)
    setError('')

    const { data, error: functionError } = await supabase.functions.invoke(
      'admin-generate-access-code',
      { body: { user_id: selectedUser.id } },
    )

    if (functionError || !data?.activation_code) {
      setError(functionError?.message ?? 'No se ha podido generar el código de acceso.')
      setGeneratingAccessCode(false)
      return
    }

    setAccessCodeNotice({
      code: data.activation_code,
      userName: data.full_name ?? selectedUser.full_name ?? 'Usuario',
      identifier: data.login_identifier ?? selectedUser.login_identifier,
    })
    setGeneratingAccessCode(false)
  }

  async function resendInvitation() {
    if (!selectedUser || isOwnAccount || selectedUser.account_status !== 'PENDING_INVITATION') return
    if (resendingInvitation) return

    setResendingInvitation(true)
    setError('')

    const { data, error: functionError } = await supabase.functions.invoke(
      'admin-resend-invitation',
      { body: { user_id: selectedUser.id } },
    )

    if (functionError || !data?.id) {
      setError(
        functionError?.message ??
          'No se ha podido reenviar la invitación.',
      )
      setResendingInvitation(false)
      return
    }

    setResendingInvitation(false)
    await loadData()
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (formBusy) return

    setFormBusy(true)
    setFormError('')

    const normalizedEmail = form.email.trim().toLowerCase()
    const normalizedIdentifier = form.loginIdentifier.trim().toUpperCase()

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFormError('Introduce un correo electrónico válido o déjalo vacío.')
      setFormBusy(false)
      return
    }

    if (!/^[A-Z0-9._-]{3,64}$/.test(normalizedIdentifier)) {
      setFormError('El identificador debe tener entre 3 y 64 caracteres y solo puede contener letras, números, punto, guion o guion bajo.')
      setFormBusy(false)
      return
    }

    if (form.assignments.length === 0) {
      setFormError('Debes asignar al menos un hotel y un rol.')
      setFormBusy(false)
      return
    }

    const hotelIds = form.assignments.map((assignment) => assignment.hotelId)
    if (new Set(hotelIds).size !== hotelIds.length) {
      setFormError('Un usuario solo puede tener un rol por hotel.')
      setFormBusy(false)
      return
    }

    const functionName = formMode === 'create' ? 'admin-create-user' : 'admin-update-user'
    const body =
      formMode === 'create'
        ? {
            full_name: form.fullName,
            email: normalizedEmail || undefined,
            login_identifier: normalizedIdentifier,
            assignments: form.assignments.map((assignment) => ({
              hotel_id: assignment.hotelId,
              role_id: assignment.roleId,
            })),
          }
        : {
            user_id: selectedUser?.id,
            full_name: form.fullName,
            email: normalizedEmail || undefined,
            login_identifier: normalizedIdentifier,
            active: form.active,
            assignments: form.assignments.map((assignment) => ({
              hotel_id: assignment.hotelId,
              role_id: assignment.roleId,
            })),
          }

    const { data, error: functionError } = await supabase.functions.invoke(functionName, {
      body,
    })

    if (functionError || !data?.id) {
      setFormError(
        functionError?.message ??
          'No se ha podido guardar el usuario. Comprueba que el servicio de administración esté disponible.',
      )
      setFormBusy(false)
      return
    }

    const savedUserId = data.id as string
    if (data.activation_code) {
      setAccessCodeNotice({
        code: data.activation_code,
        userName: data.full_name ?? form.fullName,
        identifier: data.login_identifier ?? normalizedIdentifier,
      })
    }

    setFormMode(null)
    setForm(emptyForm)
    await loadData()
    setSelectedUserId(savedUserId)
    setFormBusy(false)
  }

  if (authorized === false && !loading) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <BrandLogo
              label="Inicio Arias Suite"
              onActivate={() => navigate('/')}
              className="mx-auto h-16 w-auto object-contain"
            />
            <h1 className="mt-6 text-xl font-semibold">Acceso no disponible</h1>
            <p className="mt-2 text-sm text-slate-500">
              Esta sección requiere permisos administrativos.
            </p>
            <div className="mt-6">
              <ActionButton label="Volver a Inicio" onClick={() => navigate('/')} />
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-3 flex items-center justify-between px-1 sm:mb-4">
          <BrandLogo
            label="Inicio Arias Suite"
            onActivate={() => navigate('/')}
            className="h-14 w-auto object-contain sm:h-16"
          />
          <div className="flex items-center gap-2">
            <BackButton onBack={() => navigate(-1)} />
            <HomeButton onHome={() => navigate('/')} />
          </div>
        </div>

        {accessCodeNotice && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Código de acceso para {accessCodeNotice.userName}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Identificador: {accessCodeNotice.identifier}. Comunica este código al trabajador por un medio seguro. Caduca en 24 horas.
                </p>
                <code className="mt-2 inline-block rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm tracking-[0.18em] text-slate-800">
                  {accessCodeNotice.code}
                </code>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(accessCodeNotice.code)
                  }}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-amber-50"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => setAccessCodeNotice(null)}
                  className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Ocultar
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <UsersRound size={21} className="text-slate-500" />
                <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Usuarios y accesos a hoteles de Arias Suite.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[240px]">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar usuario..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>

              <ActionButton icon={UserPlus} label="Nuevo usuario" onClick={openCreate} />
            </div>
          </div>
        </header>

        <main className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando usuarios…</div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-slate-600">
                {error}
                <div className="mt-4">
                  <ActionButton label="Reintentar" onClick={() => void loadData()} />
                </div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No se encontraron usuarios.
              </div>
            ) : (
              <div>
                <div {...getGridProps()} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200">
                  <GridViewport className="max-h-[calc(100vh-360px)] min-h-[320px]">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Usuario</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold">Hoteles</th>
                      <th className="px-4 py-3 font-semibold">Rol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const activeAssignments = row.assignments.filter(
                        (assignment) => assignment.active,
                      )

                      return (
                        <tr
                          key={row.id}
                          {...getRowProps(row.id)}
                          onClick={() => setSelectedUserId(row.id)}
                          className={[
                            'cursor-pointer transition hover:bg-slate-50',
                            selectedUserId === row.id ? 'bg-blue-50/60' : '',
                          ].join(' ')}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">
                              {row.full_name || 'Sin nombre'}
                            </div>
                            <div className="mt-0.5 text-xs font-mono text-slate-400">
                              {row.login_identifier}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {row.email || 'Sin correo individual'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={getAccountStatusClass(row.account_status)}>
                              {getAccountStatusLabel(row.account_status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{activeAssignments.length}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {activeAssignments.length === 0
                              ? 'Sin asignación'
                              : activeAssignments.length === 1
                                ? activeAssignments[0].roleName
                                : activeAssignments.length + ' roles'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                  </GridViewport>
                  <div className="flex items-center justify-end gap-1 border-t border-slate-200 px-3 py-2">
                    <IconButton icon={ChevronUp} label="Usuario anterior" title="Anterior" onClick={() => moveSelection(currentIndex - 1)} disabled={filteredRows.length === 0 || currentIndex === 0} className="h-9 w-9" />
                    <IconButton icon={ChevronDown} label="Usuario siguiente" title="Siguiente" onClick={() => moveSelection(currentIndex + 1)} disabled={filteredRows.length === 0 || currentIndex === filteredRows.length - 1} className="h-9 w-9" />
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selectedUser ? (
              <div className="flex min-h-[260px] items-center justify-center text-center">
                <div>
                  <UsersRound size={34} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">Selecciona un usuario</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Aquí veremos sus hoteles y roles.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {selectedUser.full_name || 'Sin nombre'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedUser.email || 'Sin correo individual'}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    Acceso: {selectedUser.login_identifier}
                  </p>
                  <div className={`mt-3 text-xs font-medium ${getAccountStatusClass(selectedUser.account_status)}`}>
                    Estado: {getAccountStatusLabel(selectedUser.account_status)}
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-700">Accesos</h3>
                    {!isOwnAccount && (
                      <ActionButton icon={Pencil} label="Editar" onClick={openEdit} />
                    )}
                  </div>

                  {selectedUser.assignments.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      Este usuario todavía no tiene hoteles asignados.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {selectedUser.assignments.map((assignment) => (
                        <div
                          key={assignment.hotelId + assignment.roleId}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"
                        >
                          <div className="font-medium text-slate-800">{assignment.hotelName}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {assignment.roleName}
                            {!assignment.active && ' · acceso inactivo'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!isOwnAccount && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {selectedUser.email &&
                      selectedUser.account_status === 'PENDING_INVITATION' && (
                        <ActionButton
                          icon={Send}
                          label={resendingInvitation ? 'Enviando…' : 'Reenviar invitación'}
                          onClick={() => void resendInvitation()}
                          disabled={resendingInvitation}
                        />
                      )}
                    {!selectedUser.email && selectedUser.active && (
                      <ActionButton
                        icon={Send}
                        label={generatingAccessCode ? 'Generando…' : 'Generar código'}
                        onClick={() => void generateAccessCode()}
                        disabled={generatingAccessCode}
                      />
                    )}
                    <ActionButton
                      icon={Power}
                      label={selectedUser.active ? 'Desactivar usuario' : 'Activar usuario'}
                      onClick={() => openEdit(!selectedUser.active)}
                    />
                  </div>
                )}
              </>
            )}
          </aside>
        </main>

        {formMode && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !formBusy) setFormMode(null)
            }}
          >
            <div
              className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-blue-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
              role="dialog"
              aria-modal="true"
            >
              <img
                src="/assets/arias-suite-logo-v3.webp"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-8 -right-8 w-56 opacity-[0.055]"
              />

              <form className="relative p-6 sm:p-7" onSubmit={submitForm}>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {formMode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Gestiona la identidad y sus accesos por hotel.
                  </p>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</span>
                    <input
                      required
                      value={form.fullName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, fullName: event.target.value }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Identificador de acceso
                    </span>
                    <input
                      required
                      value={form.loginIdentifier}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          loginIdentifier: event.target.value.toUpperCase(),
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-50 read-only:bg-slate-50 read-only:text-slate-500"
                    />
                    <span className="mt-1.5 block text-xs text-slate-400">
                      Es el identificador que el trabajador utilizará para entrar. Debe ser único.
                    </span>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Correo electrónico <span className="font-normal text-slate-400">(opcional)</span>
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      readOnly={formMode === 'edit'}
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
                      }
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-50 read-only:bg-slate-50 read-only:text-slate-500"
                    />
                    <span className="mt-1.5 block text-xs text-slate-400">
                      Opcional. Con email: invitación por correo. Sin email: activación mediante código.
                      {formMode === 'edit' && ' El correo de una cuenta existente no se modifica desde esta pantalla.'}
                    </span>
                  </label>

                  {formMode === 'create' && (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 sm:col-span-2">
                      <div className="flex items-start gap-3">
                        <Send size={17} className="mt-0.5 text-sky-600" />
                        <p className="text-xs leading-5 text-slate-600">
                          {form.email.trim()
                            ? 'No necesitas establecer una contraseña. Arias Suite enviará una invitación al correo indicado y el usuario creará su propia contraseña al activarla.'
                            : 'No necesitas establecer una contraseña. Generaremos un código de activación para que el trabajador cree su propia contraseña.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {formMode === 'edit' && (
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, active: event.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="text-sm font-medium text-slate-700">Usuario activo</span>
                    </label>
                  )}
                </div>

                <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Accesos</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Un rol por hotel. Un usuario puede tener varios hoteles.
                      </p>
                    </div>

                    <ActionButton
                      icon={Plus}
                      label="Añadir hotel"
                      onClick={addAssignment}
                      disabled={
                        hotels.filter((hotel) => hotel.active).length <= form.assignments.length
                      }
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    {form.assignments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                        Añade al menos un hotel y un rol.
                      </div>
                    ) : (
                      form.assignments.map((assignment, index) => (
                        <div
                          key={index}
                          className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]"
                        >
                          <label>
                            <span className="mb-1 block text-xs font-medium text-slate-500">
                              Hotel
                            </span>
                            <select
                              value={assignment.hotelId}
                              onChange={(event) =>
                                updateAssignment(index, 'hotelId', event.target.value)
                              }
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-300"
                            >
                              {hotels
                                .filter(
                                  (hotel) =>
                                    hotel.active &&
                                    (hotel.id === assignment.hotelId ||
                                      !form.assignments.some(
                                        (item, itemIndex) =>
                                          itemIndex !== index && item.hotelId === hotel.id,
                                      )),
                                )
                                .map((hotel) => (
                                  <option key={hotel.id} value={hotel.id}>
                                    {hotel.name}
                                  </option>
                                ))}
                            </select>
                          </label>

                          <label>
                            <span className="mb-1 block text-xs font-medium text-slate-500">
                              Rol
                            </span>
                            <select
                              value={assignment.roleId}
                              onChange={(event) =>
                                updateAssignment(index, 'roleId', event.target.value)
                              }
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-300"
                            >
                              {roles
                                .filter((role) => role.active || role.id === assignment.roleId)
                                .map((role) => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                            </select>
                          </label>

                          <div className="flex items-end justify-end">
                            <button
                              type="button"
                              onClick={() => removeAssignment(index)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:text-red-600"
                              title="Quitar acceso"
                              aria-label="Quitar acceso"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="mt-5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                  >
                    {formError}
                  </div>
                )}

                <div className="mt-7 flex flex-wrap justify-end gap-2">
                  <ActionButton
                    label="Cancelar"
                    onClick={() => setFormMode(null)}
                    disabled={formBusy}
                  />
                  <ActionButton
                    icon={formMode === 'create' ? UserPlus : Pencil}
                    label={
                      formBusy
                        ? 'Guardando…'
                        : formMode === 'create'
                          ? form.email.trim()
                            ? 'Crear y enviar invitación'
                            : 'Crear y generar código'
                          : 'Guardar cambios'
                    }
                    type="submit"
                    disabled={formBusy}
                  />
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
