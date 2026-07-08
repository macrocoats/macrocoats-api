import { eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  productFormulationVariants,
  formulationVariantComponents,
  inventoryItems,
  companies,
} from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { getAIProvider } from './ai/index.js'
import type {
  OptimizerComponentInput,
  EnrichedComponent,
  HistoricalVariantSummary,
  InventoryMaterialSummary,
  OptimizationContext,
  FinancialImpact,
  AnalyzeResponseData,
  PriceSource,
  StockStatus,
  VariantStatus,
} from './optimizer.types.js'
import type { AnalyzeBody } from './optimizer.schema.js'

// ── Material name normalization ────────────────────────────────────────────
// 'LAE 9' and 'LAE-9' must match the same inventory row / price override.
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[-\s]+/g, ' ')
}

interface InventoryLookup {
  price: number
  unit: string
  stockQty: number | null
  lowStockThreshold: number
}

async function buildPriceContext(priceOverrides: Record<string, number> | undefined) {
  const items = await db.select().from(inventoryItems)

  const invMap = new Map<string, InventoryLookup>()
  for (const item of items) {
    invMap.set(normalizeName(item.material), {
      price:             Number(item.price),
      unit:              item.unit,
      stockQty:          item.stockQty !== null ? Number(item.stockQty) : null,
      lowStockThreshold: item.lowStockThreshold,
    })
  }

  const overrideMap = new Map<string, number>()
  if (priceOverrides) {
    for (const [name, price] of Object.entries(priceOverrides)) {
      overrideMap.set(normalizeName(name), price)
    }
  }

  const inventoryMaterials: InventoryMaterialSummary[] = items.map((item) => ({
    material:          item.material,
    unit:              item.unit,
    price:             Number(item.price),
    stockQty:          item.stockQty !== null ? Number(item.stockQty) : null,
    lowStockThreshold: item.lowStockThreshold,
  }))

  return { invMap, overrideMap, inventoryMaterials }
}

function resolvePrice(
  materialName: string,
  invMap: Map<string, InventoryLookup>,
  overrideMap: Map<string, number>,
): { unitPrice: number | null; priceSource: PriceSource; inv: InventoryLookup | null } {
  const norm = normalizeName(materialName)
  const inv = invMap.get(norm) ?? null

  if (overrideMap.has(norm)) {
    return { unitPrice: overrideMap.get(norm)!, priceSource: 'override', inv }
  }
  if (inv) {
    return { unitPrice: inv.price, priceSource: 'inventory', inv }
  }
  return { unitPrice: null, priceSource: 'unknown', inv: null }
}

function enrichComponents(
  components: OptimizerComponentInput[],
  invMap: Map<string, InventoryLookup>,
  overrideMap: Map<string, number>,
): EnrichedComponent[] {
  const withCost = components.map((c) => {
    const { unitPrice, priceSource, inv } = resolvePrice(c.materialName, invMap, overrideMap)
    const costPerL = c.percentage !== null && unitPrice !== null ? (c.percentage / 100) * unitPrice : 0

    const stockQty = inv?.stockQty ?? null
    let stockStatus: StockStatus
    if (!inv || stockQty === null) {
      stockStatus = 'unknown'
    } else if (stockQty <= 0) {
      stockStatus = 'out'
    } else if (stockQty < inv.lowStockThreshold) {
      stockStatus = 'low'
    } else {
      stockStatus = 'ok'
    }

    return { ...c, unitPrice, priceSource, costPerL, costSharePct: 0, stockQty, stockStatus }
  })

  const totalCost = withCost.reduce((sum, c) => sum + c.costPerL, 0)

  return withCost.map((c) => ({
    ...c,
    costSharePct: totalCost > 0 ? (c.costPerL / totalCost) * 100 : 0,
  }))
}

/** Sum of priced components; null when none of the components have a known price. */
function computeVariantCostPerL(
  components: OptimizerComponentInput[],
  invMap: Map<string, InventoryLookup>,
  overrideMap: Map<string, number>,
): number | null {
  let matchedCount = 0
  let total = 0
  for (const c of components) {
    const { unitPrice } = resolvePrice(c.materialName, invMap, overrideMap)
    if (unitPrice !== null) {
      matchedCount += 1
      if (c.percentage !== null) total += (c.percentage / 100) * unitPrice
    }
  }
  return matchedCount > 0 ? total : null
}

function toOptimizerComponent(row: typeof formulationVariantComponents.$inferSelect): OptimizerComponentInput {
  return {
    materialName: row.materialName,
    percentage:   row.percentage !== null ? Number(row.percentage) : null,
    unit:         row.unit as 'L' | 'Kg',
  }
}

/**
 * Local helper — queries the variant tables directly rather than importing
 * from the formulation-variants module's service (routes/services never
 * import another module's service; the rule applies here too).
 */
async function loadVariantWithComponents(variantId: string) {
  const [variant] = await db
    .select()
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.id, variantId))

  if (!variant) return null

  const comps = await db
    .select()
    .from(formulationVariantComponents)
    .where(eq(formulationVariantComponents.variantId, variantId))

  return {
    variant,
    components: comps.map(toOptimizerComponent),
  }
}

async function loadHistoricalVariants(
  productKey: string,
  excludeVariantId: string | null,
  invMap: Map<string, InventoryLookup>,
  overrideMap: Map<string, number>,
): Promise<HistoricalVariantSummary[]> {
  const variants = await db
    .select()
    .from(productFormulationVariants)
    .where(eq(productFormulationVariants.productKey, productKey))

  const others = variants.filter((v) => v.id !== excludeVariantId)
  if (!others.length) return []

  const variantIds = others.map((v) => v.id)
  const allComponents = await db
    .select()
    .from(formulationVariantComponents)
    .where(inArray(formulationVariantComponents.variantId, variantIds))

  const componentsByVariant = new Map<string, OptimizerComponentInput[]>()
  for (const comp of allComponents) {
    const list = componentsByVariant.get(comp.variantId) ?? []
    list.push(toOptimizerComponent(comp))
    componentsByVariant.set(comp.variantId, list)
  }

  const companyIds = others.map((v) => v.companyId).filter((id): id is string => id !== null)
  const companyMap = new Map<string, string>()
  if (companyIds.length) {
    const cos = await db
      .select({ id: companies.id, displayName: companies.displayName })
      .from(companies)
      .where(inArray(companies.id, companyIds))
    for (const co of cos) companyMap.set(co.id, co.displayName)
  }

  return others.map((v) => {
    const comps = componentsByVariant.get(v.id) ?? []
    return {
      variantId:          v.id,
      variantName:        v.variantName,
      status:             v.status as VariantStatus,
      companyDisplayName: v.companyId ? (companyMap.get(v.companyId) ?? null) : null,
      costPerL:           computeVariantCostPerL(comps, invMap, overrideMap),
      components:         comps,
    }
  })
}

/**
 * Runs the AI Formulation Optimizer analysis.
 *
 * IMPORTANT: this is read-only. It never mutates an existing variant's
 * components — the AI only recommends; accepted recommendations are
 * persisted only as NEW rows via POST /formulation-variants.
 *
 * Return contract: `null` when a `variantId` was given but no such variant
 * exists (route → 404).
 */
export async function analyzeFormulation(body: AnalyzeBody): Promise<AnalyzeResponseData | null> {
  const variantId = body.variantId ?? null
  let variantName: string | null = null
  let baseComponents: OptimizerComponentInput[] = []

  if (variantId) {
    const loaded = await loadVariantWithComponents(variantId)
    if (!loaded) return null
    variantName    = loaded.variant.variantName
    baseComponents = loaded.components
  }

  const components: OptimizerComponentInput[] =
    body.components && body.components.length > 0 ? body.components : baseComponents

  const { invMap, overrideMap, inventoryMaterials } = await buildPriceContext(body.priceOverrides)

  const enrichedComponents = enrichComponents(components, invMap, overrideMap)
  const currentCostPerL = enrichedComponents.reduce((sum, c) => sum + c.costPerL, 0)

  const historicalVariants = await loadHistoricalVariants(body.productKey, variantId, invMap, overrideMap)

  const ctx: OptimizationContext = {
    productKey: body.productKey,
    variantId,
    variantName,
    components: enrichedComponents,
    goals: body.goals as OptimizationContext['goals'],
    targets: {
      sellingPricePerL: body.targets?.sellingPricePerL ?? null,
      profitMarginPct:  body.targets?.profitMarginPct ?? null,
      ph:               body.targets?.ph ?? null,
      specificGravity:  body.targets?.specificGravity ?? null,
      annualVolumeL:    body.targets?.annualVolumeL ?? null,
    },
    performanceNotes: body.performanceNotes ?? null,
    currentCostPerL,
    historicalVariants,
    inventoryMaterials,
  }

  const provider = getAIProvider(env.AI_PROVIDER)
  const result = await provider.generateRecommendations(ctx)

  // ── Financial impact (computed here, never by the AI layer) ──────────────
  const recommendedEnriched = enrichComponents(result.recommendedFormulation, invMap, overrideMap)
  const optimizedCostPerL = recommendedEnriched.reduce((sum, c) => sum + c.costPerL, 0)
  const savingsPerL = currentCostPerL - optimizedCostPerL

  const sellingPricePerL = body.targets?.sellingPricePerL ?? null
  const currentProfitPerL   = sellingPricePerL !== null ? sellingPricePerL - currentCostPerL   : null
  const optimizedProfitPerL = sellingPricePerL !== null ? sellingPricePerL - optimizedCostPerL : null
  const currentMarginPct = sellingPricePerL !== null && sellingPricePerL > 0 && currentProfitPerL !== null
    ? (currentProfitPerL / sellingPricePerL) * 100
    : null
  const newMarginPct = sellingPricePerL !== null && sellingPricePerL > 0 && optimizedProfitPerL !== null
    ? (optimizedProfitPerL / sellingPricePerL) * 100
    : null

  const annualVolumeL = body.targets?.annualVolumeL ?? null
  const annualSavings = annualVolumeL !== null ? savingsPerL * annualVolumeL : null

  const financialImpact: FinancialImpact = {
    currentCostPerL,
    optimizedCostPerL,
    savingsPerL,
    currentProfitPerL,
    optimizedProfitPerL,
    currentMarginPct,
    newMarginPct,
    annualSavings,
  }

  const highCostMaterials = enrichedComponents.filter((c) => c.costSharePct > 25)

  const inventoryWarnings = enrichedComponents
    .filter((c) => c.stockStatus === 'out' || c.stockStatus === 'low')
    .map((c) =>
      c.stockStatus === 'out'
        ? `${c.materialName} is out of stock.`
        : `${c.materialName} is running low on stock.`,
    )

  return {
    analysis: {
      totalCostPerL:       currentCostPerL,
      componentBreakdown:  enrichedComponents,
      highCostMaterials,
      inventoryWarnings,
      historicalVariants,
    },
    recommendations:        result.recommendations,
    recommendedFormulation: result.recommendedFormulation,
    financialImpact,
    notes:      result.notes,
    provider:   result.provider,
    generatedAt: new Date().toISOString(),
  }
}
