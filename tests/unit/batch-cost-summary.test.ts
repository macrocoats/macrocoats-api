import { describe, expect, it } from 'vitest'
import { updateTransportCostSummary } from '../../src/modules/batches/batchCostSummary.js'

describe('updateTransportCostSummary', () => {
  it('recalculates buffer, production cost, profit and margin while preserving the buffer rate', () => {
    const updated = updateTransportCostSummary({
      rawMaterialCostPerL: 80,
      lossAdjustmentPerL: 5,
      packagingCostPerL: 10,
      transportCostPerL: 5,
      handlingBufferPerL: 10,
      productionCostPerL: 110,
      sellingPricePerL: 200,
      profitPerL: 90,
      profitMargin: 45,
    }, 15)

    expect(updated.transportCostPerL).toBe(15)
    expect(updated.handlingBufferPerL).toBe(11)
    expect(updated.productionCostPerL).toBe(121)
    expect(updated.profitPerL).toBe(79)
    expect(updated.profitMargin).toBe(39.5)
  })

  it('keeps profit values at zero when no selling price is recorded', () => {
    const updated = updateTransportCostSummary({}, 12)
    expect(updated.productionCostPerL).toBe(12)
    expect(updated.profitPerL).toBe(0)
    expect(updated.profitMargin).toBe(0)
  })
})
