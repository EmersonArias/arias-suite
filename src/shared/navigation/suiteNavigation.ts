export type SuiteAreaId = 'maintenance' | 'records' | 'equipment' | 'materials' | 'companies' | 'people' | 'documents'
export type SuiteLink = { id: string; label: string; href: string; description: string; icon: string; area: SuiteAreaId; parent?: string }
export type SuiteArea = { id: SuiteAreaId; label: string; href: string; description: string; icon: string }
const icons = '/assets/maintenance-icons-3d/'
const records = '/assets/record-icons-3d/'
export const suiteAreas: SuiteArea[] = [
  { id: 'maintenance', label: 'Mantenimiento', href: '/maintenance', description: 'Correctivos, preventivos y proyectos de mejora.', icon: icons + 'interventions.webp' },
  { id: 'records', label: 'Registros técnicos', href: '/registros-tecnicos', description: 'Controles, mediciones y revisiones del hotel.', icon: records + 'daily.webp' },
  { id: 'equipment', label: 'Equipos e instalaciones', href: '/apparatusregistry', description: 'Inventario técnico y ubicaciones.', icon: icons + 'equipment.webp' },
  { id: 'materials', label: 'Materiales y pedidos', href: '/materials', description: 'Catálogo, existencias y peticiones de material.', icon: icons + 'materials.webp' },
  { id: 'companies', label: 'Empresas y proveedores', href: '/providers', description: 'Suministradores, mantenedores, gremios y contactos.', icon: icons + 'equipment.webp' },
  { id: 'people', label: 'Personal y turnos', href: '/personal', description: 'Horarios, ausencias y registro de jornada.', icon: icons + 'pam.webp' },
  { id: 'documents', label: 'Documentación y auditoría', href: '/documentacion', description: 'Informes y consulta de evidencias e históricos.', icon: records + 'calibration.webp' },
]
export const suiteLinks: SuiteLink[] = [
  { id: 'correctives', label: 'Incidencias y correctivos', href: '/maintenance/tickets', description: 'Averías, solicitudes y actuaciones correctivas.', icon: records + 'daily.webp', area: 'maintenance' },
  { id: 'preventives', label: 'Preventivos', href: '/maintenance/preventivos', description: 'Planes recurrentes y ejecución de revisiones.', icon: icons + 'pam.webp', area: 'maintenance' },
  { id: 'projects', label: 'Proyectos y mejoras', href: '/maintenance/proyectos', description: 'Actuaciones puntuales con principio y final.', icon: icons + 'interventions.webp', area: 'maintenance' },
  { id: 'work', label: 'Trabajos pendientes', href: '/maintenance/trabajos', description: 'Consulta los pendientes según el tipo de trabajo.', icon: icons + 'pending.webp', area: 'maintenance' },
  { id: 'led', label: 'LED de armario', href: '/maintenance/proyectos/led-armario', description: 'Renovación de iluminación por plantas y habitaciones.', icon: icons + 'led.webp', area: 'maintenance', parent: 'projects' },
  { id: 'fancoils', label: 'Preventivos de fancoils', href: '/maintenance/preventivos/fancoils', description: 'Seguimiento de revisiones por habitación.', icon: records + 'fancoil.webp', area: 'maintenance', parent: 'preventives' },
  { id: 'pam', label: 'Planes de mantenimiento · PAM', href: '/maintenance/pam', description: 'Define los planes y las frecuencias de mantenimiento.', icon: icons + 'pam.webp', area: 'maintenance', parent: 'preventives' },
  { id: 'preventive-calendar', label: 'Calendario y ejecución', href: '/maintenance/planning', description: 'Consulta las revisiones programadas y su ejecución.', icon: icons + 'pending.webp', area: 'maintenance', parent: 'preventives' },
  { id: 'corrective-pending', label: 'Incidencias pendientes', href: '/maintenance/tickets?summary=PENDING', description: 'Averías y correctivos pendientes de atención.', icon: icons + 'pending.webp', area: 'maintenance', parent: 'work' },
  { id: 'corrective-overdue', label: 'Correctivos atrasados', href: '/maintenance/tickets?summary=OVERDUE', description: 'Incidencias que han superado la fecha prevista.', icon: icons + 'warning.webp', area: 'maintenance', parent: 'work' },
  { id: 'preventive-pending', label: 'Preventivos pendientes', href: '/maintenance/planning?summary=PENDING', description: 'Revisiones programadas pendientes de ejecución.', icon: icons + 'pam.webp', area: 'maintenance', parent: 'work' },
  { id: 'preventive-overdue', label: 'Preventivos atrasados', href: '/maintenance/planning?summary=OVERDUE', description: 'Revisiones que han superado su fecha prevista.', icon: icons + 'warning.webp', area: 'maintenance', parent: 'work' },
  { id: 'pending-list', label: 'Pendientes por ubicación y gremio', href: '/maintenance/pending', description: 'Listado de actuaciones pendientes del hotel.', icon: icons + 'pending.webp', area: 'maintenance', parent: 'work' },
  { id: 'interventions', label: 'Intervenciones registradas', href: '/maintenance/interventions', description: 'Trabajos realizados y su historial.', icon: icons + 'interventions.webp', area: 'maintenance' },
  { id: 'history', label: 'Historial de correctivos', href: '/maintenance/tickets/history', description: 'Consulta incidencias finalizadas.', icon: records + 'daily.webp', area: 'maintenance' },
  { id: 'daily', label: 'Preventivo diario', href: '/maintenance/record', description: 'Registro de los controles habituales.', icon: records + 'daily.webp', area: 'records' },
  { id: 'pool', label: 'Piscina exterior', href: '/pools', description: 'Mediciones y controles de la piscina.', icon: records + 'pool.webp', area: 'records' },
  { id: 'spa', label: 'Piscina SPA', href: '/spa', description: 'Mediciones y controles del SPA.', icon: records + 'spa.webp', area: 'records' },
  { id: 'structure', label: 'Estructura del hotel', href: '/maintenance/structure', description: 'Plantas, habitaciones y ubicaciones.', icon: icons + 'equipment.webp', area: 'equipment' },
  { id: 'schedule', label: 'Planificador horario', href: '/planificador-horario', description: 'Turnos, vacaciones y ausencias del equipo.', icon: icons + 'pam.webp', area: 'people' },
  { id: 'clock', label: 'Registro de jornada', href: '/registro-jornada', description: 'Consulta y gestión de los fichajes.', icon: icons + 'pending.webp', area: 'people' },
  { id: 'reports', label: 'Informes disponibles', href: '/reports', description: 'Consulta y exportación de los informes del hotel.', icon: records + 'calibration.webp', area: 'documents' },
]
export type HubId = 'maintenance' | 'preventives' | 'projects' | 'work' | 'people' | 'documents'
export const hubs: Record<HubId, { title: string; description: string; href: string; parent: string; links: string[]; related?: string[] }> = {
  maintenance: { title: 'Mantenimiento', description: 'Organiza el trabajo según su finalidad: resolver averías, prevenir fallos o realizar mejoras.', href: '/maintenance', parent: '/', links: ['correctives', 'preventives', 'projects'], related: ['work', 'interventions', 'history'] },
  preventives: { title: 'Preventivos', description: 'Planes de mantenimiento, calendario de revisiones y seguimiento por habitación.', href: '/maintenance/preventivos', parent: '/maintenance', links: ['pam', 'preventive-calendar', 'fancoils'] },
  projects: { title: 'Proyectos y mejoras', description: 'Actuaciones puntuales del hotel. Cada proyecto mantiene su seguimiento e historial.', href: '/maintenance/proyectos', parent: '/maintenance', links: ['led'] },
  work: { title: 'Trabajos pendientes', description: 'Consulta el listado por ubicaciones, las incidencias o las revisiones pendientes. Los atrasados tienen sus propias vistas.', href: '/maintenance/trabajos', parent: '/maintenance', links: ['pending-list', 'corrective-pending', 'preventive-pending'], related: ['corrective-overdue', 'preventive-overdue', 'projects'] },
  people: { title: 'Personal y turnos', description: 'Organización del equipo de mantenimiento y control de sus jornadas.', href: '/personal', parent: '/', links: ['schedule', 'clock'] },
  documents: { title: 'Documentación y auditoría', description: 'Consulta los informes y la trazabilidad de los trabajos y controles del hotel.', href: '/documentacion', parent: '/', links: ['reports'], related: ['records', 'history', 'interventions'] },
}
export const shortcutCatalog: SuiteLink[] = [
  ...suiteLinks,
  ...suiteAreas.filter(area => !['maintenance', 'people', 'documents'].includes(area.id)).map(area => ({ ...area, id: area.id, area: area.id })),
]
export const defaultFavorites = ['led', 'fancoils', 'records', 'schedule']
export function normalizeFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return [...defaultFavorites]
  const allowed = new Set(shortcutCatalog.map(link => link.id))
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id)))].slice(0, 8)
}
export function favoriteStorageKey(userId: string, hotelId: string) {
  return `arias-suite:favorites:v1:${encodeURIComponent(userId)}:${encodeURIComponent(hotelId)}`
}
export function areaForPath(path: string): SuiteAreaId | null {
  if (/^\/(documentacion|reports)(\/|$)/.test(path) || path === '/maintenance/audit') return 'documents'
  if (/^\/(registros-tecnicos|pumps|pools|spa|legionella|climatizers|electricalpanels|photoluminescent|emergencylights|firedoors|calibrations|fireequipment)(\/|$)/.test(path) || ['/maintenance/record', '/maintenance/records', '/maintenance/audit/records'].includes(path)) return 'records'
  if (/^\/(apparatusregistry|assets)(\/|$)/.test(path) || path === '/maintenance/structure') return 'equipment'
  if (path.startsWith('/materials')) return 'materials'
  if (path.startsWith('/providers')) return 'companies'
  if (/^\/(personal|planificador-horario|registro-jornada)(\/|$)/.test(path)) return 'people'
  if (/^\/(maintenance|pam|planning|actions|fancoils)(\/|$)/.test(path)) return 'maintenance'
  return null
}
export function breadcrumbsForPath(path: string): { label: string; href: string }[] {
  const area = suiteAreas.find(item => item.id === areaForPath(path))
  if (!area) return []
  const result = [{ label: area.label, href: area.href }]
  const link = [...suiteLinks].sort((a, b) => b.href.length - a.href.length).find(item => path === item.href || path.startsWith(item.href + '/'))
  if (link?.parent) {
    const parent = suiteLinks.find(item => item.id === link.parent)
    if (parent) result.push({ label: parent.label, href: parent.href })
  }
  if (link && link.href !== area.href) result.push({ label: link.label, href: link.href })
  return result
}
