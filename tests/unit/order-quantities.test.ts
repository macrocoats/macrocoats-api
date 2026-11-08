import { describe, expect, it } from 'vitest'
import { quantitiesByUnit, storedUnit } from '../../src/utils/orderQuantities.js'

describe('quantitiesByUnit', () => {
  it('keeps litres and kilograms apart', () => {
    const r = quantitiesByUnit(
      [{ id: 'a', unit: 'L', quantityOrdered: 200 }, { id: 'b', unit: 'kgs', quantityOrdered: 50 }, { id: 'c', unit: 'Ltr', quantityOrdered: 100 }],
      [{ orderItemId: 'a', quantity: 200 }, { orderItemId: 'b', quantity: 20 }],
      [{ orderItemId: 'a', quantity: 150 }, { orderItemId: 'b', quantity: 20 }],
    )
    expect(r.byUnit).toEqual([
      { unit: 'L', ordered: 300, produced: 200, dispatched: 150, pending: 150 },
      { unit: 'KG', ordered: 50, produced: 20, dispatched: 20, pending: 30 },
    ])
    expect(r.unattributedDispatched).toBe(0)
  })

  it('attributes a dispatch without a line to the only unit, otherwise reports it separately', () => {
    expect(quantitiesByUnit([{ id: 'a', unit: 'L', quantityOrdered: 100 }], [], [{ orderItemId: null, quantity: 40 }]).byUnit[0].dispatched).toBe(40)
    const mixed = quantitiesByUnit(
      [{ id: 'a', unit: 'L', quantityOrdered: 100 }, { id: 'b', unit: 'KG', quantityOrdered: 10 }],
      [],
      [{ orderItemId: null, quantity: 5 }],
    )
    expect(mixed.unattributedDispatched).toBe(5)
    expect(mixed.byUnit.every((u) => u.dispatched === 0)).toBe(true)
  })

  it('never reports negative pending (over-dispatch)', () => {
    expect(quantitiesByUnit([{ id: 'a', unit: 'L', quantityOrdered: 100 }], [], [{ orderItemId: 'a', quantity: 120 }]).byUnit[0].pending).toBe(0)
  })
})

describe('storedUnit', () => {
  it('normalises common spellings and defaults blanks to L', () => {
    expect(storedUnit('kg')).toBe('KG')
    expect(storedUnit(' Litres ')).toBe('L')
    expect(storedUnit('')).toBe('L')
    expect(storedUnit('drum')).toBe('DRUM')
  })
})
