import type { BookDefinition, BookField, BookEntry } from '../technicalbooks/types.ts'

export type WaterBookType = 'pool' | 'spa'
const workbook = 'R-SSTT-01-03 LIBRO DE PISCINAS Y SPAS(9).xlsx'
const sha256 = '3f0828e43ee57f84acfd26bf03eef7c66cce01a46c82b93239923067a0e74838'
const readings = [
  ['temperature', 'Temperatura', 'D4', '°C'],
  ['freeChlorine', 'Cloro libre', 'E4', 'mg/L'],
  ['combinedChlorine', 'Cloro residual combinado', 'F4', 'mg/L'],
  ['totalChlorine', 'Cloro total', 'G4', 'mg/L'],
  ['ph', 'pH', 'H4', ''],
  ['transparency', 'Fondo visible', 'I4', ''],
  ['turbidity', 'Turbidez', 'J4', 'UNF'],
  ['filteredWater', 'Agua depurada', 'K4', 'm³'],
  ['filtersCleaned', 'Limpieza de filtros', 'L4', ''],
  ['bromine', 'Bromo total', 'Formulario SPA', 'mg/L'],
  ['disinfectant', 'Desinfectante', 'Formulario', ''],
] as const

export function waterBook(type: WaterBookType): BookDefinition {
  const fields = readings.filter(([id]) => type === 'spa' || id !== 'bromine').map(([id, label, source, unit]): BookField => ({
    id, label, source, unit, sourceLabel: label, section: 'Control diario',
    kind: id === 'disinfectant' ? 'text' : ['transparency', 'filtersCleaned'].includes(id) ? 'yesno' : 'number',
  }))
  return { id: type, code: 'R-SSTT-01-03_0' + (type === 'pool' ? '1' : '2'),
    title: type === 'pool' ? 'Libro de piscina' : 'Libro de spa', icon: type, sheet: 'Hoja1',
    assetLabel: 'Vaso', notes: [], fields, workbook, sha256 }
}

export type Sample = Record<Exclude<typeof readings[number][0], 'transparency' | 'filtersCleaned' | 'disinfectant'>, string> & {
  date: string; time: string; technician: string; notes: string
  transparency: boolean | null; filtersCleaned: boolean | null; disinfectant: 'CHLORINE' | 'BROMINE'
}

export function encodeSample(entry: BookEntry, form: Sample): BookEntry {
  const answers: BookEntry['answers'] = {}
  for (const field of entry.template.fields) {
    const id = field.id as keyof Sample
    const inactive = id === 'bromine' ? form.disinfectant === 'CHLORINE' : id.endsWith('Chlorine') && form.disinfectant === 'BROMINE'
    const raw = form[id]
    const value = typeof raw === 'boolean' ? (raw ? 'SI' : 'NO') : raw ?? ''
    answers[id] = inactive ? { value: 'NA', note: 'Se utiliza el otro desinfectante.' } :
      { value: id === 'disinfectant' ? (raw === 'BROMINE' ? 'Bromo' : 'Cloro') : value, note: '' }
  }
  return { ...entry, asset: entry.template.title, date: form.date, time: form.time, technician: form.technician, observations: form.notes, answers }
}

export function decodeSample(entry: BookEntry): Sample {
  function reading(id: string) {
    const value = entry.answers[id]?.value
    return value === 'NA' ? '' : value ?? ''
  }
  function flag(id: string) { return reading(id) === 'SI' ? true : reading(id) === 'NO' ? false : null }
  return {
    date: entry.date, time: entry.time, technician: entry.technician, notes: entry.observations,
    temperature: reading('temperature'), freeChlorine: reading('freeChlorine'), combinedChlorine: reading('combinedChlorine'),
    totalChlorine: reading('totalChlorine'), bromine: reading('bromine'), ph: reading('ph'), turbidity: reading('turbidity'),
    filteredWater: reading('filteredWater'), filtersCleaned: flag('filtersCleaned'), transparency: flag('transparency'),
    disinfectant: reading('disinfectant') === 'Bromo' ? 'BROMINE' : 'CHLORINE',
  }
}
