import { supabase } from '../../lib/supabase'
import type { BookEntry } from './types'

export type CatalogLocation = {
  id: string; parent_location_id: string | null; location_type: string; code: string | null
  name: string; active: boolean; sort_order: number
}
export type CatalogAsset = {
  id: string; source_id: number | null; code: string; name: string; plant: string | null
  location: string | null; location_id: string | null; active: boolean
  maintenance?: string | null
}
export type CatalogUnit = {
  id: string; book_id: string; code: string; name: string; location_id: string | null
  equipment_id: string; active: boolean; verified: boolean; metadata: Record<string, string>
}
export type BookCatalog = { locations: CatalogLocation[]; assets: CatalogAsset[]; units: CatalogUnit[] }
export type CatalogTarget = {
  key: string; label: string; path: string; locationId: string; assetId?: string; unitId?: string
  floor: string; metadata?: Record<string, string>
}
const roomBooks = new Set(['fancoils', 'fondo-habitaciones', 'revision-habitaciones'])
export const isRoomBook = (bookId: string) => roomBooks.has(bookId)
export function selectCatalogTarget(entry: BookEntry, target: CatalogTarget): BookEntry {
  const answers: BookEntry['answers'] = {}
  if (target.unitId) {
    answers.type = { value: target.metadata?.type || '', note: '' }
    if (entry.bookId === 'extintores') answers.plate = { value: target.metadata?.plate || '', note: '' }
    else answers.sign = { value: target.metadata?.sign || '', note: '' }
  }
  if (entry.bookId === 'fancoils-comunes') answers['equipment-id'] = { value: target.label, note: '' }
  if (entry.bookId === 'pci') answers['control-B36'] = { value: 'NA', note: 'La megafonía del hotel se utiliza para música.' }
  return { ...entry, asset: target.label, location: target.path, targetKey: target.key, assetId: target.assetId,
    locationId: target.locationId, unitId: target.unitId, answers, controlIds: undefined, controlEquipmentIds: undefined,
    controlEquipmentLabels: undefined, campaignTicketId: undefined, campaignTargetId: undefined, pamTicketId: undefined, pamOutcome: undefined }
}

async function allRows<T>(table: string, columns: string, hotelId: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from(table).select(columns).eq('hotel_id', hotelId).order('id').range(offset, offset + 499)
    if (result.error) throw new Error('No se pudo cargar el catálogo del hotel. ' + result.error.message)
    rows.push(...result.data as unknown as T[])
    if (result.data.length < 500) return rows
  }
}
export async function loadBookCatalog(hotelId: string): Promise<BookCatalog> {
  const [locations, assets, units] = await Promise.all([
    allRows<CatalogLocation>('hotel_locations', 'id,parent_location_id,location_type,code,name,active,sort_order', hotelId),
    allRows<CatalogAsset>('apparatus_registry', 'id,source_id,code,name,plant,location,location_id,active,maintenance', hotelId),
    allRows<CatalogUnit>('technical_book_units', 'id,book_id,code,name,location_id,equipment_id,active,verified,metadata', hotelId),
  ])
  return { locations, assets, units }
}
export type PamCatalogGroup = { id: string; source_row: number; source_apparatus_expression: string; maintenance_name: string; plan_year: number }
export type PamCatalogMark = { id: string; source_row: number; month_number: number; week_slot: number; mark_code: string; plan_year: number }
export async function loadPamCatalog(hotelId: string) {
  const [groups, marks] = await Promise.all([
    allRows<PamCatalogGroup>('pam_source_groups', 'id,source_row,source_apparatus_expression,maintenance_name,plan_year', hotelId),
    allRows<PamCatalogMark>('pam_source_marks', 'id,source_row,month_number,week_slot,mark_code,plan_year', hotelId),
  ])
  return { groups, marks }
}
export function locationPath(locations: CatalogLocation[], id: string): string {
  const byId = new Map(locations.map(row => [row.id, row]))
  const seen = new Set<string>(), names: string[] = []
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id); names.unshift(current.name)
    current = byId.get(current.parent_location_id || '')
  }
  return names.join(' / ')
}
export function floorOf(locations: CatalogLocation[], id: string): CatalogLocation | undefined {
  const byId = new Map(locations.map(row => [row.id, row]))
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    if (current.location_type === 'PLANTA') return current
    seen.add(current.id); current = byId.get(current.parent_location_id || '')
  }
}
export function catalogTargets(catalog: BookCatalog, bookId: string): CatalogTarget[] {
  const activeLocations = new Set(catalog.locations.filter(row => row.active).map(row => row.id))
  const path = (id: string) => locationPath(catalog.locations, id)
  let targets: CatalogTarget[]
  if (isRoomBook(bookId)) {
    targets = catalog.locations.filter(row => row.active && row.location_type === 'HABITACION').map(row => ({
      key: 'location:' + row.id, label: row.code || row.name, path: path(row.id), locationId: row.id, floor: floorOf(catalog.locations, row.id)?.name || '',
    }))
  } else if (bookId === 'extintores' || bookId === 'bie') {
    targets = catalog.units.filter(row => row.active && row.book_id === bookId && activeLocations.has(row.location_id || '')).map(row => ({
      key: 'unit:' + row.id, label: row.code + ' · ' + row.name, path: path(row.location_id!), locationId: row.location_id!,
      assetId: row.equipment_id, unitId: row.id, floor: floorOf(catalog.locations, row.location_id!)?.name || '', metadata: row.metadata,
    }))
  } else {
    const allowed = (asset: CatalogAsset) => {
      const id = asset.source_id
      if (bookId === 'fancoils-comunes') return /fan.?coil/i.test(asset.name) && id !== 340
      if (bookId === 'fotoluminiscentes') return id === 339
      if (bookId === 'pci') return id === 341
      if (bookId === 'rociadores') return [17, 55, 212, 243, 328, 341].includes(id || 0)
      if (bookId === 'legionella') return /ACS|AFSCH|AFCH|AGUA|ALJIBE|DUCHA|CLOR|DOSIFIC/i.test(asset.name)
      if (bookId === 'bombas') return /BOMBA/i.test(asset.name)
      if (bookId === 'climatizadores') return /CLIMA|EXTRACT|VENTIL/i.test(asset.name) && !/fan.?coil/i.test(asset.name)
      if (bookId === 'cuadros-bt') return /CUADRO|SUBCUADRO/i.test(asset.name)
      if (bookId === 'luces-emergencia') return id === 11
      if (bookId === 'puertas-cortafuegos') return id === 9
      return true
    }
    targets = catalog.assets.filter(row => row.active && allowed(row) && activeLocations.has(row.location_id || '')).map(row => ({
      key: 'asset:' + row.id, label: (row.source_id ?? row.code) + ' · ' + row.name +
        (catalog.assets.some(other => other.active && other.id !== row.id && other.source_id === row.source_id && other.name === row.name) ? ' · ' + row.code : ''), path: path(row.location_id!),
      locationId: row.location_id!, assetId: row.id, floor: floorOf(catalog.locations, row.location_id!)?.name || '',
    }))
    if (bookId === 'legionella') {
      targets.push(...catalogTargets(catalog, 'revision-habitaciones'))
    }
  }
  return targets.sort((a, b) => a.path.localeCompare(b.path, 'es', { numeric: true }) || a.label.localeCompare(b.label, 'es', { numeric: true }))
}
