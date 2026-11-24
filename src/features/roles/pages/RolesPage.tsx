import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Power, ShieldCheck, Check, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../auth/context/AuthProvider'
import BrandLogo from '../../../shared/components/branding/BrandLogo'
import ActionButton from '../../../shared/components/buttons/ActionButton'
import { BackButton, HomeButton } from '../../../shared/components/navigation/NavigationButtons'

type Role = {
  id: string
  name: string
  code: string
  description: string | null
  active: boolean
}

type Permission = {
  id: string
  code: string
  name: string
  module: string
  action: string
  description: string | null
}

type RolePermission = {
  role_id: string
  permission_id: string
}

type RoleForm = {
  name: string
  code: string
  description: string
  active: boolean
}

const emptyForm: RoleForm = {
  name: '',
  code: '',
  description: '',
  active: true,
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
}

function moduleLabel(module: string) {
  const labels: Record<string, string> = {
    apparatusregistry: 'Relación de aparatos',
    electricalpanels: 'Cuadros eléctricos',
    assets: 'Activos',
    reports: 'Informes',
  }

  return labels[module] ?? module
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    view: 'Consultar',
    create: 'Crear',
    update: 'Modificar',
    delete: 'Eliminar',
    print: 'Imprimir',
  }

  return labels[action] ?? action
}

export default function RolesPage() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<RoleForm>(emptyForm)
  const [formBusy, setFormBusy] = useState(false)
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null)

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

    const [rolesResult, permissionsResult, rolePermissionsResult] = await Promise.all([
      supabase
        .from('roles')
        .select('id, name, code, description, active')
        .order('name', { ascending: true }),
      supabase
        .from('permissions')
        .select('id, code, name, module, action, description')
        .order('module', { ascending: true })
        .order('action', { ascending: true }),
      supabase
        .from('role_permissions')
        .select('role_id, permission_id'),
    ])

    const firstError = rolesResult.error ?? permissionsResult.error ?? rolePermissionsResult.error
    if (firstError) {
      setError('No se han podido cargar los roles y permisos.')
      setLoading(false)
      return
    }

    const nextRoles = rolesResult.data ?? []
    setRoles(nextRoles)
    setPermissions(permissionsResult.data ?? [])
    setRolePermissions(rolePermissionsResult.data ?? [])

    if (!selectedRoleId || !nextRoles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(nextRoles[0]?.id ?? null)
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [session?.user.id])

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      groups[permission.module] ??= []
      groups[permission.module].push(permission)
      return groups
    }, {})
  }, [permissions])

  function openCreate() {
    setForm({ ...emptyForm })
    setFormMode('create')
  }

  function openEdit() {
    if (!selectedRole) return

    setForm({
      name: selectedRole.name,
      code: selectedRole.code,
      description: selectedRole.description ?? '',
      active: selectedRole.active,
    })
    setFormMode('edit')
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (formBusy) return

    const name = form.name.trim()
    const code = normalizeCode(form.code)

    if (!name || !code) {
      setError('Nombre y código son obligatorios.')
      return
    }

    if (!/^[A-Z0-9_]+$/.test(code)) {
      setError('El código solo puede contener letras, números y guiones bajos.')
      return
    }

    setFormBusy(true)
    setError('')

    if (formMode === 'create') {
      const { data, error: insertError } = await supabase
        .from('roles')
        .insert({
          name,
          code,
          description: form.description.trim() || null,
          active: form.active,
        })
        .select('id, name, code, description, active')
        .single()

      if (insertError || !data) {
        setError(insertError?.message ?? 'No se ha podido crear el rol.')
        setFormBusy(false)
        return
      }

      const { data: reportPermissions, error: reportPermissionsError } = await supabase
        .from('permissions')
        .select('id')
        .in('code', ['reports.view', 'reports.print'])

      if (!reportPermissionsError && reportPermissions?.length) {
        await supabase.from('role_permissions').insert(
          reportPermissions.map((permission) => ({
            role_id: data.id,
            permission_id: permission.id,
          })),
        )
      }

      setRoles((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name, 'es')))
      setSelectedRoleId(data.id)
    } else {
      if (!selectedRole) {
        setFormBusy(false)
        return
      }

      const { data, error: updateError } = await supabase
        .from('roles')
        .update({
          name,
          description: form.description.trim() || null,
          active: form.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedRole.id)
        .select('id, name, code, description, active')
        .single()

      if (updateError || !data) {
        setError(updateError?.message ?? 'No se ha podido actualizar el rol.')
        setFormBusy(false)
        return
      }

      setRoles((current) =>
        current.map((role) => (role.id === data.id ? data : role)).sort((a, b) => a.name.localeCompare(b.name, 'es')),
      )
    }

    setFormMode(null)
    setFormBusy(false)
  }

  async function togglePermission(permission: Permission) {
    if (!selectedRole || permissionBusy) return

    const roleId = selectedRole.id
    const existing = rolePermissions.some(
      (item) => item.role_id === roleId && item.permission_id === permission.id,
    )

    setPermissionBusy(permission.id)
    setError('')

    if (existing) {
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permission.id)

      if (deleteError) {
        setError(deleteError.message)
        setPermissionBusy(null)
        return
      }

      setRolePermissions((current) =>
        current.filter(
          (item) => !(item.role_id === roleId && item.permission_id === permission.id),
        ),
      )
    } else {
      const { error: insertError } = await supabase.from('role_permissions').insert({
        role_id: roleId,
        permission_id: permission.id,
      })

      if (insertError) {
        setError(insertError.message)
        setPermissionBusy(null)
        return
      }

      setRolePermissions((current) => [
        ...current,
        { role_id: roleId, permission_id: permission.id },
      ])
    }

    setPermissionBusy(null)
  }

  async function toggleRoleActive() {
    if (!selectedRole) return

    const nextActive = !selectedRole.active
    setError('')

    const { data, error: updateError } = await supabase
      .from('roles')
      .update({
        active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedRole.id)
      .select('id, name, code, description, active')
      .single()

    if (updateError || !data) {
      setError(updateError?.message ?? 'No se ha podido cambiar el estado del rol.')
      return
    }

    setRoles((current) => current.map((role) => (role.id === data.id ? data : role)))
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

        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={21} className="text-slate-500" />
                <h1 className="text-xl font-semibold text-slate-900">Roles y permisos</h1>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Define qué puede hacer cada rol dentro de Arias Suite.
              </p>
            </div>

            <ActionButton icon={Plus} label="Nuevo rol" onClick={openCreate} />
          </div>
        </header>

        <main className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando roles…</div>
            ) : error && roles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-600">{error}</div>
            ) : roles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No hay roles configurados.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={[
                      'flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition hover:bg-slate-50',
                      selectedRoleId === role.id ? 'bg-blue-50/60' : '',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{role.name}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-slate-400">{role.code}</div>
                    </div>
                    <span
                      className={[
                        'mt-0.5 shrink-0 text-xs font-medium',
                        role.active ? 'text-slate-700' : 'text-slate-400',
                      ].join(' ')}
                    >
                      {role.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selectedRole ? (
              <div className="flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <ShieldCheck size={36} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">Selecciona un rol</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{selectedRole.name}</h2>
                    <p className="mt-1 font-mono text-xs text-slate-400">{selectedRole.code}</p>
                    {selectedRole.description && (
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                        {selectedRole.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ActionButton icon={Pencil} label="Editar" onClick={openEdit} />
                    <ActionButton
                      icon={Power}
                      label={selectedRole.active ? 'Desactivar' : 'Activar'}
                      onClick={() => void toggleRoleActive()}
                    />
                  </div>
                </div>

                <div className="mt-7 border-t border-slate-100 pt-6">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">Permisos</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Activa o desactiva cada permiso para este rol.
                        {selectedRole.code === 'VIEWER' &&
                          ' Este rol está limitado a consulta e impresión.'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {
                        rolePermissions.filter((item) => item.role_id === selectedRole.id)
                          .length
                      }{' '}
                      asignados
                    </span>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                    >
                      {error}
                    </div>
                  )}

                  <div className="mt-4 space-y-4">
                    {Object.entries(groupedPermissions).map(([module, modulePermissions]) => (
                      <div
                        key={module}
                        className="rounded-2xl border border-slate-200 bg-slate-50/60"
                      >
                        <div className="border-b border-slate-200 px-4 py-3">
                          <h4 className="text-sm font-semibold text-slate-700">
                            {moduleLabel(module)}
                          </h4>
                        </div>

                        <div className="divide-y divide-slate-100 bg-white">
                          {modulePermissions.map((permission) => {
                            const checked = rolePermissions.some(
                              (item) =>
                                item.role_id === selectedRole.id &&
                                item.permission_id === permission.id,
                            )
                            const busy = permissionBusy === permission.id
                            const helperReadOnly =
                              selectedRole.code === 'VIEWER' &&
                              !['view', 'print'].includes(permission.action)

                            return (
                              <button
                                key={permission.id}
                                type="button"
                                onClick={() => void togglePermission(permission)}
                                disabled={busy || helperReadOnly}
                                title={
                                  helperReadOnly
                                    ? 'El Ayudante de mantenimiento solo puede consultar e imprimir informes.'
                                    : undefined
                                }
                                className={[
                                  'flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition',
                                  helperReadOnly
                                    ? 'cursor-not-allowed bg-slate-50/70 opacity-60'
                                    : 'hover:bg-slate-50',
                                  'disabled:cursor-wait disabled:opacity-60',
                                ].join(' ')}
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-slate-700">
                                    {permission.name}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-400">
                                    {actionLabel(permission.action)} · {permission.code}
                                  </div>
                                </div>

                                <span
                                  className={[
                                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                                    checked
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                      : 'border-slate-200 bg-white text-slate-300',
                                  ].join(' ')}
                                  aria-hidden="true"
                                >
                                  {checked ? <Check size={16} /> : <X size={15} />}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </main>

        {formMode && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !formBusy) setFormMode(null)
            }}
          >
            <div className="w-full max-w-xl rounded-3xl border border-blue-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
              <form className="p-6 sm:p-7" onSubmit={submitForm}>
                <h2 className="text-xl font-semibold text-slate-900">
                  {formMode === 'create' ? 'Nuevo rol' : 'Editar rol'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formMode === 'create'
                    ? 'Crea un rol para reutilizar su conjunto de permisos.'
                    : 'Modifica la descripción y el estado del rol.'}
                </p>

                <div className="mt-6 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Nombre</span>
                    <input
                      required
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Código</span>
                    <input
                      required
                      readOnly={formMode === 'edit'}
                      value={form.code}
                      onChange={(event) => setForm((current) => ({ ...current, code: normalizeCode(event.target.value) }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 font-mono text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-50 read-only:bg-slate-50 read-only:text-slate-500"
                    />
                    <span className="mt-1.5 block text-xs text-slate-400">
                      {formMode === 'edit'
                        ? 'El código identifica internamente el rol y no se modifica.'
                        : 'Usa letras, números y guiones bajos.'}
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Descripción
                    </span>
                    <textarea
                      rows={4}
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, description: event.target.value }))
                      }
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-50"
                    />
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, active: event.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-slate-700">Rol activo</span>
                  </label>
                </div>

                <div className="mt-7 flex justify-end gap-2">
                  <ActionButton
                    label="Cancelar"
                    onClick={() => setFormMode(null)}
                    disabled={formBusy}
                  />
                  <ActionButton
                    icon={formMode === 'create' ? Plus : Pencil}
                    label={formBusy ? 'Guardando…' : formMode === 'create' ? 'Crear rol' : 'Guardar cambios'}
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
