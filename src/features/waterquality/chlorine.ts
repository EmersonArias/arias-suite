export const chlorineKeys = ['freeChlorine', 'totalChlorine', 'combinedChlorine'] as const
export type ChlorineKey = typeof chlorineKeys[number]
export type ChlorineReadings = Record<ChlorineKey, string>

// Keep the measured inputs untouched. The third value never becomes an input on a later render.
export function resolveChlorine(raw: ChlorineReadings) {
  const missing = chlorineKeys.filter(key => raw[key].trim() === '')
  const number = (key: ChlorineKey) => Number(raw[key].replace(',', '.'))
  const invalid = chlorineKeys.some(key => raw[key].trim() && (!Number.isFinite(number(key)) || number(key) < 0))
  if (invalid) return { values: raw, calculated: null, error: 'Introduce mediciones de cloro válidas y positivas o cero.' }
  if (missing.length !== 1) return { values: raw, calculated: null, error: '' }
  const key = missing[0]
  const n = key === 'totalChlorine' ? number('freeChlorine') + number('combinedChlorine')
    : number('totalChlorine') - number(key === 'freeChlorine' ? 'combinedChlorine' : 'freeChlorine')
  if (n < 0) return { values: raw, calculated: key, error: 'El cloro total debe ser igual o superior a cada componente.' }
  return { values: { ...raw, [key]: n.toFixed(2) }, calculated: key, error: '' }
}
