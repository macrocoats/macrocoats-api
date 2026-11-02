/**
 * Converts a formula quantity into the unit its Inventory item is stocked in.
 * Formula rows and Inventory items don't always agree (a surfactant measured in
 * litres but bought by the kg), and stock only means anything in one unit.
 * Returns null when it can't be converted, so a caller can refuse rather than
 * subtract litres from kilograms.
 */

type BaseUnit = 'kg' | 'l'

const UNIT_ALIASES: Record<string, BaseUnit> = {
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  l: 'l', lt: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
}

const toBaseUnit = (unit: string | null | undefined): BaseUnit | null =>
  UNIT_ALIASES[(unit ?? '').trim().toLowerCase()] ?? null

export const round3 = (value: number): number => Math.round(value * 1000) / 1000

/**
 * @param density kg per litre of the material, used only when the units differ.
 * @returns the quantity in `inventoryUnit`, or null if the units can't be reconciled.
 */
export function toInventoryQuantity(
  quantity: number,
  rowUnit: string | null | undefined,
  inventoryUnit: string,
  density: number | null | undefined,
): number | null {
  const to = toBaseUnit(inventoryUnit)
  // A row with no unit has always been read as already being in the stocked unit.
  if (!(rowUnit ?? '').trim()) return quantity
  const from = toBaseUnit(rowUnit)
  if (!from || !to) return null
  if (from === to) return quantity
  if (!density || !(density > 0)) return null
  return from === 'l' ? quantity * density : quantity / density
}
