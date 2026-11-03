import { describe, expect, it } from 'vitest'
import { toInventoryQuantity } from '../../src/utils/materialQuantity.js'

describe('toInventoryQuantity', () => {
  it('leaves matching units alone, whatever their spelling', () => {
    expect(toInventoryQuantity(10, 'kg', 'Kg', null)).toBe(10)
    expect(toInventoryQuantity(10, 'Ltr', 'L', null)).toBe(10)
  })

  it('converts litres to kg and kg to litres with the density', () => {
    expect(toInventoryQuantity(100, 'L', 'Kg', 1.7)).toBeCloseTo(170)
    expect(toInventoryQuantity(170, 'Kg', 'L', 1.7)).toBeCloseTo(100)
  })

  it('refuses when the units differ and there is no usable density', () => {
    expect(toInventoryQuantity(10, 'L', 'Kg', null)).toBeNull()
    expect(toInventoryQuantity(10, 'L', 'Kg', 0)).toBeNull()
  })

  it('refuses a unit it does not know', () => {
    expect(toInventoryQuantity(10, 'drums', 'Kg', 1)).toBeNull()
  })

  it('reads a row with no unit as already in the stocked unit', () => {
    expect(toInventoryQuantity(10, '', 'Kg', null)).toBe(10)
  })
})
