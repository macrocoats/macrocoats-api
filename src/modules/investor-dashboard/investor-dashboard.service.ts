import { sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { companies, products } from '../../db/schema/index.js'
import { getProfitability } from '../cost-intelligence/cost-intelligence.service.js'
import { listInvoicesWithDetails } from '../customer-supply/customer-supply.service.js'
import { isZohoConfigured } from '../zoho-invoice/zoho-invoice.service.js'
import {
  toSaleLines, windowTotals, trend, breakdown, missingIn, type SaleLine,
} from '../../utils/invoicedSales.js'
import type { DashboardFilter, ProjectionsQuery } from './investor-dashboard.schema.js'

/**
 * Business-intelligence read layer — every figure here is derived, nothing is
 * stored. Two bases, kept apart on purpose:
 *
 * - **Revenue / sales** (this month, quarter, financial YTD, trends, customer /
 *   product / region mix, run-rate projections, revenue growth and
 *   concentration) = **Zoho invoiced value before GST** — invoice line
 *   amounts, the same basis as Operations Center → Sales → Invoiced sales.
 *   Line items come from the durable `zoho_invoice_details` cache; invoices
 *   not read yet are reported in `revenueBasis.invoicesMissingLines`.
 * - **Order flow** (pending order value, orders received / completed, average
 *   order value, open-order revenue, quotation pipeline) = Customer PO order
 *   value keyed on `customer_po_date`, as before.
 *
 * Zoho customers and items are matched to portal companies / products by
 * name (utils/invoicedSales.ts), so the customer and product filters apply
 * to invoiced figures only where a match exists.
 */

type RevenueBasis = {
  source: 'zoho_invoices'
  valuation: 'before_gst'
  available: boolean
  reason: 'ZOHO_NOT_CONFIGURED' | 'ZOHO_SYNC_FAILED' | null
  message: string | null
  invoicesMissingLines: number
  detailsPending: number
}

type SalesData = { lines: SaleLine[]; missing: Array<{ invoiceId: string; date: string }>; basis: RevenueBasis }

const SALES_MEMO_MS = 30_000
let salesMemo: { at: number; data: Promise<SalesData> } | null = null

/**
 * Invoiced sale lines for every executed Zoho invoice. Memoised for a few
 * seconds so one dashboard load (KPIs + analytics + insights + projections)
 * reads Zoho once. Never throws: when Zoho is unavailable the lines are empty
 * and `basis.available` is false, so callers report 0 with a reason.
 */
function loadSales(): Promise<SalesData> {
  if (salesMemo && Date.now() - salesMemo.at < SALES_MEMO_MS) return salesMemo.data
  const data = (async (): Promise<SalesData> => {
    const empty = (reason: RevenueBasis['reason'], message: string | null): SalesData => ({
      lines: [], missing: [],
      basis: { source: 'zoho_invoices', valuation: 'before_gst', available: false, reason, message, invoicesMissingLines: 0, detailsPending: 0 },
    })
    if (!isZohoConfigured()) return empty('ZOHO_NOT_CONFIGURED', 'Zoho Invoice is not connected on this server.')
    try {
      const [{ invoices, pending }, companyRows, productRows] = await Promise.all([
        listInvoicesWithDetails(),
        db.select({ id: companies.id, displayName: companies.displayName, state: companies.state }).from(companies),
        db.select({ key: products.key, displayName: products.displayName }).from(products),
      ])
      const { lines, missing } = toSaleLines(invoices, companyRows, productRows)
      return {
        lines, missing,
        basis: { source: 'zoho_invoices', valuation: 'before_gst', available: true, reason: null, message: null, invoicesMissingLines: missing.length, detailsPending: pending },
      }
    } catch (err) {
      salesMemo = null
      return empty('ZOHO_SYNC_FAILED', err instanceof Error ? err.message : 'Unknown Zoho error')
    }
  })()
  salesMemo = { at: Date.now(), data }
  return data
}

/** Coverage note scoped to one window: how many invoices in it have no line items yet. */
const basisFor = (s: SalesData, from: string, to: string): RevenueBasis => ({ ...s.basis, invoicesMissingLines: missingIn(s.missing, from, to) })

// NOT d.toISOString().slice(0,10) — that converts to UTC first, which shifts
// a local-midnight date backward by a day whenever the server timezone is
// ahead of UTC (e.g. IST, UTC+5:30). Format from the Date's own local
// year/month/day components instead, since firstOfMonth/firstOfQuarter/etc.
// below all construct dates via `new Date(year, month, day)` (local time).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const round2 = (n: number) => Math.round(n * 100) / 100

function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function firstOfQuarter(d: Date) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1) }
// Indian financial year (1 April – 31 March) — "year to date", the "This Year"
// range and the annual run-rate all report against the FY, not the calendar year.
function firstOfFinancialYear(d: Date) { return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1) }
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() }
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
    case 'year':    return { from: iso(firstOfFinancialYear(today)), to: iso(today) }
    case 'custom':  return { from: filter.from!, to: filter.to! }
  }
}

// ── Executive KPIs ────────────────────────────────────────────────────────────

export async function getExecutiveKpis(filter: DashboardFilter) {
  const { from, to } = resolveWindow(filter)
  const today = new Date()
  const monthStart = iso(firstOfMonth(today))
  const quarterStart = iso(firstOfQuarter(today))
  const yearStart = iso(firstOfFinancialYear(today))

  const customerCond = filter.customerId ? sql`AND o.customer_id = ${filter.customerId}` : sql``
  const productJoinCond = filter.productKey
    ? sql`AND EXISTS (SELECT 1 FROM customer_purchase_order_items pi WHERE pi.order_id = o.id AND pi.product_key = ${filter.productKey})`
    : sql``

  // Fixed-period sales — always "this calendar month/quarter, this financial
  // year", independent of the range filter — are Zoho invoiced value before GST.
  // Pending order value stays on the customer-PO order book.
  const sales = await loadSales()
  const todayIso = iso(today)
  const [fixedRow] = await db.execute<{ [k: string]: unknown; pendingOrderValue: string }>(sql`
    SELECT COALESCE(SUM(total_value) FILTER (WHERE status NOT IN ('completed', 'cancelled')), 0) AS "pendingOrderValue"
    FROM customer_purchase_orders
    WHERE deleted_at IS NULL AND status != 'cancelled'
  `)
  const salesFilter = { customerId: filter.customerId, productKey: filter.productKey }

  // Filter-scoped figures — respect range/customerId/productKey. Computed for
  // both the selected window and the prior equal-length window so the
  // dashboard can show side-by-side comparatives, not just a growth %.
  const windowDays = daysBetween(new Date(from), new Date(to)) + 1
  const priorTo = iso(addDays(new Date(from), -1))
  const priorFrom = iso(addDays(new Date(priorTo), -(windowDays - 1)))
  const [currentOrders, priorOrders] = await Promise.all([
    getWindowFigures(from, to, customerCond, productJoinCond),
    getWindowFigures(priorFrom, priorTo, customerCond, productJoinCond),
  ])
  const withInvoiced = (orders: typeof currentOrders, f: string, t: string) => {
    const inv = windowTotals(sales.lines, f, t, salesFilter)
    return { ...orders, invoicedValue: inv.value, invoiceCount: inv.invoices, invoicedCustomers: inv.customers }
  }
  const current = withInvoiced(currentOrders, from, to)
  const prior = withInvoiced(priorOrders, priorFrom, priorTo)

  // Customer growth: customers whose FIRST-EVER order date falls in this window vs the prior equal-length window.
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
    currentMonthSales:  windowTotals(sales.lines, monthStart, todayIso).value,
    quarterlySales:     windowTotals(sales.lines, quarterStart, todayIso).value,
    ytdSales:           windowTotals(sales.lines, yearStart, todayIso).value,
    pendingOrderValue:  Number(fixedRow?.pendingOrderValue ?? 0),
    revenueBasis:       basisFor(sales, yearStart < from ? yearStart : from, todayIso > to ? todayIso : to),
    ...current,
    customerGrowthPct,
    newCustomersInWindow: newInWindow,
    prior: { from: priorFrom, to: priorTo, ...prior, newCustomersInWindow: newInPriorWindow },
  }
}

/** Range/customer/product-scoped order figures for one [from, to] window. */
async function getWindowFigures(from: string, to: string, customerCond: SQL, productJoinCond: SQL) {
  const [filteredRow] = await db.execute<{ [k: string]: unknown; orderValue: string; ordersReceived: string; ordersCompleted: string; activeCustomers: string; averageOrderValue: string }>(sql`
    SELECT
      COALESCE(SUM(o.total_value), 0) AS "orderValue",
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

  return {
    orderValue:        Number(filteredRow?.orderValue ?? 0),
    ordersReceived:    Number(filteredRow?.ordersReceived ?? 0),
    ordersCompleted:   Number(filteredRow?.ordersCompleted ?? 0),
    activeCustomers:   Number(filteredRow?.activeCustomers ?? 0),
    averageOrderValue: round2(Number(filteredRow?.averageOrderValue ?? 0)),
    productsSold:      Number(productsRow?.productsSold ?? 0),
    productionVolume:  Number(productionRow?.productionVolume ?? 0),
  }
}

// ── Sales Analytics ───────────────────────────────────────────────────────────

/**
 * Invoiced sales (Zoho, before GST) trends and mix. Trends are always the
 * trailing 12 months / 8 quarters / 5 years from today, honouring
 * `customerId`; each bucket carries `priorTotalValue`, the same period a year
 * earlier. The top-10 customer / product / region breakdowns are scoped to
 * the resolved range window. `orderCount` is kept for the existing client
 * and carries the invoice count (also returned as `invoiceCount`).
 */
export async function getSalesAnalytics(filter: DashboardFilter) {
  const { from, to } = resolveWindow(filter)
  const sales = await loadSales()
  const today = new Date()
  const trendFilter = { customerId: filter.customerId }

  const byCustomer = breakdown(sales.lines, from, to, (l) => l.companyId ?? `zoho:${l.zohoCustomer}`)
  const byProduct = breakdown(sales.lines, from, to, (l) => l.productKey ?? `item:${l.productName}`)
  const byRegion = breakdown(sales.lines, from, to, (l) => l.region)

  return {
    monthlyTrend:   trend(sales.lines, today, 'month', 12, trendFilter),
    quarterlyTrend: trend(sales.lines, today, 'quarter', 8, trendFilter),
    yearlyTrend:    trend(sales.lines, today, 'year', 5, trendFilter),
    salesByCustomer: byCustomer.map((r) => ({
      customerId: r.sample.companyId, customerName: r.sample.customerName,
      orderCount: r.invoiceCount, invoiceCount: r.invoiceCount, totalValue: r.totalValue,
    })),
    salesByProduct: byProduct.map((r) => ({
      productKey: r.sample.productKey, productDisplayName: r.sample.productName,
      orderCount: r.invoiceCount, invoiceCount: r.invoiceCount, totalValue: r.totalValue,
    })),
    // Region = the invoice's billing state, else the matched company's state.
    salesByRegion: byRegion.map((r) => ({
      region: r.key, orderCount: r.invoiceCount, invoiceCount: r.invoiceCount, totalValue: r.totalValue,
    })),
    revenueBasis: basisFor(sales, `${today.getFullYear() - 4}-01-01`, iso(today)),
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
  const yearStart = firstOfFinancialYear(today)

  const dayOfMonth = daysBetween(monthStart, today) + 1
  const totalDaysInMonth = daysInMonth(today)
  const dayOfQuarter = daysBetween(quarterStart, today) + 1
  const totalDaysInQuarter = daysBetween(quarterStart, firstOfQuarter(addDays(quarterStart, 92))) || 92
  const dayOfYear = daysBetween(yearStart, today) + 1
  const totalDaysInYear = daysBetween(yearStart, new Date(yearStart.getFullYear() + 1, 3, 1))

  // Period-to-date actuals are Zoho invoiced value before GST; the run-rate
  // projections below extrapolate those. Open-order revenue and the
  // quotation pipeline further down stay on the order book.
  const sales = await loadSales()
  const todayIso = iso(today)
  const monthToDate = windowTotals(sales.lines, iso(monthStart), todayIso).value
  const quarterToDate = windowTotals(sales.lines, iso(quarterStart), todayIso).value
  const yearToDate = windowTotals(sales.lines, iso(yearStart), todayIso).value

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
    revenueBasis: basisFor(sales, iso(yearStart), todayIso),
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

  // Revenue in-window vs. the prior equal-length window — Zoho invoiced value
  // before GST, unscoped by customer/product like the breakdowns it is the
  // denominator for.
  const sales = await loadSales()
  const windowRevenue = windowTotals(sales.lines, from, to).value
  const priorWindowRevenue = windowTotals(sales.lines, priorFrom, priorTo).value
  const revenueGrowthPct = growthPct(windowRevenue, priorWindowRevenue)

  const [priorProductionRow] = await db.execute<{ [k: string]: unknown; priorProductionVolume: string }>(sql`
    SELECT COALESCE(SUM(batch_size), 0) AS "priorProductionVolume"
    FROM batches
    WHERE production_date BETWEEN ${priorFrom} AND ${priorTo}
  `)
  const priorProductionVolume = Number(priorProductionRow?.priorProductionVolume ?? 0)
  const productionTrendPct = growthPct(kpis.productionVolume, priorProductionVolume)

  // ── Customer concentration — top-5 customers' share of in-window revenue.
  // Safe to reuse analytics.salesByCustomer.slice(0, 5) now that getSalesAnalytics()
  // scopes salesByCustomer to this same resolved window (previously it was an
  // all-time top-10 leaderboard; dividing an all-time top-5 total by a short
  // window's revenue used to inflate concentrationPct well past 100% for any
  // window shorter than the account's full history, forcing concentrationScore
  // to a fabricated 0 even for a well-diversified, healthy window). A top-10
  // LIMIT always contains the true top 5 when at least 5 customers ordered in
  // the window, so no separate query is needed here.
  const top5 = analytics.salesByCustomer.slice(0, 5)
  const top5Value = top5.reduce((sum, c) => sum + c.totalValue, 0)
  const concentrationPct = windowRevenue > 0 ? round2(clamp((top5Value / windowRevenue) * 100, 0, 100)) : null

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
  // 'unknown' (not 'low') when quarterlySales is 0 — there's no baseline to
  // benchmark against, and silently calling that "low risk" is exactly the
  // "assume healthy when there's no data" bug this module used to have.
  const pendingRatioPct = kpis.quarterlySales > 0 ? round2((kpis.pendingOrderValue / kpis.quarterlySales) * 100) : null
  const pendingRiskSeverity: 'low' | 'medium' | 'high' | 'unknown' = pendingRatioPct == null ? 'unknown'
    : pendingRatioPct > 50 ? 'high' : pendingRatioPct > 25 ? 'medium' : 'low'

  // ── Business Health Score — an equally-weighted composite of up to four
  // 0-100 sub-scores, averaged over only the sub-scores that have real data
  // behind them. This weighting is a new judgment call (no pre-existing
  // formula):
  //   growthScore        — revenue growth vs. prior window, centered at 50 (0% growth)
  //   completionScore     — % of in-window orders completed
  //   concentrationScore — 100 minus top-5-customer revenue concentration (lower
  //                         concentration = healthier, less customer-dependency risk)
  //   marginScore         — weighted portfolio margin, scaled so 30% margin = 100
  //
  // Each sub-score is `null` (not a neutral/optimistic default) when its
  // window has no underlying data to score — e.g. 0 orders received means
  // "no completion rate to assess", not "100% completion". A previous version
  // of this formula defaulted unscorable metrics to 100/100/50/50, which
  // silently produced a 75/100 "healthy" score for a genuinely empty window
  // with zero orders and zero revenue. `null` sub-scores are excluded from
  // the average rather than dragging it toward a fabricated number; the
  // overall score is `null` (not 0, not a default) when none of the four
  // could be computed, so callers can render "Insufficient data" instead of
  // a confident-looking number.
  const noPriorOrCurrentRevenue = windowRevenue === 0 && priorWindowRevenue === 0
  const growthScore = noPriorOrCurrentRevenue
    ? null
    // priorWindowRevenue === 0 but windowRevenue > 0: revenue appeared from
    // nothing this window — growthPct is undefined (can't divide by zero
    // baseline) but this is real, strongly-positive activity, not "no data".
    : priorWindowRevenue === 0
      ? 100
      : round2(clamp(50 + (revenueGrowthPct ?? 0) / 2, 0, 100))
  const completionScore = kpis.ordersReceived > 0
    ? round2(clamp((kpis.ordersCompleted / kpis.ordersReceived) * 100, 0, 100))
    : null
  const concentrationScore = (windowRevenue > 0 && concentrationPct != null)
    ? round2(clamp(100 - concentrationPct, 0, 100))
    : null
  const marginScore = weightedAvgMarginPct != null
    ? round2(clamp((weightedAvgMarginPct / 30) * 100, 0, 100))
    : null

  const scoreComponents = { growthScore, completionScore, concentrationScore, marginScore }
  const availableScores = Object.values(scoreComponents).filter((s): s is number => s != null)
  const businessHealthScore = availableScores.length > 0
    ? round2(availableScores.reduce((sum, s) => sum + s, 0) / availableScores.length)
    : null

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
    windowRevenue, priorWindowRevenue,
    // Invoiced revenue ÷ customers invoiced in the window (both Zoho-based).
    averageRevenuePerCustomer: kpis.invoicedCustomers > 0 ? round2(windowRevenue / kpis.invoicedCustomers) : 0,
    revenueBasis: basisFor(sales, priorFrom, to),
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
      dataCoverage: availableScores.length,
      components: scoreComponents,
    },
  }
}
