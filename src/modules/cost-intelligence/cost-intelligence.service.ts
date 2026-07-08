import { eq, and, ilike, gte, lte, desc, count, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { batches, inventoryItems } from '../../db/schema/index.js'
import type {
  OverviewQuery,
  TrendsQuery,
  BatchCostQuery,
  ProfitabilityQuery,
  ComparisonQuery,
} from './cost-intelligence.schema.js'

// ── Shapes mirroring product_documents-adjacent JSONB snapshots ─────────────
// (batches.formulationSnapshot / batches.costSummary — see batches.schema.ts)

interface FormulationComponent {
  name:             string
  percentage:       number
  quantityUsed:     number
  unit:             string
  materialRate:     number
  costContribution: number
}

interface FormulationSnapshot {
  components: FormulationComponent[]
}

interface CostSummary {
  rawMaterialCostPerL: number
  lossAdjustmentPerL:  number
  transportCostPerL:   number
  handlingBufferPerL:  number
  packagingCostPerL?:  number
  productionCostPerL:  number
  sellingPricePerL:    number
  profitPerL:          number
  profitMargin:        number
}

type BatchRow = typeof batches.$inferSelect

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Fuzzy-normalizes a material name for cross-source matching (batch snapshot
 * component names vs inventory_items.material): lowercase, trim, collapse
 * runs of hyphens/underscores/whitespace to a single space.
 * Mirrors the frontend normalization convention.
 */
export function normalizeMaterialName(name: string): string {
  return name.trim().toLowerCase().replace(/[-_\s]+/g, ' ')
}

/** Renders a number without forcing trailing zeroes for whole values (₹110 vs ₹123.2). */
function formatMoney(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function pct(curr: number, prev: number): number | null {
  return prev !== 0 ? ((curr - prev) / prev) * 100 : null
}

interface CommonFilters {
  productCode?: string
  variantId?:   string
  companyName?: string
  dateFrom?:    string
  dateTo?:      string
}

function buildBatchConditions(f: CommonFilters): SQL[] {
  const conditions: SQL[] = []
  if (f.productCode) conditions.push(eq(batches.productCode, f.productCode))
  if (f.variantId)   conditions.push(eq(batches.variantId, f.variantId))
  if (f.companyName) conditions.push(ilike(batches.companyName, `%${f.companyName}%`))
  if (f.dateFrom)    conditions.push(gte(batches.productionDate, f.dateFrom))
  if (f.dateTo)      conditions.push(lte(batches.productionDate, f.dateTo))
  return conditions
}

// ── 1. GET /overview ─────────────────────────────────────────────────────

export async function getOverview(query: OverviewQuery) {
  const conditions = buildBatchConditions(query)
  if (query.batchNumber) conditions.push(eq(batches.batchNumber, query.batchNumber))

  const where = conditions.length ? and(...conditions) : undefined

  const [row] = await db
    .select()
    .from(batches)
    .where(where)
    .orderBy(desc(batches.createdAt))
    .limit(1)

  if (!row) return null

  const costSummary = row.costSummary as CostSummary
  const components  = ((row.formulationSnapshot as FormulationSnapshot)?.components ?? [])

  const materialCost = components.reduce((sum, c) => sum + (c.costContribution ?? 0), 0)

  const breakdown = components
    .map((c) => ({
      name:             c.name,
      percentage:       c.percentage,
      quantityUsed:     c.quantityUsed,
      unit:             c.unit,
      materialRate:     c.materialRate,
      costContribution: c.costContribution,
      contributionPct:  materialCost > 0 ? (c.costContribution / materialCost) * 100 : 0,
    }))
    .sort((a, b) => b.costContribution - a.costContribution)

  const batchSize = Number(row.batchSize)
  const batchCost = costSummary.productionCostPerL * batchSize
  const revenue   = costSummary.sellingPricePerL * batchSize

  return {
    batch: {
      batchNumber:    row.batchNumber,
      productCode:    row.productCode,
      variantId:      row.variantId ?? null,
      variantName:    row.variantName ?? null,
      companyName:    row.companyName,
      batchSize,
      productionDate: row.productionDate,
      batchType:      row.batchType,
      createdAt:      row.createdAt.toISOString(),
    },
    costSummary: {
      rawMaterialCostPerL: costSummary.rawMaterialCostPerL,
      lossAdjustmentPerL:  costSummary.lossAdjustmentPerL,
      transportCostPerL:   costSummary.transportCostPerL,
      handlingBufferPerL:  costSummary.handlingBufferPerL,
      packagingCostPerL:   costSummary.packagingCostPerL ?? null,
      productionCostPerL:  costSummary.productionCostPerL,
      sellingPricePerL:    costSummary.sellingPricePerL,
      profitPerL:          costSummary.profitPerL,
      profitMargin:        costSummary.profitMargin,
    },
    breakdown,
    totals: {
      materialCost,
      batchCost,
      revenue,
      grossProfit:  revenue - batchCost,
      profitMargin: costSummary.profitMargin,
    },
  }
}

// ── 2. GET /trends ────────────────────────────────────────────────────────

const GRANULARITY_MAP = { daily: 'day', weekly: 'week', monthly: 'month' } as const

interface TrendRow {
  [key: string]: unknown
  period:                 string
  batchCount:             string
  avgMaterialCostPerL:    string | null
  avgProductionCostPerL:  string | null
  avgProfitPerL:          string | null
  totalCost:              string | null
  totalRevenue:           string | null
}

export async function getTrends(query: TrendsQuery) {
  const granularity = GRANULARITY_MAP[query.granularity ?? 'monthly']

  const conditions: SQL[] = []
  if (query.productCode) conditions.push(sql`product_code = ${query.productCode}`)
  if (query.variantId)   conditions.push(sql`variant_id = ${query.variantId}`)
  if (query.companyName) conditions.push(sql`company_name ILIKE ${`%${query.companyName}%`}`)
  if (query.dateFrom)    conditions.push(sql`production_date >= ${query.dateFrom}`)
  if (query.dateTo)      conditions.push(sql`production_date <= ${query.dateTo}`)

  const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

  const rows = await db.execute<TrendRow>(sql`
    SELECT
      date_trunc(${granularity}, production_date::date) AS "period",
      COUNT(*) AS "batchCount",
      AVG((cost_summary->>'rawMaterialCostPerL')::numeric + (cost_summary->>'lossAdjustmentPerL')::numeric) AS "avgMaterialCostPerL",
      AVG((cost_summary->>'productionCostPerL')::numeric) AS "avgProductionCostPerL",
      AVG((cost_summary->>'profitPerL')::numeric) FILTER (WHERE (cost_summary->>'sellingPricePerL')::numeric > 0) AS "avgProfitPerL",
      SUM((cost_summary->>'productionCostPerL')::numeric * batch_size::numeric) AS "totalCost",
      SUM((cost_summary->>'sellingPricePerL')::numeric * batch_size::numeric) AS "totalRevenue"
    FROM batches
    ${whereClause}
    GROUP BY "period"
    ORDER BY "period" ASC
  `)

  const points = rows.map((r) => {
    const totalCost    = Number(r.totalCost ?? 0)
    const totalRevenue = Number(r.totalRevenue ?? 0)
    return {
      period:                 new Date(r.period).toISOString(),
      batchCount:             Number(r.batchCount),
      avgMaterialCostPerL:    r.avgMaterialCostPerL !== null ? Number(r.avgMaterialCostPerL) : null,
      avgProductionCostPerL:  r.avgProductionCostPerL !== null ? Number(r.avgProductionCostPerL) : null,
      avgProfitPerL:          r.avgProfitPerL !== null ? Number(r.avgProfitPerL) : null,
      totalCost,
      totalRevenue,
      totalProfit: totalRevenue - totalCost,
    }
  })

  return { points }
}

// ── 3. GET /batches ───────────────────────────────────────────────────────

export async function listBatchCosts(query: BatchCostQuery) {
  const conditions = buildBatchConditions(query)
  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(batches).where(where)

  const rows = await db
    .select()
    .from(batches)
    .where(where)
    .orderBy(desc(batches.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit)

  const batchesOut = rows.map((row: BatchRow) => {
    const cs        = row.costSummary as CostSummary
    const batchSize = Number(row.batchSize)

    const materialCost  = (cs.rawMaterialCostPerL + cs.lossAdjustmentPerL) * batchSize
    const packagingCost = cs.packagingCostPerL != null ? cs.packagingCostPerL * batchSize : null
    const transportCost = cs.transportCostPerL * batchSize
    const handlingCost  = cs.handlingBufferPerL * batchSize
    const totalCost     = cs.productionCostPerL * batchSize
    const revenue       = cs.sellingPricePerL * batchSize

    return {
      batchNumber:    row.batchNumber,
      productCode:    row.productCode,
      variantName:    row.variantName ?? null,
      companyName:    row.companyName,
      batchSize,
      productionDate: row.productionDate,
      batchType:      row.batchType,
      materialCost,
      packagingCost,
      transportCost,
      handlingCost,
      totalCost,
      revenue,
      profit:       revenue - totalCost,
      profitMargin: cs.profitMargin,
    }
  })

  return { batches: batchesOut, total, page: query.page, limit: query.limit }
}

// ── 4. GET /materials ─────────────────────────────────────────────────────

interface MaterialAggRow {
  [key: string]: unknown
  normName:          string
  material:          string
  unit:              string | null
  lastUsedPrice:     string
  lastUsedDate:      string
  previousUsedPrice: string | null
  previousUsedDate:  string | null
  avgPrice:          string
  highPrice:         string
  lowPrice:          string
  usageCount:         string
}

interface MaterialAgg {
  material:          string
  unit:              string | null
  lastUsedPrice:     number
  lastUsedDate:       Date
  previousUsedPrice: number | null
  previousUsedDate:  Date | null
  avgPrice:          number
  highPrice:         number
  lowPrice:          number
  usageCount:        number
}

/**
 * Merges SQL groups (grouped by plain lower(name)) that collapse to the same
 * key under the stronger `normalizeMaterialName` normalization (e.g. 'LAE 9'
 * vs 'LAE-9'). Last/previous usage are re-derived from the top-2 candidates
 * across both groups (each group's own last + previous are sufficient
 * candidates — the true global 2nd-most-recent date is always among them).
 */
function mergeMaterialGroups(rows: MaterialAgg[]): Map<string, MaterialAgg> {
  const merged = new Map<string, MaterialAgg>()

  for (const row of rows) {
    const key = normalizeMaterialName(row.material)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, { ...row })
      continue
    }

    const totalCount = existing.usageCount + row.usageCount
    const avgPrice   = (existing.avgPrice * existing.usageCount + row.avgPrice * row.usageCount) / totalCount
    const highPrice  = Math.max(existing.highPrice, row.highPrice)
    const lowPrice   = Math.min(existing.lowPrice, row.lowPrice)

    const candidates: { price: number; date: Date }[] = [
      { price: existing.lastUsedPrice, date: existing.lastUsedDate },
      { price: row.lastUsedPrice, date: row.lastUsedDate },
    ]
    if (existing.previousUsedPrice != null && existing.previousUsedDate) {
      candidates.push({ price: existing.previousUsedPrice, date: existing.previousUsedDate })
    }
    if (row.previousUsedPrice != null && row.previousUsedDate) {
      candidates.push({ price: row.previousUsedPrice, date: row.previousUsedDate })
    }
    candidates.sort((a, b) => b.date.getTime() - a.date.getTime())
    const [top, second] = candidates

    const mostRecentGroup = existing.lastUsedDate >= row.lastUsedDate ? existing : row

    merged.set(key, {
      material:          mostRecentGroup.material,
      unit:              mostRecentGroup.unit,
      lastUsedPrice:     top.price,
      lastUsedDate:      top.date,
      previousUsedPrice: second ? second.price : null,
      previousUsedDate:  second ? second.date : null,
      avgPrice,
      highPrice,
      lowPrice,
      usageCount: totalCount,
    })
  }

  return merged
}

export async function getMaterials() {
  const raw = await db.execute<MaterialAggRow>(sql`
    WITH exploded AS (
      SELECT
        b.created_at,
        lower(comp->>'name')  AS norm_name,
        comp->>'name'         AS display_name,
        (comp->>'materialRate')::numeric AS material_rate,
        comp->>'unit'         AS unit
      FROM batches b, jsonb_array_elements(b.formulation_snapshot->'components') AS comp
      WHERE (comp->>'materialRate') IS NOT NULL AND (comp->>'name') IS NOT NULL
    ), ranked AS (
      SELECT
        exploded.*,
        ROW_NUMBER() OVER (PARTITION BY norm_name ORDER BY created_at DESC) AS rn
      FROM exploded
    )
    SELECT
      norm_name AS "normName",
      MAX(display_name)  FILTER (WHERE rn = 1) AS "material",
      MAX(unit)          FILTER (WHERE rn = 1) AS "unit",
      MAX(material_rate) FILTER (WHERE rn = 1) AS "lastUsedPrice",
      MAX(created_at)    FILTER (WHERE rn = 1) AS "lastUsedDate",
      MAX(material_rate) FILTER (WHERE rn = 2) AS "previousUsedPrice",
      MAX(created_at)    FILTER (WHERE rn = 2) AS "previousUsedDate",
      AVG(material_rate) AS "avgPrice",
      MAX(material_rate) AS "highPrice",
      MIN(material_rate) AS "lowPrice",
      COUNT(*)            AS "usageCount"
    FROM ranked
    GROUP BY norm_name
  `)

  const groups: MaterialAgg[] = raw.map((r) => ({
    material:          r.material,
    unit:              r.unit,
    lastUsedPrice:     Number(r.lastUsedPrice),
    lastUsedDate:      new Date(r.lastUsedDate),
    previousUsedPrice: r.previousUsedPrice !== null ? Number(r.previousUsedPrice) : null,
    previousUsedDate:  r.previousUsedDate !== null ? new Date(r.previousUsedDate) : null,
    avgPrice:          Number(r.avgPrice),
    highPrice:         Number(r.highPrice),
    lowPrice:          Number(r.lowPrice),
    usageCount:        Number(r.usageCount),
  }))

  const merged = mergeMaterialGroups(groups)

  const inventoryRows = await db
    .select({ material: inventoryItems.material, price: inventoryItems.price })
    .from(inventoryItems)

  const inventoryByNorm = new Map<string, number>()
  for (const item of inventoryRows) {
    inventoryByNorm.set(normalizeMaterialName(item.material), Number(item.price))
  }

  const materials = Array.from(merged.values()).map((m) => {
    const currentPrice = inventoryByNorm.get(normalizeMaterialName(m.material)) ?? null

    const trendPct = m.previousUsedPrice != null && m.previousUsedPrice !== 0
      ? pct(m.lastUsedPrice, m.previousUsedPrice)
      : null

    const driftPct = currentPrice != null && m.lastUsedPrice !== 0
      ? pct(currentPrice, m.lastUsedPrice)
      : null

    return {
      material:          m.material,
      unit:              m.unit,
      currentPrice,
      lastUsedPrice:     m.lastUsedPrice,
      lastUsedDate:      m.lastUsedDate.toISOString(),
      previousUsedPrice: m.previousUsedPrice,
      avgPrice:          m.avgPrice,
      highPrice:         m.highPrice,
      lowPrice:          m.lowPrice,
      trendPct,
      driftPct,
      usageCount: m.usageCount,
    }
  })

  materials.sort((a, b) => {
    const dateDiff = new Date(b.lastUsedDate).getTime() - new Date(a.lastUsedDate).getTime()
    if (dateDiff !== 0) return dateDiff
    return a.material.localeCompare(b.material)
  })

  return { materials }
}

// ── 5. GET /alerts ────────────────────────────────────────────────────────

type AlertType     = 'price-increase' | 'price-decrease' | 'low-margin' | 'price-drift'
type AlertSeverity = 'info' | 'warning' | 'critical'

interface Alert {
  id:          string
  type:        AlertType
  severity:    AlertSeverity
  message:     string
  material?:   string
  productCode?: string
  batchNumber?: string
  changePct?:  number | null
  date:        string
}

interface LatestBatchByProductRow {
  [key: string]: unknown
  productCode: string
  batchNumber: string
  costSummary: CostSummary
  createdAt:   string
}

export async function getAlerts() {
  const { materials } = await getMaterials()
  const alerts: Alert[] = []

  for (const m of materials) {
    if (m.trendPct != null) {
      if (m.trendPct >= 5) {
        alerts.push({
          id:        `price-increase-${normalizeMaterialName(m.material)}`,
          type:      'price-increase',
          severity:  m.trendPct >= 15 ? 'critical' : 'warning',
          message:   `${m.material} increased ${m.trendPct.toFixed(1)}% (₹${formatMoney(m.previousUsedPrice as number)} → ₹${formatMoney(m.lastUsedPrice)})`,
          material:  m.material,
          changePct: m.trendPct,
          date:      m.lastUsedDate,
        })
      } else if (m.trendPct <= -5) {
        alerts.push({
          id:        `price-decrease-${normalizeMaterialName(m.material)}`,
          type:      'price-decrease',
          severity:  'info',
          message:   `${m.material} decreased ${Math.abs(m.trendPct).toFixed(1)}% (₹${formatMoney(m.previousUsedPrice as number)} → ₹${formatMoney(m.lastUsedPrice)})`,
          material:  m.material,
          changePct: m.trendPct,
          date:      m.lastUsedDate,
        })
      }
    }

    if (m.driftPct != null && Math.abs(m.driftPct) >= 10) {
      alerts.push({
        id:        `price-drift-${normalizeMaterialName(m.material)}`,
        type:      'price-drift',
        severity:  'info',
        message:   `${m.material} inventory price ₹${formatMoney(m.currentPrice as number)} differs ${Math.abs(m.driftPct).toFixed(1)}% from last batch rate ₹${formatMoney(m.lastUsedPrice)}`,
        material:  m.material,
        changePct: m.driftPct,
        date:      m.lastUsedDate,
      })
    }
  }

  const latestByProduct = await db.execute<LatestBatchByProductRow>(sql`
    SELECT DISTINCT ON (product_code)
      product_code AS "productCode",
      batch_number AS "batchNumber",
      cost_summary AS "costSummary",
      created_at   AS "createdAt"
    FROM batches
    WHERE (cost_summary->>'sellingPricePerL')::numeric > 0
    ORDER BY product_code, created_at DESC
  `)

  for (const row of latestByProduct) {
    const margin = row.costSummary.profitMargin
    if (margin < 15) {
      alerts.push({
        id:          `low-margin-${row.productCode}-${row.batchNumber}`,
        type:        'low-margin',
        severity:    margin < 10 ? 'critical' : 'warning',
        message:     `${row.productCode} margin ${margin.toFixed(1)}% on batch ${row.batchNumber} — below 15% target`,
        productCode: row.productCode,
        batchNumber: row.batchNumber,
        changePct:   margin,
        date:        new Date(row.createdAt).toISOString(),
      })
    }
  }

  const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity]
    if (s !== 0) return s
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  return { alerts }
}

// ── 6. GET /profitability ─────────────────────────────────────────────────

interface ProfitabilityRow {
  [key: string]: unknown
  productCode: string
  batchCount:  string
  totalVolume: string
  totalCost:   string
  totalRevenue: string
  totalProfit: string
  avgMargin:   string | null
}

export async function getProfitability(query: ProfitabilityQuery) {
  const conditions: SQL[] = []
  if (query.dateFrom) conditions.push(sql`production_date >= ${query.dateFrom}`)
  if (query.dateTo)   conditions.push(sql`production_date <= ${query.dateTo}`)

  const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

  const rows = await db.execute<ProfitabilityRow>(sql`
    SELECT
      product_code AS "productCode",
      COUNT(*) AS "batchCount",
      SUM(batch_size::numeric) AS "totalVolume",
      SUM((cost_summary->>'productionCostPerL')::numeric * batch_size::numeric) AS "totalCost",
      SUM((cost_summary->>'sellingPricePerL')::numeric * batch_size::numeric) AS "totalRevenue",
      SUM((cost_summary->>'sellingPricePerL')::numeric * batch_size::numeric)
        - SUM((cost_summary->>'productionCostPerL')::numeric * batch_size::numeric) AS "totalProfit",
      AVG((cost_summary->>'profitMargin')::numeric) FILTER (WHERE (cost_summary->>'sellingPricePerL')::numeric > 0) AS "avgMargin"
    FROM batches
    ${whereClause}
    GROUP BY product_code
    ORDER BY "totalProfit" DESC
  `)

  const products = rows.map((r) => ({
    productCode: r.productCode,
    batchCount:  Number(r.batchCount),
    totalVolume: Number(r.totalVolume),
    totalCost:   Number(r.totalCost),
    totalRevenue: Number(r.totalRevenue),
    totalProfit: Number(r.totalProfit),
    avgMargin:   r.avgMargin !== null ? Number(r.avgMargin) : null,
  }))

  return { products }
}

// ── 7. GET /comparison ────────────────────────────────────────────────────

interface ComparisonSide {
  batchNumber:      string
  productionDate:   string
  batchSize:        number
  variantName:      string | null
  costSummary: {
    rawMaterialCostPerL: number
    lossAdjustmentPerL:  number
    transportCostPerL:   number
    handlingBufferPerL:  number
    packagingCostPerL:   number | null
    productionCostPerL:  number
    sellingPricePerL:    number
    profitPerL:          number
    profitMargin:        number
  }
  materialCostPerL: number
}

interface MaterialDiff {
  name:          string
  currentRate:   number | null
  previousRate:  number | null
  rateDiff:      number | null
  ratePct:       number | null
}

function buildComparisonSide(row: BatchRow): ComparisonSide {
  const cs = row.costSummary as CostSummary
  return {
    batchNumber:    row.batchNumber,
    productionDate: row.productionDate,
    batchSize:      Number(row.batchSize),
    variantName:    row.variantName ?? null,
    costSummary: {
      rawMaterialCostPerL: cs.rawMaterialCostPerL,
      lossAdjustmentPerL:  cs.lossAdjustmentPerL,
      transportCostPerL:   cs.transportCostPerL,
      handlingBufferPerL:  cs.handlingBufferPerL,
      packagingCostPerL:   cs.packagingCostPerL ?? null,
      productionCostPerL:  cs.productionCostPerL,
      sellingPricePerL:    cs.sellingPricePerL,
      profitPerL:          cs.profitPerL,
      profitMargin:        cs.profitMargin,
    },
    materialCostPerL: cs.rawMaterialCostPerL + cs.lossAdjustmentPerL,
  }
}

export async function getComparison(query: ComparisonQuery) {
  const conditions: SQL[] = [eq(batches.productCode, query.productCode)]
  if (query.variantId)   conditions.push(eq(batches.variantId, query.variantId))
  if (query.companyName) conditions.push(ilike(batches.companyName, `%${query.companyName}%`))

  const rows = await db
    .select()
    .from(batches)
    .where(and(...conditions))
    .orderBy(desc(batches.createdAt))
    .limit(2)

  if (rows.length === 0) return null

  const [currentRow, previousRow] = rows
  const current  = buildComparisonSide(currentRow)
  const previous = previousRow ? buildComparisonSide(previousRow) : null

  let diff: {
    materialCostPerLDiff:   number
    materialCostPct:        number | null
    productionCostPerLDiff: number
    productionCostPct:      number | null
    profitPerLDiff:         number
    profitPct:              number | null
    marginDiff:             number
  } | null = null

  let materialDiffs: MaterialDiff[] = []

  if (previous) {
    diff = {
      materialCostPerLDiff:   current.materialCostPerL - previous.materialCostPerL,
      materialCostPct:        pct(current.materialCostPerL, previous.materialCostPerL),
      productionCostPerLDiff: current.costSummary.productionCostPerL - previous.costSummary.productionCostPerL,
      productionCostPct:      pct(current.costSummary.productionCostPerL, previous.costSummary.productionCostPerL),
      profitPerLDiff:         current.costSummary.profitPerL - previous.costSummary.profitPerL,
      profitPct:              pct(current.costSummary.profitPerL, previous.costSummary.profitPerL),
      marginDiff:             current.costSummary.profitMargin - previous.costSummary.profitMargin,
    }

    const currComponents = (currentRow.formulationSnapshot as FormulationSnapshot)?.components ?? []
    const prevComponents = (previousRow.formulationSnapshot as FormulationSnapshot)?.components ?? []

    const currMap = new Map(currComponents.map((c) => [normalizeMaterialName(c.name), c]))
    const prevMap = new Map(prevComponents.map((c) => [normalizeMaterialName(c.name), c]))
    const allKeys = new Set([...currMap.keys(), ...prevMap.keys()])

    materialDiffs = Array.from(allKeys)
      .map((key) => {
        const c = currMap.get(key)
        const p = prevMap.get(key)
        const currentRate  = c ? c.materialRate : null
        const previousRate = p ? p.materialRate : null
        const rateDiff = currentRate != null && previousRate != null ? currentRate - previousRate : null
        const ratePct  = currentRate != null && previousRate != null ? pct(currentRate, previousRate) : null
        return {
          name: (c ?? p)!.name,
          currentRate,
          previousRate,
          rateDiff,
          ratePct,
        }
      })
      .filter((d) => {
        const bothPresent = d.currentRate != null && d.previousRate != null
        return bothPresent ? d.currentRate !== d.previousRate : true
      })
  }

  return { current, previous, diff, materialDiffs }
}
