export type ApparatusCriticality = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

export type ApparatusPhotoCategory =
  | 'GENERAL'
  | 'NAMEPLATE'
  | 'INSTALLATION'
  | 'CONTROL'
  | 'OTHER'

export type ApparatusPhoto = {
  id: string
  category: ApparatusPhotoCategory
  url: string
}

export type ApparatusDocument = {
  id: string
  name: string
  storagePath: string
}

export type ApparatusTechnicalDatum = {
  id: string
  label: string
  value: string
}

export type ApparatusRegistry = {
  id: string
  code: string
  name: string
  plant: string
  location: string
  locationId: string
  maintenance: string
  equipmentType: string
  systemName: string
  familyCode: string
  subfamilyCode: string
  manufacturer: string
  model: string
  serialNumber: string
  inventoryNumber: string
  installationDate: string
  criticality: ApparatusCriticality
  observations: string
  documents: ApparatusDocument[]
  technicalData: ApparatusTechnicalDatum[]
  active: boolean
  sourceId: number | null
  photos: ApparatusPhoto[]
}

export type DatabaseApparatusRegistry = {
  id: string
  source_id: number | null
  code: string
  name: string
  plant: string | null
  location: string | null
  location_id?: string | null
  hotel_id?: string | null
  maintenance: string | null
  equipment_type: string | null
  system_name: string | null
  family_code: string | null
  subfamily_code: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  inventory_number: string | null
  installation_date: string | null
  criticality: ApparatusCriticality | null
  observations: string | null
  documents?: unknown
  technical_data?: unknown
  active: boolean
  photos?: unknown
  created_at: string
  updated_at: string
}

function parsePhotos(value: unknown): ApparatusPhoto[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((photo, index) => {
    if (typeof photo === 'string') {
      return [{
        id: `legacy-${index}-${photo}`,
        category: 'GENERAL' as const,
        url: photo,
      }]
    }

    if (typeof photo !== 'object' || photo === null) return []

    const item = photo as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.url !== 'string') return []

    const category = item.category
    const validCategories: ApparatusPhotoCategory[] = [
      'GENERAL',
      'NAMEPLATE',
      'INSTALLATION',
      'CONTROL',
      'OTHER',
    ]

    return [{
      id: item.id,
      category: validCategories.includes(category as ApparatusPhotoCategory)
        ? (category as ApparatusPhotoCategory)
        : 'GENERAL',
      url: item.url,
    }]
  })
}

function parseDocuments(value: unknown): ApparatusDocument[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((document) => {
    if (typeof document !== 'object' || document === null) return []
    const item = document as Record<string, unknown>

    if (
      typeof item.id !== 'string' ||
      typeof item.name !== 'string'
    ) {
      return []
    }

    if (typeof item.storagePath === 'string') {
      return [{
        id: item.id,
        name: item.name,
        storagePath: item.storagePath,
      }]
    }

    if (typeof item.url === 'string') {
      return [{
        id: item.id,
        name: item.name,
        storagePath: item.url,
      }]
    }

    return []
  })
}

function parseTechnicalData(value: unknown): ApparatusTechnicalDatum[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((datum) => {
    if (typeof datum !== 'object' || datum === null) return []
    const item = datum as Record<string, unknown>

    if (
      typeof item.id !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.value !== 'string'
    ) {
      return []
    }

    return [{
      id: item.id,
      label: item.label,
      value: item.value,
    }]
  })
}

export function fromDatabase(
  row: DatabaseApparatusRegistry,
): ApparatusRegistry {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    plant: row.plant ?? '',
    location: row.location ?? '',
    locationId: row.location_id ?? '',
    maintenance: row.maintenance ?? '',
    equipmentType: row.equipment_type ?? '',
    systemName: row.system_name ?? '',
    familyCode: row.family_code ?? '',
    subfamilyCode: row.subfamily_code ?? '',
    manufacturer: row.manufacturer ?? '',
    model: row.model ?? '',
    serialNumber: row.serial_number ?? '',
    inventoryNumber: row.inventory_number ?? '',
    installationDate: row.installation_date ?? '',
    criticality: row.criticality ?? 'NORMAL',
    observations: row.observations ?? '',
    documents: parseDocuments(row.documents),
    technicalData: parseTechnicalData(row.technical_data),
    active: row.active,
    sourceId: row.source_id,
    photos: parsePhotos(row.photos),
  }
}

export function toDatabase(
  item: ApparatusRegistry,
) {
  return {
    code: item.code.trim(),
    name: item.name.trim(),
    plant: item.plant.trim() || null,
    location: item.location.trim() || null,
    location_id: item.locationId || null,
    maintenance: item.maintenance.trim() || null,
    equipment_type: item.equipmentType.trim() || null,
    system_name: item.systemName.trim() || null,
    family_code: item.familyCode.trim() || null,
    subfamily_code: item.subfamilyCode.trim() || null,
    manufacturer: item.manufacturer.trim() || null,
    model: item.model.trim() || null,
    serial_number: item.serialNumber.trim() || null,
    inventory_number: item.inventoryNumber.trim() || null,
    installation_date: item.installationDate || null,
    criticality: item.criticality,
    observations: item.observations.trim() || null,
    documents: item.documents,
    technical_data: item.technicalData,
    active: item.active,
    photos: item.photos,
  }
}

export function createEmptyApparatus(): ApparatusRegistry {
  return {
    id: '',
    code: '',
    name: '',
    plant: '',
    location: '',
    locationId: '',
    maintenance: '',
    equipmentType: '',
    systemName: '',
    familyCode: '',
    subfamilyCode: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    inventoryNumber: '',
    installationDate: '',
    criticality: 'NORMAL',
    observations: '',
    documents: [],
    technicalData: [],
    active: true,
    sourceId: null,
    photos: [],
  }
}
