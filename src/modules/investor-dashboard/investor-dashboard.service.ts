import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { getProfitability } from '../cost-intelligence/cost-intelligence.service.js'
import type { DashboardFilter, ProjectionsQuery } from './investor-dashboard.schema.js'

/**
 * Business-intelligence read layer over existing operational tables — every
 * figure here is derived, nothing is stored. "Sales"/"Revenue" throughout
 * this module means Customer PO order value (confirmed+ orders, excludes
 * cancelled), NOT invoiced/recognized revenue — this system has no
 * accounting/invoicing layer by design (see root CLAUDE.md). All date-keyed
 * figures use `customer_po_date` (the date on the customer's actual PO), not
 * `created_at` (when it was entered into the system) — see the Order
 * Management Dashboard's "Orders by Month" fix for why this distinction
 * matters for backfilled/historical data.
 */

// NOT d.toISOString().slice(0,10) — that converts to UTC first, which shifts
// a local-midnight date backward by a day whenever the server timezone is
// ahead of UTC (e.g. IST, UTC+5:30). Format from the Date's own local
// year/month/day components instead, since firstOfMonth/firstOfQuarter/etc.
// below all construct dates via `new Date(year, month, day)` (local time).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const round2 = (n: number) => Math.round(n * 100) / 100

function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function firstOfQuarter(d: Date) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1) }
function firstOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1) }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
function isLeapYear(y: number) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c }

/** Resolves a DashboardFilter's `range` into a concrete [from, to] date window. */
function resolveWindow(filter: DashboardFilter): { from: string; to: string } {
  const today = new Date()
  switch (filter.range) {
    case 'today':   return { from: iso(today), to: iso(today) }
    case 'week': {
      const day = today.getDay() === 0 ? 7 : today.getDay() // Monday-start week
      return { from: iso(addDays(today, -(day - 1))), to: iso(today) }
    }
    case 'month':   return { from: iso(firstOfMonth(today)), to: iso(today) }
    case 'quarter': return { from: iso(firstOfQuarter(today)), to: iso(today) }
    case 'year':    return { from: iso(firstOfYear(today)), to: iso(today) }
    case 'custom':  return { from: filter.from!, to: filter.to! }
  }
}

// ── Executive KPIs ────────────────────────────────────────────────────────────

export async function getExecutiveKpis(filter: DashboardFilter) {
  const { from, to } = resolveWindow(filter)
  const today = new Date()
  const monthStart = iso(firstOfMonth(today))
  const quarterStart = iso(firstOfQuarter(today))
  const yearStart = iso(firstOfYear(today))

  const customerCond = filter.customerId ? sql`AND o.customer_id = ${filter.customerId}` : sql``
  const productJoinCond = filter.productKey
    ? sql`AND EXISTS (SELECT 1 FROM customer_purchase_order_items pi WHERE pi.order_id = o.id AND pi.product_key = ${filter.productKey})`
    : sql``

  // Fixed-period figures — always "this calendar month/quarter/year", independent of the range filter.
  const [fixedRow] = await db.execute<{ [k: string]: unknown; currentMonthSales: string; quarterlySales: string; ytdSales: string; pendingOrderValue: string }>(sql`
    SELECT
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date >= ${monthStart}), 0)   AS "currentMonthSales",
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date >= ${quarterStart}), 0) AS "quarterlySales",
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date >= ${yearStart}), 0)    AS "ytdSales",
      COALESCE(SUM(total_value) FILTER (WHERE status NOT IN ('completed', 'cancelled')), 0) AS "pendingOrderValue"
    FROM customer_purchase_orders
    WHERE deleted_at IS NULL AND status != 'cancelled'
  `)

  // Filter-scoped figures — respect range/customerId/productKey.
  const [filteredRow] = await db.execute<{ [k: string]: unknown; ordersReceived: string; ordersCompleted: string; activeCustomers: string; averageOrderValue: string }>(sql`
    SELECT
      COUNT(DISTINCT o.id) AS "ordersReceived",
      COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed') AS "ordersCompleted",
      COUNT(DISTINCT o.customer_id) AS "activeCustomers",
      COALESCE(AVG(o.total_value), 0) AS "averageOrderValue"
    FROM customer_purchase_orders o
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
      AND o.customer_po_date BETWEEN ${from} AND ${to}
      ${customerCond} ${productJoinCond}
  `)

  const [productsRow] = await db.execute<{ [k: string]: unknown; productsSold: string }>(sql`
    SELECT COUNT(DISTINCT i.product_key) AS "productsSold"
    FROM customer_purchase_order_items i
    JOIN customer_purchase_orders o ON o.id = i.order_id
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
      AND o.customer_po_date BETWEEN ${from} AND ${to}
      ${customerCond}
  `)

  const [productionRow] = await db.execute<{ [k: string]: unknown; productionVolume: string }>(sql`
    SELECT COALESCE(SUM(batch_size), 0) AS "productionVolume"
    FROM batches
    WHERE production_date BETWEEN ${from} AND ${to}
  `)

  // Customer growth: customers whose FIRST-EVER order date falls in this window vs the prior equal-length window.
  const windowDays = daysBetween(new Date(from), new Date(to)) + 1
  const priorTo = iso(addDays(new Date(from), -1))
  const priorFrom = iso(addDays(new Date(priorTo), -(windowDays - 1)))
  const [growthRow] = await db.execute<{ [k: string]: unknown; newInWindow: string; newInPriorWindow: string }>(sql`
    WITH first_orders AS (
      SELECT customer_id, MIN(customer_po_date) AS first_date
      FROM customer_purchase_orders
      WHERE deleted_at IS NULL AND status != 'cancelled'
      GROUP BY customer_id
    )
    SELECT
      COUNT(*) FILTER (WHERE first_date BETWEEN ${from} AND ${to}) AS "newInWindow",
      COUNT(*) FILTER (WHERE first_date BETWEEN ${priorFrom} AND ${priorTo}) AS "newInPriorWindow"
    FROM first_orders
  `)
  const newInWindow = Number(growthRow?.newInWindow ?? 0)
  const newInPriorWindow = Number(growthRow?.newInPriorWindow ?? 0)
  const customerGrowthPct = newInPriorWindow > 0
    ? round2(((newInWindow - newInPriorWindow) / newInPriorWindow) * 100)
    : (newInWindow > 0 ? 100 : 0)

  return {
    range: filter.range, from, to,
    currentMonthSales:  Number(fixedRow?.currentMonthSales ?? 0),
    quarterlySales:     Number(fixedRow?.quarterlySales ?? 0),
    ytdSales:           Number(fixedRow?.ytdSales ?? 0),
    pendingOrderValue:  Number(fixedRow?.pendingOrderValue ?? 0),
    ordersReceived:     Number(filteredRow?.ordersReceived ?? 0),
    ordersCompleted:    Number(filteredRow?.ordersCompleted ?? 0),
    activeCustomers:    Number(filteredRow?.activeCustomers ?? 0),
    averageOrderValue:  round2(Number(filteredRow?.averageOrderValue ?? 0)),
    productsSold:       Number(productsRow?.productsSold ?? 0),
    productionVolume:   Number(productionRow?.productionVolume ?? 0),
    customerGrowthPct,
    newCustomersInWindow: newInWindow,
  }
}

// ── Sales Analytics ───────────────────────────────────────────────────────────

export async function getSalesAnalytics(filter: DashboardFilter) {
  const customerCond = filter.customerId ? sql`AND o.customer_id = ${filter.customerId}` : sql``

  const monthlyRows = await db.execute<{ [k: string]: unknown; period: string; orderCount: string; totalValue: string }>(sql`
    SELECT to_char(gs.period, 'YYYY-MM') AS period,
      COUNT(o.id) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '11 months'), date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS gs(period)
    LEFT JOIN customer_purchase_orders o
      ON date_trunc('month', o.customer_po_date) = gs.period AND o.deleted_at IS NULL AND o.status != 'cancelled' ${customerCond}
    GROUP BY gs.period ORDER BY gs.period
  `)

  const quarterlyRows = await db.execute<{ [k: string]: unknown; period: string; orderCount: string; totalValue: string }>(sql`
    SELECT to_char(gs.period, 'YYYY-"Q"Q') AS period,
      COUNT(o.id) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM generate_series(date_trunc('quarter', CURRENT_DATE - INTERVAL '21 months'), date_trunc('quarter', CURRENT_DATE), INTERVAL '3 months') AS gs(period)
    LEFT JOIN customer_purchase_orders o
      ON date_trunc('quarter', o.customer_po_date) = gs.period AND o.deleted_at IS NULL AND o.status != 'cancelled' ${customerCond}
    GROUP BY gs.period ORDER BY gs.period
  `)

  const yearlyRows = await db.execute<{ [k: string]: unknown; period: string; orderCount: string; totalValue: string }>(sql`
    SELECT to_char(gs.period, 'YYYY') AS period,
      COUNT(o.id) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM generate_series(date_trunc('year', CURRENT_DATE - INTERVAL '4 years'), date_trunc('year', CURRENT_DATE), INTERVAL '1 year') AS gs(period)
    LEFT JOIN customer_purchase_orders o
      ON date_trunc('year', o.customer_po_date) = gs.period AND o.deleted_at IS NULL AND o.status != 'cancelled' ${customerCond}
    GROUP BY gs.period ORDER BY gs.period
  `)

  const byCustomerRows = await db.execute<{ [k: string]: unknown; customerId: string; customerName: string; orderCount: string; totalValue: string }>(sql`
    SELECT o.customer_id AS "customerId", c.display_name AS "customerName",
      COUNT(*) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM customer_purchase_orders o JOIN companies c ON c.id = o.customer_id
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
    GROUP BY o.customer_id, c.display_name ORDER BY "totalValue" DESC LIMIT 10
  `)

  const byProductRows = await db.execute<{ [k: string]: unknown; productKey: string; productDisplayName: string; orderCount: string; totalValue: string }>(sql`
    SELECT i.product_key AS "productKey", p.display_name AS "productDisplayName",
      COUNT(DISTINCT i.order_id) AS "orderCount", COALESCE(SUM(i.amount), 0) AS "totalValue"
    FROM customer_purchase_order_items i
    JOIN products p ON p.key = i.product_key
    JOIN customer_purchase_orders o ON o.id = i.order_id
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
    GROUP BY i.product_key, p.display_name ORDER BY "totalValue" DESC LIMIT 10
  `)

  const byRegionRows = await db.execute<{ [k: string]: unknown; region: string; orderCount: string; totalValue: string }>(sql`
    SELECT COALESCE(NULLIF(c.state, ''), 'Unspecified') AS region,
      COUNT(*) AS "orderCount", COALESCE(SUM(o.total_value), 0) AS "totalValue"
    FROM customer_purchase_orders o JOIN companies c ON c.id = o.customer_id
    WHERE o.deleted_at IS NULL AND o.status != 'cancelled'
    GROUP BY region ORDER BY "totalValue" DESC LIMIT 10
  `)

  const mapTrend = (rows: typeof monthlyRows) => rows.map((r) => ({
    period: r.period, orderCount: Number(r.orderCount), totalValue: Number(r.totalValue),
  }))

  return {
    monthlyTrend:   mapTrend(monthlyRows),
    quarterlyTrend: mapTrend(quarterlyRows),
    yearlyTrend:    mapTrend(yearlyRows),
    salesByCustomer: byCustomerRows.map((r) => ({ customerId: r.customerId, customerName: r.customerName, orderCount: Number(r.orderCount), totalValue: Number(r.totalValue) })),
    salesByProduct:  byProductRows.map((r) => ({ productKey: r.productKey, productDisplayName: r.productDisplayName, orderCount: Number(r.orderCount), totalValue: Number(r.totalValue) })),
    // "Sales by Region" — future-ready proxy using companies.state; no dedicated region field exists yet.
    salesByRegion:   byRegionRows.map((r) => ({ region: r.region, orderCount: Number(r.orderCount), totalValue: Number(r.totalValue) })),
  }
}

// ── Revenue Projections ────────────────────────────────────────────────────────

/**
 * Simple, clearly-labeled ESTIMATES — not a forecasting engine. Base case is
 * linear run-rate extrapolation from period-to-date pace; the pipeline
 * figure is an optional upside, scaled by a user-adjustable conversion rate
 * (no persistence — purely a dashboard control).
 */
export async function getProjections(query: ProjectionsQuery) {
  const today = new Date()
  const monthStart = firstOfMonth(today)
  const quarterStart = firstOfQuarter(today)
  const yearStart = firstOfYear(today)

  const dayOfMonth = daysBetween(monthStart, today) + 1
  const totalDaysInMonth = daysInMonth(today)
  const dayOfQuarter = daysBetween(quarterStart, today) + 1
  const totalDaysInQuarter = daysBetween(quarterStart, firstOfQuarter(addDays(quarterStart, 92))) || 92
  const dayOfYear = daysBetween(yearStart, today) + 1
  const totalDaysInYear = isLeapYear(today.getFullYear()) ? 366 : 365

  const [toDateRow] = await db.execute<{ [k: string]: unknown; monthToDate: string; quarterToDate: string; yearToDate: string }>(sql`
    SELECT
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date >= ${iso(monthStart)}), 0)   AS "monthToDate",
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date >= ${iso(quarterStart)}), 0) AS "quarterToDate",
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date >= ${iso(yearStart)}), 0)    AS "yearToDate"
    FROM customer_purchase_orders WHERE deleted_at IS NULL AND status != 'cancelled'
  `)
  const monthToDate = Number(toDateRow?.monthToDate ?? 0)
  const quarterToDate = Number(toDateRow?.quarterToDate ?? 0)
  const yearToDate = Number(toDateRow?.yearToDate ?? 0)

  const projectedMonthlyRevenue   = round2((monthToDate / dayOfMonth) * totalDaysInMonth)
  const projectedQuarterlyRevenue = round2((quarterToDate / dayOfQuarter) * totalDaysInQuarter)
  const projectedAnnualRevenue    = round2((yearToDate / dayOfYear) * totalDaysInYear)

  // Expected revenue from open (non-terminal) orders' still-pending quantity.
  const [openRow] = await db.execute<{ [k: string]: unknown; expected: string }>(sql`
    SELECT COALESCE(SUM(GREATEST(i.quantity_ordered - COALESCE(dq.dispatched, 0), 0) * i.unit_price), 0) AS expected
    FROM customer_purchase_order_items i
    JOIN customer_purchase_orders o ON o.id = i.order_id
    LEFT JOIN (
      SELECT customer_purchase_order_item_id AS item_id, SUM(quantity) AS dispatched
      FROM dispatches WHERE voided_at IS NULL AND customer_purchase_order_item_id IS NOT NULL
      GROUP BY customer_purchase_order_item_id
    ) dq ON dq.item_id = i.id
    WHERE o.deleted_at IS NULL AND o.status NOT IN ('completed', 'cancelled')
  `)
  const expectedRevenueFromOpenOrders = round2(Number(openRow?.expected ?? 0))

  // Pipeline value: quotations from the last 90 days that haven't been converted
  // to a (non-cancelled) customer order yet — quotations carry no persisted
  // total, so this sums qty*rate across each quotation's line items.
  const ninetyDaysAgo = iso(addDays(today, -90))
  const [pipelineRow] = await db.execute<{ [k: string]: unknown; pipelineValue: string; quotationCount: string }>(sql`
    SELECT COALESCE(SUM(li.qty_value), 0) AS "pipelineValue", COUNT(*) AS "quotationCount"
    FROM (
      SELECT q.id, SUM(COALESCE(qli.qty, 0) * qli.rate) AS qty_value
      FROM quotations q
      JOIN quotation_line_items qli ON qli.quotation_id = q.id
      WHERE q.quot_date >= ${ninetyDaysAgo}
        AND NOT EXISTS (
          SELECT 1 FROM customer_purchase_orders o
          WHERE o.reference_quotation_id = q.id AND o.deleted_at IS NULL AND o.status != 'cancelled'
        )
      GROUP BY q.id
    ) li
  `)
  const pipelineValue = round2(Number(pipelineRow?.pipelineValue ?? 0))
  const pipelineUpside = round2(pipelineValue * query.conversionRate)

  return {
    monthToDate, quarterToDate, yearToDate,
    projectedMonthlyRevenue, projectedQuarterlyRevenue, projectedAnnualRevenue,
    expectedRevenueFromOpenOrders,
    pipelineValue,
    pipelineQuotationCount: Number(pipelineRow?.quotationCount ?? 0),
    conversionRate: query.conversionRate,
    pipelineUpside,
    projectedMonthlyRevenueWithPipeline: round2(projectedMonthlyRevenue + pipelineUpside),
  }
}

// ── Executive Insights ─────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)) }
function growthPct(curr: number, prev: number): number | null { return prev !== 0 ? round2(((curr - prev) / prev) * 100) : null }

/**
 * Auto-generated executive insights layer over getExecutiveKpis/getSalesAnalytics's
 * existing output plus cost-intelligence's existing getProfitability() — no new
 * business logic, purely derived read composition. "Receivables" is deliberately not
 * computed here (no accounting/invoicing layer, see module header) — the frontend
 * shows the existing pendingOrderValue KPI labeled "Pending Order Value" instead.
 */
export async function getExecutiveInsights(filter: DashboardFilter) {
  const { from, to } = resolveWindow(filter)
  const windowDays = daysBetween(new Date(from), new Date(to)) + 1
  const priorTo = iso(addDays(new Date(from), -1))
  const priorFrom = iso(addDays(new Date(priorTo), -(windowDays - 1)))

  const [kpis, analytics] = await Promise.all([
    getExecutiveKpis(filter),
    getSalesAnalytics(filter),
  ])

  // Revenue in-window vs. the prior equal-length window (mirrors the customerGrowthPct
  // "first order date" comparison in getExecutiveKpis, but for total order value).
  const [revenueRow] = await db.execute<{ [k: string]: unknown; windowRevenue: string; priorWindowRevenue: string }>(sql`
    SELECT
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date BETWEEN ${from} AND ${to}), 0) AS "windowRevenue",
      COALESCE(SUM(total_value) FILTER (WHERE customer_po_date BETWEEN ${priorFrom} AND ${priorTo}), 0) AS "priorWindowRevenue"
    FROM customer_purchase_orders
    WHERE deleted_at IS NULL AND status != 'cancelled'
  `)
  const windowRevenue = Number(revenueRow?.windowRevenue ?? 0)
  const priorWindowRevenue = Number(revenueRow?.priorWindowRevenue ?? 0)
  const revenueGrowthPct = growthPct(windowRevenue, priorWindowRevenue)

  const [priorProductionRow] = await db.execute<{ [k: string]: unknown; priorProductionVolume: string }>(sql`
    SELECT COALESCE(SUM(batch_size), 0) AS "priorProductionVolume"
    FROM batches
    WHERE production_date BETWEEN ${priorFrom} AND ${priorTo}
  `)
  const priorProductionVolume = Number(priorProductionRow?.priorProductionVolume ?? 0)
  const productionTrendPct = growthPct(kpis.productionVolume, priorProductionVolume)

  // ── Customer concentration — top-5 customers' share of in-window revenue ──
  const top5 = analytics.salesByCustomer.slice(0, 5)
  const top5Value = top5.reduce((sum, c) => sum + c.totalValue, 0)
  const concentrationPct = windowRevenue > 0 ? round2((top5Value / windowRevenue) * 100) : null

  // ── Inventory turnover — COGS (period, from cost-intelligence's own batch cost
  // formula) ÷ current inventory value, annualized. Current inventory value is a
  // point-in-time proxy (no historical stock snapshots exist), not a true average —
  // documented limitation, not a bug.
  const [cogsRow] = await db.execute<{ [k: string]: unknown; cogs: string }>(sql`
    SELECT COALESCE(SUM((cost_summary->>'productionCostPerL')::numeric * batch_size::numeric), 0) AS "cogs"
    FROM batches
    WHERE production_date BETWEEN ${from} AND ${to}
  `)
  const cogs = Number(cogsRow?.cogs ?? 0)

  const [inventoryRow] = await db.execute<{ [k: string]: unknown; inventoryValue: string; itemsWithStockQty: string }>(sql`
    SELECT
      COALESCE(SUM(price::numeric * stock_qty::numeric) FILTER (WHERE stock_qty IS NOT NULL), 0) AS "inventoryValue",
      COUNT(*) FILTER (WHERE stock_qty IS NOT NULL) AS "itemsWithStockQty"
    FROM inventory_items
  `)
  const inventoryValue = Number(inventoryRow?.inventoryValue ?? 0)
  const itemsWithStockQty = Number(inventoryRow?.itemsWithStockQty ?? 0)
  const annualizedTurnoverRatio = itemsWithStockQty > 0 && inventoryValue > 0
    ? round2((cogs / inventoryValue) * (365 / windowDays))
    : null

  // ── Portfolio margin — reuse cost-intelligence's existing per-product roll-up,
  // scoped to the same window, weighted by revenue (not a simple average of averages).
  const { products: profitabilityByProduct } = await getProfitability({ dateFrom: from, dateTo: to })
  const totalRevenueForMargin = profitabilityByProduct.reduce((sum, p) => sum + p.totalRevenue, 0)
  const totalProfitForMargin = profitabilityByProduct.reduce((sum, p) => sum + p.totalProfit, 0)
  const weightedAvgMarginPct = totalRevenueForMargin > 0 ? round2((totalProfitForMargin / totalRevenueForMargin) * 100) : null

  // ── Pending-order risk — pending order value relative to this quarter's sales.
  const pendingRatioPct = kpis.quarterlySales > 0 ? round2((kpis.pendingOrderValue / kpis.quarterlySales) * 100) : null
  const pendingRiskSeverity: 'low' | 'medium' | 'high' = pendingRatioPct == null ? 'low'
    : pendingRatioPct > 50 ? 'high' : pendingRatioPct > 25 ? 'medium' : 'low'

  // ── Business Health Score — an equally-weighted composite of four 0-100
  // sub-scores. This weighting is a new judgment call (no pre-existing formula):
  //   growthScore        — revenue growth vs. prior window, centered at 50 (0% growth)
  //   completionScore     — % of in-window orders completed
  //   concentrationScore — 100 minus top-5-customer revenue concentration (lower
  //                         concentration = healthier, less customer-dependency risk)
  //   marginScore         — weighted portfolio margin, scaled so 30% margin = 100
  const growthScore = clamp(50 + (revenueGrowthPct ?? 0) / 2, 0, 100)
  const completionScore = kpis.ordersReceived > 0 ? clamp((kpis.ordersCompleted / kpis.ordersReceived) * 100, 0, 100) : 100
  const concentrationScore = concentrationPct != null ? clamp(100 - concentrationPct, 0, 100) : 100
  const marginScore = weightedAvgMarginPct != null ? clamp((weightedAvgMarginPct / 30) * 100, 0, 100) : 50
  const businessHealthScore = round2((growthScore + completionScore + concentrationScore + marginScore) / 4)

  const topProduct = analytics.salesByProduct[0] ?? null
  const topCustomer = analytics.salesByCustomer[0] ?? null
  const topRegion = analytics.salesByRegion[0] ?? null

  return {
    range: filter.range, from, to,
    highestRevenueProduct: topProduct
      ? { productKey: topProduct.productKey, label: topProduct.productDisplayName, value: topProduct.totalValue }
      : null,
    largestCustomer: topCustomer
      ? { customerId: topCustomer.customerId, label: topCustomer.customerName, value: topCustomer.totalValue }
      : null,
    topRegion: topRegion ? { label: topRegion.region, value: topRegion.totalValue } : null,
    revenueGrowthPct,
    averageRevenuePerCustomer: kpis.activeCustomers > 0 ? round2(windowRevenue / kpis.activeCustomers) : 0,
    productionTrendPct,
    pendingOrderRisk: {
      pendingOrderValue: kpis.pendingOrderValue,
      ratioToQuarterlySalesPct: pendingRatioPct,
      severity: pendingRiskSeverity,
    },
    customerConcentration: {
      top5Value, windowRevenue, concentrationPct,
    },
    inventoryTurnover: {
      cogs, inventoryValue, annualizedRatio: annualizedTurnoverRatio,
      note: itemsWithStockQty === 0 ? 'No inventory items have stockQty tracked — turnover cannot be computed.' : null,
    },
    portfolioMargin: {
      totalRevenue: totalRevenueForMargin, totalProfit: totalProfitForMargin, weightedAvgMarginPct,
    },
    businessHealthScore: {
      score: businessHealthScore,
      components: { growthScore: round2(growthScore), completionScore: round2(completionScore), concentrationScore: round2(concentrationScore), marginScore: round2(marginScore) },
    },
  }
}
