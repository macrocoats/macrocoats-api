/**
 * Invoiced sales for the investor dashboard — Zoho invoices flattened to one
 * "sale line" per invoice line, matched to portal companies and products by
 * name. Values are line amounts (Zoho `item_total`: taxable value before GST),
 * the same basis as the Sales → Invoiced sales view. Pure, unit-tested.
 */
import { EXCLUDED_STATUSES, normalizeItemName, type SupplyInvoice } from './supplySummary.js'

export interface SaleLine {
  invoiceId:    string
  date:         string           // yyyy-mm-dd (invoice date)
  zohoCustomer: string
  customerName: string
  companyId:    string | null    // matched portal company, if any
  region:       string           // invoice billing state, else company state, else 'Unspecified'
  productKey:   string | null    // matched portal product, if any
  productName:  string
  value:        number
}

export interface CompanyRef { id: string; displayName: string; state: string | null }
export interface ProductRef { key: string; displayName: string }

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
// Legal suffixes that differ between Zoho's customer name and the portal's company name.
const LEGAL_WORDS = /\b(private|pvt|limited|ltd|llp|inc|co|company|india)\b\.?/gi
const companyKey = (s: string) => squash(s.replace(LEGAL_WORDS, ' '))

/**
 * Zoho customer name → portal company: exact match ignoring case, punctuation
 * and legal suffixes ("ZF Rane Automotive India Pvt Ltd" = "ZF Rane Automotive").
 */
export function makeCompanyMatcher(companies: CompanyRef[]) {
  const byKey = new Map(companies.map((c) => [companyKey(c.displayName), c]))
  return (zohoName: string): CompanyRef | null => byKey.get(companyKey(zohoName)) ?? null
}

/**
 * Zoho item name → portal product: the normalised item name must start with
 * the product's display name or key ("UNIKLEAN-SP 123521560209" →
 * uniklean-sp); the longest match wins so UNIKLEAN-SF never claims UNIKLEAN-SP.
 * Typos are corrected first (normalizeItemName's alias list).
 */
export function makeProductMatcher(products: ProductRef[]) {
  const candidates = products
    .flatMap((p) => [squash(p.displayName), squash(p.key)].map((k) => ({ k, p })))
    .filter((c) => c.k.length >= 4)
    .sort((a, b) => b.k.length - a.k.length)
  return (itemName: string): ProductRef | null => {
    const n = normalizeItemName(itemName)
    return candidates.find((c) => n.startsWith(c.k))?.p ?? null
  }
}

/**
 * Executed invoices (not draft/void) → sale lines. Invoices whose line items
 * haven't been read from Zoho yet can't be valued before GST; they are
 * returned in `missing` so callers can say the figures are understated.
 */
export function toSaleLines(invoices: SupplyInvoice[], companies: CompanyRef[], products: ProductRef[]) {
  const matchCompany = makeCompanyMatcher(companies)
  const matchProduct = makeProductMatcher(products)
  const lines: SaleLine[] = []
  const missing: Array<{ invoiceId: string; date: string }> = []

  for (const inv of invoices) {
    if ((EXCLUDED_STATUSES as readonly string[]).includes(inv.status.toLowerCase())) continue
    if (inv.lines === null) { missing.push({ invoiceId: inv.invoiceId, date: inv.date }); continue }
    const company = matchCompany(inv.customerName)
    const region = inv.state?.trim() || company?.state?.trim() || 'Unspecified'
    for (const l of inv.lines) {
      const product = matchProduct(l.name)
      lines.push({
        invoiceId:    inv.invoiceId,
        date:         inv.date,
        zohoCustomer: inv.customerId,
        customerName: company?.displayName ?? inv.customerName,
        companyId:    company?.id ?? null,
        region,
        productKey:   product?.key ?? null,
        productName:  product?.displayName ?? l.name,
        value:        l.amount,
      })
    }
  }
  return { lines, missing }
}

export interface SaleFilter { customerId?: string; productKey?: string }

const matches = (l: SaleLine, f: SaleFilter) =>
  (!f.customerId || l.companyId === f.customerId) && (!f.productKey || l.productKey === f.productKey)

export const inRange = (l: { date: string }, from: string, to: string) => l.date >= from && l.date <= to

/** Total value and invoice/customer/product counts for [from, to]. */
export function windowTotals(lines: SaleLine[], from: string, to: string, f: SaleFilter = {}) {
  const scoped = lines.filter((l) => inRange(l, from, to) && matches(l, f))
  return {
    value:     round2(scoped.reduce((n, l) => n + l.value, 0)),
    invoices:  new Set(scoped.map((l) => l.invoiceId)).size,
    customers: new Set(scoped.map((l) => l.companyId ?? `zoho:${l.zohoCustomer}`)).size,
    products:  new Set(scoped.map((l) => l.productKey ?? `item:${l.productName}`)).size,
  }
}

export type Grain = 'month' | 'quarter' | 'year'

/** Period label for a yyyy-mm-dd date: '2026-11', '2026-Q4', '2026'. */
export function periodOf(date: string, grain: Grain): string {
  const y = date.slice(0, 4)
  const m = Number(date.slice(5, 7))
  if (grain === 'year') return y
  if (grain === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  return date.slice(0, 7)
}

/** The trailing `count` periods ending at `today`'s, oldest first, each with its year-earlier label. */
export function trailingPeriods(today: Date, grain: Grain, count: number) {
  const out: Array<{ period: string; prior: string }> = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const step = grain === 'year' ? 12 : grain === 'quarter' ? 3 : 1
    const d = new Date(today.getFullYear(), today.getMonth() - i * step, 1)
    const p = new Date(d.getFullYear() - 1, d.getMonth(), 1)
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`
    out.push({ period: periodOf(fmt(d), grain), prior: periodOf(fmt(p), grain) })
  }
  return out
}

/** Trend rows in the dashboard's existing shape (`orderCount` carries the invoice count). */
export function trend(lines: SaleLine[], today: Date, grain: Grain, count: number, f: SaleFilter = {}) {
  const value = new Map<string, number>()
  const invoices = new Map<string, Set<string>>()
  for (const l of lines) {
    if (!matches(l, f)) continue
    const p = periodOf(l.date, grain)
    value.set(p, (value.get(p) ?? 0) + l.value)
    const s = invoices.get(p) ?? new Set<string>()
    s.add(l.invoiceId)
    invoices.set(p, s)
  }
  return trailingPeriods(today, grain, count).map(({ period, prior }) => ({
    period,
    orderCount:      invoices.get(period)?.size ?? 0,
    invoiceCount:    invoices.get(period)?.size ?? 0,
    totalValue:      round2(value.get(period) ?? 0),
    priorTotalValue: round2(value.get(prior) ?? 0),
  }))
}

/** Top-N breakdown by a key, with invoice counts. */
export function breakdown(
  lines: SaleLine[], from: string, to: string, keyOf: (l: SaleLine) => string, limit = 10,
): Array<{ key: string; sample: SaleLine; totalValue: number; invoiceCount: number }> {
  const acc = new Map<string, { key: string; sample: SaleLine; totalValue: number; ids: Set<string> }>()
  for (const l of lines) {
    if (!inRange(l, from, to)) continue
    const k = keyOf(l)
    const cur = acc.get(k) ?? { key: k, sample: l, totalValue: 0, ids: new Set<string>() }
    cur.totalValue += l.value
    cur.ids.add(l.invoiceId)
    acc.set(k, cur)
  }
  return [...acc.values()]
    .map(({ ids, ...r }) => ({ ...r, totalValue: round2(r.totalValue), invoiceCount: ids.size }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, limit)
}

/** Invoices not yet valued (no line items) that fall in [from, to]. */
export const missingIn = (missing: Array<{ date: string }>, from: string, to: string) =>
  missing.filter((m) => inRange(m, from, to)).length

function round2(n: number) { return Math.round(n * 100) / 100 }
