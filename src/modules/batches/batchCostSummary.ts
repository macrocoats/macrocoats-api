export function updateTransportCostSummary(current: Record<string, unknown>, transportCostPerL: number) {
  const rawPerL = Number(current.rawMaterialCostPerL ?? 0)
  const lossPerL = Number(current.lossAdjustmentPerL ?? 0)
  const packagingPerL = Number(current.packagingCostPerL ?? 0)
  const oldTransportPerL = Number(current.transportCostPerL ?? 0)
  const oldBufferPerL = Number(current.handlingBufferPerL ?? 0)
  const oldSubtotalPerL = rawPerL + lossPerL + packagingPerL + oldTransportPerL
  const bufferRate = oldSubtotalPerL > 0 ? oldBufferPerL / oldSubtotalPerL : 0
  const newSubtotalPerL = rawPerL + lossPerL + packagingPerL + transportCostPerL
  const handlingBufferPerL = newSubtotalPerL * bufferRate
  const productionCostPerL = newSubtotalPerL + handlingBufferPerL
  const sellingPricePerL = Number(current.sellingPricePerL ?? 0)
  const profitPerL = sellingPricePerL > 0 ? sellingPricePerL - productionCostPerL : 0
  const profitMargin = sellingPricePerL > 0 ? (profitPerL / sellingPricePerL) * 100 : 0
  return { ...current, transportCostPerL, handlingBufferPerL, productionCostPerL, profitPerL, profitMargin }
}
