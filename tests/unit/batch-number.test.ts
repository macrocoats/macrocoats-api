import { describe, expect, it } from 'vitest'
import { batchCompanyCode } from '../../src/utils/batchNumber.js'

describe('batchCompanyCode', () => {
  it('skips special characters and uses the next letter', () => {
    expect(batchCompanyCode('L&T Valves Limited')).toBe('LT')
    expect(batchCompanyCode('L & T Valves')).toBe('LT')
    expect(batchCompanyCode('  M/s. Rane')).toBe('MS')
  })

  it('leaves ordinary names as they were', () => {
    expect(batchCompanyCode('Rane Madras')).toBe('RA')
    expect(batchCompanyCode('Macro Coats')).toBe('MA')
    expect(batchCompanyCode('3M India')).toBe('3M')
  })

  it('still gives a code when nothing usable is left', () => {
    expect(batchCompanyCode('A')).toBe('A')
    expect(batchCompanyCode('&&')).toBe('XX')
  })
})
