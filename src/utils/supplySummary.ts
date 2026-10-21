/**
 * Pure aggregation behind GET /customer-supply/summary. Turns Zoho invoices
 * (with line items) plus the portal's own dispatch records into customer-wise,
 * product-wise and monthly supply figures. No I/O here, so it is unit-tested
 * directly (tests/unit/supply-summary.test.ts).
 *
 * Quantities are never converted between units: KG and litres are reported
 * side by side, because converting needs a product density we don't hold.
 * "Invoiced" is what Zoho billed. "Confirmed" is the invoiced quantity on
 * invoices that also have a non-voided dispatch record in the portal (matched
 * by invoice number) — the only delivery evidence this system has.
 */

export interface SupplyInvoiceLine {
  itemId:   string | null
  name:     string
  quantity: number
  unit:     string | null
  rate:     number
  amount:   number
}

export interface SupplyInvoice {
  invoiceId:       string
  invoiceNumber:   string
  date:            string          // yyyy-mm-dd
  dueDate:         string | null
  status:          string
  customerId:      string
  customerName:    string
  gstNo:           string | null
  city:            string | null
  state:           string | null
  referenceNumber: string | null
  currencyCode:    string | null
  total:           number
  balance:         number
  /** null when Zoho's line items couldn't be read for this invoice. */
  lines:           SupplyInvoiceLine[] | null
}

export interface SupplyDispatch {
  invoiceNumber:  string
  dispatchNumber: string
  dispatchDate:   string
  quantity:       number
}

export interface SupplyFilters {
  from?:       string
  to?:         string
  customerId?: string
  product?:    string
}

export interface UnitQuantity {
  unit:      string
  invoiced:  number
  confirmed: number
}

/** Zoho statuses that are not executed orders. */
export const EXCLUDED_STATUSES = ['draft', 'void'] as const

/** A customer counts as currently supplied if invoiced within this many days. */
export const ACTIVE_WINDOW_DAYS = 180

const KG_UNITS = new Set(['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'])
const LITRE_UNITS = new Set(['l', 'lt', 'lts', 'ltr', 'ltrs', 'lit', 'litre', 'litres', 'liter', 'liters'])

/** Maps Zoho's free-text unit to 'KG', 'L', the original unit (upper-cased) or 'Unspecified'. */
export function normalizeUnit(raw: string | null | undefined): string {
  const unit = (raw ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!unit) return 'Unspecified'
  if (KG_UNITS.has(unit)) return 'KG'
  if (LITRE_UNITS.has(unit)) return 'L'
  return unit.toUpperCase()
}

const productKey = (line: SupplyInvoiceLine) => line.itemId || `name:${line.name.trim().toLowerCase()}`

const round = (n: number, digits = 3) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

const UNIT_ORDER = ['KG', 'L']
const sortUnits = (a: UnitQuantity, b: UnitQuantity) => {
  const ia = UNIT_ORDER.indexOf(a.unit)
  const ib = UNIT_ORDER.indexOf(b.unit)
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  return a.unit.localeCompare(b.unit)
}

class UnitTotals {
  private map = new Map<string, UnitQuantity>()

  add(unit: string, quantity: number, confirmed: boolean) {
    const row = this.map.get(unit) ?? { unit, invoiced: 0, confirmed: 0 }
    row.invoiced += quantity
    if (confirmed) row.confirmed += quantity
    this.map.set(unit, row)
  }

  list(): UnitQuantity[] {
    return [...this.map.values()]
      .map((r) => ({ unit: r.unit, invoiced: round(r.invoiced), confirmed: round(r.confirmed) }))
      .sort(sortUnits)
  }
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export function buildSupplySummary(
  allInvoices: SupplyInvoice[],
  dispatches: SupplyDispatch[],
  filters: SupplyFilters,
  today: string,
) {
  const excluded: Record<string, number> = {}
  const executed = allInvoices.filter((inv) => {
    const status = inv.status.toLowerCase()
    if ((EXCLUDED_STATUSES as readonly string[]).includes(status)) {
      excluded[status] = (excluded[status] ?? 0) + 1
      return false
    }
    return true
  })

  // Filter options come from every executed invoice, before the filters narrow them.
  const customerOptions = new Map<string, string>()
  const productOptions = new Map<string, string>()
  for (const inv of executed) {
    customerOptions.set(inv.customerId, inv.customerName)
    for (const line of inv.lines ?? []) productOptions.set(productKey(line), line.name)
  }

  // Last invoice per customer across all executed invoices, so "currently
  // supplying" doesn't depend on the selected date window.
  const lastInvoiceEver = new Map<string, string>()
  for (const inv of executed) {
    const prev = lastInvoiceEver.get(inv.customerId)
    if (!prev || inv.date > prev) lastInvoiceEver.set(inv.customerId, inv.date)
  }
  const isActive = (customerId: string) => {
    const last = lastInvoiceEver.get(customerId)
    return !!last && daysBetween(last, today) <= ACTIVE_WINDOW_DAYS
  }

  const dispatchesByInvoice = new Map<string, SupplyDispatch[]>()
  for (const d of dispatches) {
    const list = dispatchesByInvoice.get(d.invoiceNumber) ?? []
    list.push(d)
    dispatchesByInvoice.set(d.invoiceNumber, list)
  }

  const inWindow = executed.filter((inv) =>
    (!filters.from || inv.date >= filters.from)
    && (!filters.to || inv.date <= filters.to)
    && (!filters.customerId || inv.customerId === filters.customerId))

  // With a product filter, only that product's lines count, and invoices
  // without it drop out.
  const lineMatches = (line: SupplyInvoiceLine) => !filters.product || productKey(line) === filters.product
  const scoped = filters.product
    ? inWindow.filter((inv) => (inv.lines ?? []).some(lineMatches))
    : inWindow

  type CustomerAcc = {
    customerId: string; customerName: string; gstNo: string | null; city: string | null; state: string | null
    invoiceCount: number; firstInvoiceDate: string; lastInvoiceDate: string
    invoicedValue: number; outstanding: number; confirmedInvoiceCount: number
    quantities: UnitTotals
    products: Map<string, { productId: string; name: string; unit: string; invoiced: number; confirmed: number; value: number; invoiceIds: Set<string> }>
  }
  type ProductAcc = {
    productId: string; name: string; unit: string; invoiced: number; confirmed: number; value: number
    invoiceIds: Set<string>; customers: Map<string, { customerId: string; customerName: string; invoiced: number }>
  }

  const customers = new Map<string, CustomerAcc>()
  const products = new Map<string, ProductAcc>()
  const months = new Map<string, { month: string; invoiceCount: number; value: number; quantities: UnitTotals }>()
  const totals = new UnitTotals()
  let invoicedValue = 0
  let outstanding = 0
  let confirmedInvoiceCount = 0
  let invoicesMissingLines = 0

  const invoices = scoped
    .slice()
    .sort((a, b) => (a.date === b.date ? b.invoiceNumber.localeCompare(a.invoiceNumber) : b.date.localeCompare(a.date)))
    .map((inv) => {
      const linked = dispatchesByInvoice.get(inv.invoiceNumber) ?? []
      const confirmed = linked.length > 0
      const lines = inv.lines === null ? null : inv.lines.filter(lineMatches)
      if (lines === null) invoicesMissingLines += 1

      // With a product filter the invoice value is that product's line amounts.
      const value = filters.product ? (lines ?? []).reduce((s, l) => s + l.amount, 0) : inv.total
      invoicedValue += value
      outstanding += inv.balance
      if (confirmed) confirmedInvoiceCount += 1

      const customer = customers.get(inv.customerId) ?? {
        customerId: inv.customerId, customerName: inv.customerName, gstNo: inv.gstNo, city: inv.city, state: inv.state,
        invoiceCount: 0, firstInvoiceDate: inv.date, lastInvoiceDate: inv.date,
        invoicedValue: 0, outstanding: 0, confirmedInvoiceCount: 0,
        quantities: new UnitTotals(), products: new Map(),
      }
      customer.invoiceCount += 1
      customer.invoicedValue += value
      customer.outstanding += inv.balance
      if (confirmed) customer.confirmedInvoiceCount += 1
      if (inv.date < customer.firstInvoiceDate) customer.firstInvoiceDate = inv.date
      if (inv.date > customer.lastInvoiceDate) customer.lastInvoiceDate = inv.date
      customer.gstNo ??= inv.gstNo
      customer.city ??= inv.city
      customer.state ??= inv.state
      customers.set(inv.customerId, customer)

      const monthKey = inv.date.slice(0, 7)
      const month = months.get(monthKey) ?? { month: monthKey, invoiceCount: 0, value: 0, quantities: new UnitTotals() }
      month.invoiceCount += 1
      month.value += value
      months.set(monthKey, month)

      for (const line of lines ?? []) {
        const unit = normalizeUnit(line.unit)
        const id = productKey(line)
        totals.add(unit, line.quantity, confirmed)
        customer.quantities.add(unit, line.quantity, confirmed)
        month.quantities.add(unit, line.quantity, confirmed)

        // A product sold in two units gets one row per unit.
        const key = `${id}|${unit}`
        const cp = customer.products.get(key) ?? { productId: id, name: line.name, unit, invoiced: 0, confirmed: 0, value: 0, invoiceIds: new Set<string>() }
        cp.invoiced += line.quantity
        if (confirmed) cp.confirmed += line.quantity
        cp.value += line.amount
        cp.invoiceIds.add(inv.invoiceId)
        customer.products.set(key, cp)

        const p = products.get(key) ?? { productId: id, name: line.name, unit, invoiced: 0, confirmed: 0, value: 0, invoiceIds: new Set<string>(), customers: new Map() }
        p.invoiced += line.quantity
        if (confirmed) p.confirmed += line.quantity
        p.value += line.amount
        p.invoiceIds.add(inv.invoiceId)
        const pc = p.customers.get(inv.customerId) ?? { customerId: inv.customerId, customerName: inv.customerName, invoiced: 0 }
        pc.invoiced += line.quantity
        p.customers.set(inv.customerId, pc)
        products.set(key, p)
      }

      return {
        invoiceId:       inv.invoiceId,
        invoiceNumber:   inv.invoiceNumber,
        date:            inv.date,
        dueDate:         inv.dueDate,
        status:          inv.status,
        customerId:      inv.customerId,
        customerName:    inv.customerName,
        referenceNumber: inv.referenceNumber,
        currencyCode:    inv.currencyCode,
        total:           round(value, 2),
        balance:         round(inv.balance, 2),
        lines:           lines?.map((l) => ({ ...l, unit: normalizeUnit(l.unit) })) ?? null,
        delivery:        confirmed
          ? { dispatches: linked.map((d) => ({ dispatchNumber: d.dispatchNumber, dispatchDate: d.dispatchDate, quantity: round(d.quantity) })) }
          : null,
      }
    })

  const customerRows = [...customers.values()]
    .map((c) => ({
      customerId:            c.customerId,
      customerName:          c.customerName,
      gstNo:                 c.gstNo,
      city:                  c.city,
      state:                 c.state,
      active:                isActive(c.customerId),
      lastInvoiceEver:       lastInvoiceEver.get(c.customerId) ?? c.lastInvoiceDate,
      invoiceCount:          c.invoiceCount,
      confirmedInvoiceCount: c.confirmedInvoiceCount,
      firstInvoiceDate:      c.firstInvoiceDate,
      lastInvoiceDate:       c.lastInvoiceDate,
      invoicedValue:         round(c.invoicedValue, 2),
      outstanding:           round(c.outstanding, 2),
      quantities:            c.quantities.list(),
      products:              [...c.products.values()]
        .map((p) => ({ productId: p.productId, name: p.name, unit: p.unit, invoiced: round(p.invoiced), confirmed: round(p.confirmed), value: round(p.value, 2), invoiceCount: p.invoiceIds.size }))
        .sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => b.invoicedValue - a.invoicedValue)

  const productRows = [...products.values()]
    .map((p) => ({
      productId:     p.productId,
      name:          p.name,
      unit:          p.unit,
      invoiced:      round(p.invoiced),
      confirmed:     round(p.confirmed),
      value:         round(p.value, 2),
      invoiceCount:  p.invoiceIds.size,
      customerCount: p.customers.size,
      customers:     [...p.customers.values()].map((c) => ({ ...c, invoiced: round(c.invoiced) })).sort((a, b) => b.invoiced - a.invoiced),
    }))
    .sort((a, b) => b.value - a.value)

  const monthly = [...months.values()]
    .map((m) => ({ month: m.month, invoiceCount: m.invoiceCount, value: round(m.value, 2), quantities: m.quantities.list() }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    window: { from: filters.from ?? null, to: filters.to ?? null },
    totals: {
      customerCount:         customerRows.length,
      activeCustomerCount:   customerRows.filter((c) => c.active).length,
      invoiceCount:          invoices.length,
      confirmedInvoiceCount,
      invoicedValue:         round(invoicedValue, 2),
      outstanding:           round(outstanding, 2),
      quantities:            totals.list(),
    },
    customers: customerRows,
    products:  productRows,
    monthly,
    invoices,
    coverage: {
      invoicesMissingLines,
      excludedStatuses: excluded,
      activeWindowDays: ACTIVE_WINDOW_DAYS,
    },
    filterOptions: {
      customers: [...customerOptions.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      products:  [...productOptions.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    },
  }
}

export type SupplySummary = ReturnType<typeof buildSupplySummary>
