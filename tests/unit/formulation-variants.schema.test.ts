import { describe, expect, it } from 'vitest'
import { CORRUCUT_500_FORMULA_OVERRIDES } from '../../src/seed/corrucut500FormulaOverrides.data.js'
import { formulaOverridesSchema, updateVariantSchema } from '../../src/modules/formulation-variants/formulation-variants.schema.js'

describe('formulaOverridesSchema', () => {
  it('accepts every seeded CORROCUT 500 preparation method', () => {
    expect(Object.keys(CORRUCUT_500_FORMULA_OVERRIDES)).toHaveLength(6)
    for (const override of Object.values(CORRUCUT_500_FORMULA_OVERRIDES)) {
      expect(formulaOverridesSchema.parse(override)).toEqual(override)
    }
  })

  it('rejects unrecognised fields and invalid preparation steps', () => {
    expect(() => formulaOverridesSchema.parse({
      preparationStatus: 'draft_review_required',
      preparation: [{ step: 0, title: 'Mix', detail: 'Mix.', unexpected: true }],
    })).toThrow()
  })
})

describe('process tag validation', () => {
  it('accepts controlled tags and rejects unknown classifications', () => {
    expect(updateVariantSchema.parse({ processTags: ['cleaning', 'phosphating'] }).processTags).toEqual(['cleaning', 'phosphating'])
    expect(() => updateVariantSchema.parse({ processTags: ['cleaning', 'unknown-process'] })).toThrow()
  })
})
