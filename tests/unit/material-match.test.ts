import { describe, it, expect } from 'vitest'
import { findMaterialMatch, isWaterMaterial } from '../../src/utils/materialMatch.js'

// Same cases as safteyDataSheet/src/utils/formulationCalc.test.js — the two matchers must agree.
describe('findMaterialMatch', () => {
  const inventory = [
    'Exxol D60', 'IPA (Isopropyl Alcohol)', 'Ammonium Hydroxide (25–30%)', 'Hydroxylamine Sulfate',
    'Sodium Petroleum Sulfonate', 'Calcium Petroleum Sulfonate', 'Mineral Turpentine Oil (MTO)',
    'LAE-7', 'LAE-9 (Lauryl Alcohol Ethoxylate)', 'Citric Acid', 'Borax Powder',
    'Silicone Defoamer', 'Non-silicone Defoamer', 'Alphox 200 (Non-ionic Surfactant)',
    'Ethanol', 'TEA (Triethanolamine)', 'Propylene Glycol (PG)',
    'Propylene Glycol Methyl Ether (Dowanol PM)', 'Dipropylene Glycol Methyl Ether (Dowanol DPM)',
  ]
  const match = (name: string) => findMaterialMatch(name, inventory)

  it('unifies supplier and UK/US spellings', () => {
    expect(match('Exxsol D60')).toBe('Exxol D60')
    expect(match('Hydroxylamine Sulphate')).toBe('Hydroxylamine Sulfate')
  })

  it('ignores word order and brackets', () => {
    expect(match('Isopropyl Alcohol (IPA)')).toBe('IPA (Isopropyl Alcohol)')
    expect(match('Petroleum Sulfonate (Sodium Salt)')).toBe('Sodium Petroleum Sulfonate')
    expect(match('Triethanolamine (TEA)')).toBe('TEA (Triethanolamine)')
  })

  it('matches a more specific name to its general Inventory item', () => {
    expect(match('Alcohol Ethoxylate (LAE-7)')).toBe('LAE-7')
    expect(match('Citric Acid (solid)')).toBe('Citric Acid')
    expect(match('Ammonium Hydroxide (25%)')).toBe('Ammonium Hydroxide (25–30%)')
    expect(match('MTO')).toBe('Mineral Turpentine Oil (MTO)')
    expect(match('Borax')).toBe('Borax Powder')
    expect(match('Alphox 200')).toBe('Alphox 200 (Non-ionic Surfactant)')
  })

  it('never matches a different chemical that merely shares letters or words', () => {
    expect(match('Propylene Glycol')).toBe('Propylene Glycol (PG)')
    expect(match('Silicone-Free Defoamer')).toBe('Non-silicone Defoamer')
    expect(match('Non Silicone Defoamer')).toBe('Non-silicone Defoamer')
    expect(match('Silicone Defoamer')).toBe('Silicone Defoamer')
    expect(findMaterialMatch('Propylene Glycol', inventory.filter((n) => n !== 'Propylene Glycol (PG)'))).toBeNull()
    expect(findMaterialMatch('TEA (Triethanolamine)', ['Ethanol'])).toBeNull()
  })

  it('treats water rows as water', () => {
    expect(isWaterMaterial('DM Water')).toBe(true)
    expect(isWaterMaterial('Water (DI/RO)')).toBe(true)
    expect(isWaterMaterial('Waterglass Sodium Silicate')).toBe(false)
  })
})
