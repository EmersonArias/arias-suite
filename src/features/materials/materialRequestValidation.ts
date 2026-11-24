export type MaterialDraftLine = { key: string; query: string; material_id: string; quantity: string }

export function validateMaterialDraft<T extends { id: string }>(draft: MaterialDraftLine[], materials: T[]) {
  const lines = draft.filter(line => line.material_id || line.query.trim()
    || (line.quantity.trim() !== '' && Number(line.quantity) !== 1)).map(line => {
    const material = materials.find(item => item.id === line.material_id) ?? null
    const quantity = Number(line.quantity)
    const validQuantity = Number.isFinite(quantity) && quantity > 0 && quantity <= 9999999999.99
      && Math.abs(Math.round(quantity * 100) - quantity * 100) < 1e-8
    return { ...line, material, validQuantity }
  })
  const invalid = lines.find(line => !line.material || !line.validQuantity)
  const error = lines.length === 0 ? 'Selecciona al menos un artículo del catálogo.'
    : invalid && !invalid.material ? 'Selecciona un artículo del catálogo para cada línea que hayas empezado.'
    : invalid ? 'Las cantidades deben ser mayores que cero y tener como máximo dos decimales.' : ''
  return { lines, error }
}
