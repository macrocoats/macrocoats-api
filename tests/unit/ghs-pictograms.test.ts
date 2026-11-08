import { describe, expect, it } from 'vitest'
import { mixturePictograms, pictogramsForHCodes } from '../../src/utils/ghsPictograms.js'
import { deriveHazardAggregate } from '../../src/modules/document-sanitization/document-sanitization.service.js'
import { normalizeIngredientName } from '../../src/modules/hazard-profiles/hazard-profiles.normalize.js'
import type { HazardProfileRow } from '../../src/modules/hazard-profiles/hazard-profiles.service.js'

const sorted = (s: Iterable<string>) => [...s].sort()

describe('pictogramsForHCodes', () => {
  it('maps codes to profile pictogram ids', () => {
    expect(sorted(pictogramsForHCodes(['H225', 'H336', 'H411']))).toEqual(['environment', 'flammable', 'irritant'])
  })
  it('gives H412/H413/H320 no pictogram', () => {
    expect(pictogramsForHCodes(['H412', 'H413', 'H320']).size).toBe(0)
  })
  it('drops the exclamation mark under the skull', () => {
    expect(sorted(pictogramsForHCodes(['H272', 'H301', 'H319', 'H400']))).toEqual(['environment', 'oxidiser', 'skull'])
  })
  it('drops GHS07 for H315/H319 under H314/H318 but not under H290 alone', () => {
    expect(sorted(pictogramsForHCodes(['H314', 'H319']))).toEqual(['corrosive'])
    expect(sorted(pictogramsForHCodes(['H314', 'H335']))).toEqual(['corrosive', 'irritant'])
    expect(sorted(pictogramsForHCodes(['H290', 'H315', 'H319']))).toEqual(['corrosive', 'irritant'])
  })
  it('drops GHS07 for H317 under H334', () => {
    expect(sorted(pictogramsForHCodes(['H334', 'H317']))).toEqual(['healthhazard'])
  })
  it('splits combined and lower-case codes', () => {
    expect(sorted(pictogramsForHCodes(['h314 + H318']))).toEqual(['corrosive'])
  })
})

describe('mixturePictograms', () => {
  it('keeps stored pictograms from profiles without codes, and still lets the skull win', () => {
    expect(sorted(mixturePictograms(['H301'], ['irritant', 'flammable']))).toEqual(['flammable', 'skull'])
  })
})

const profile = (name: string, codes: string[], pictograms: string[], threshold = 1) => ({
  canonicalName: name, displayName: name, thresholdPercent: threshold, pictograms,
  hazardClassifications: codes.map((code) => ({ class: `cls-${code}`, category: '1', tagType: code === 'H301' ? 'danger' : 'warning', hStatementCode: code, hStatementText: code, pStatementCodes: [] })),
}) as unknown as HazardProfileRow

const mapOf = (...profiles: HazardProfileRow[]) =>
  new Map(profiles.map((p) => [normalizeIngredientName((p as { canonicalName: string }).canonicalName), p]))

describe('deriveHazardAggregate pictograms', () => {
  it('derives mixture pictograms from H-codes instead of unioning stored ones', () => {
    const map = mapOf(
      profile('sodium nitrite', ['H272', 'H301', 'H400'], ['oxidiser', 'skull', 'environment']),
      profile('surfactant', ['H319', 'H412'], ['irritant', 'environment']),
    )
    const agg = deriveHazardAggregate([
      { materialName: 'sodium nitrite', percentage: 20 },
      { materialName: 'surfactant', percentage: 5 },
      { materialName: 'water', percentage: null },
    ], map)
    expect(sorted(agg.pictograms)).toEqual(['environment', 'oxidiser', 'skull'])
    expect(agg.signalWord).toBe('DANGER')
  })
  it('ignores ingredients below their threshold', () => {
    const map = mapOf(profile('ipa', ['H225', 'H319'], ['flammable', 'irritant'], 10))
    expect(deriveHazardAggregate([{ materialName: 'ipa', percentage: 5 }], map).pictograms).toEqual([])
  })
  it('falls back to stored pictograms for a profile with no H-codes', () => {
    const map = mapOf(profile('legacy oil', [], ['flammable']))
    expect(deriveHazardAggregate([{ materialName: 'legacy oil', percentage: 50 }], map).pictograms).toEqual(['flammable'])
  })
})
