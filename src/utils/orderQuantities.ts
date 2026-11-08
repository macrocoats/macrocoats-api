import { normalizeUnit } from './supplySummary.js'

/**
 * Customer-order quantities per unit (pure, unit-tested in
 * tests/unit/order-quantities.test.ts). An order's lines can be in litres and
 * kilograms; summing them into one number (the stored `total_quantity`) is
 * meaningless, so lists and detail views read these per-unit totals instead.
 * Units are normalised with the same rules as Customer Supply (`kg`, `Kgs`,
 * `kilogram` → `KG`; `ltr`, `litre` → `L`). No density conversion.
 */

export interface OrderLineQty { id: string; unit: string | null; quantityOrdered: number }
export interface LinkQty      { orderItemId: string; quantity: number }
export interface DispatchQty  { orderItemId: string | null; quantity: number }

export interface UnitQuantities {
  unit: string
  ordered: number
  produced: number
  dispatched: number
  /** Ordered − dispatched, never negative. */
  pending: number
}

export interface OrderQuantities {
  byUnit: UnitQuantities[]
  /** Dispatched quantity recorded without an order line on a multi-unit order (can't be attributed). */
  unattributedDispatched: number
}

export function quantitiesByUnit(lines: OrderLineQty[], links: LinkQty[], dispatches: DispatchQty[]): OrderQuantities {
  const unitOfLine = new Map(lines.map((l) => [l.id, normalizeUnit(l.unit)]))
  const byUnit = new Map<string, UnitQuantities>()
  const bucket = (unit: string) => {
    if (!byUnit.has(unit)) byUnit.set(unit, { unit, ordered: 0, produced: 0, dispatched: 0, pending: 0 })
    return byUnit.get(unit)!
  }
  for (const line of lines) bucket(unitOfLine.get(line.id)!).ordered += Number(line.quantityOrdered) || 0
  for (const link of links) {
    const unit = unitOfLine.get(link.orderItemId)
    if (unit) bucket(unit).produced += Number(link.quantity) || 0
  }

  const units = [...byUnit.keys()]
  let unattributedDispatched = 0
  for (const d of dispatches) {
    const qty = Number(d.quantity) || 0
    const unit = d.orderItemId ? unitOfLine.get(d.orderItemId) : units.length === 1 ? units[0] : undefined
    if (unit) bucket(unit).dispatched += qty
    else unattributedDispatched += qty
  }

  const order = (u: string) => (u === 'L' ? 0 : u === 'KG' ? 1 : 2)
  return {
    byUnit: [...byUnit.values()]
      .map((q) => ({ ...q, pending: Math.max(0, q.ordered - q.dispatched) }))
      .sort((a, b) => order(a.unit) - order(b.unit) || a.unit.localeCompare(b.unit)),
    unattributedDispatched,
  }
}

/** Unit as stored on save: L / KG normalised, anything else trimmed and upper-cased. */
export const storedUnit = (raw: string | null | undefined): string => {
  const unit = normalizeUnit(raw)
  return unit === 'Unspecified' ? 'L' : unit
}
