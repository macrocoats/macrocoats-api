import { describe, it, expect } from 'vitest'
import {
  toSaleLines, windowTotals, trend, breakdown, missingIn, makeCompanyMatcher, makeProductMatcher, periodOf,
} from '../../src/utils/invoicedSales.js'
import type { SupplyInvoice } from '../../src/utils/supplySummary.js'

const inv = (over: Partial<SupplyInvoice>): SupplyInvoice => ({
  invoiceId: 'i', invoiceNumber: 'INV', date: '2026-10-10', dueDate: null, status: 'paid',
  customerId: 'z1', customerName: 'ZF Rane Automotive India Pvt Ltd', gstNo: null, city: null, state: 'Tamil Nadu',
  referenceNumber: null, currencyCode: 'INR', total: 0, balance: 0, lines: [], ...over,
})
const line = (name: string, amount: number) => ({ itemId: name, name, quantity: 1, unit: 'kg', rate: amount, amount })

const companies = [
  { id: 'co-zf', displayName: 'ZF Rane Automotive', state: 'Tamil Nadu' },
  { id: 'co-tvs', displayName: 'TVS Srichakra Limited', state: 'Tamil Nadu' },
]
const products = [
  { key: 'uniklean-sp', displayName: 'UNIKLEAN-SP' },
  { key: 'uniklean-sf', displayName: 'UNIKLEAN-SF' },
  { key: 'corrcut-100', displayName: 'CORRCUT 100' },
]

const invoices: SupplyInvoice[] = [
  inv({ invoiceId: 'a', date: '2026-10-10', lines: [line('UNIKLEAN-SP 123521560209', 1000), line('CORRCUT 100', 500)] }),
  inv({ invoiceId: 'b', date: '2026-11-02', lines: [line('UNKLEAN-SP 123521560209', 400)] }),
  inv({ invoiceId: 'c', date: '2026-11-03', customerId: 'z2', customerName: 'TVS SRICHAKRA LTD', state: null, lines: [line('UNIKLEAN-SF', 300)] }),
  inv({ invoiceId: 'd', date: '2025-11-05', lines: [line('UNIKLEAN-SP', 250)] }),
  inv({ invoiceId: 'v', date: '2026-11-03', status: 'void', lines: [line('UNIKLEAN-SP', 9999)] }),
  inv({ invoiceId: 'm', date: '2026-11-04', lines: null }),
]

describe('matchers', () => {
  it('matches Zoho customer names to portal companies ignoring legal suffixes', () => {
    const m = makeCompanyMatcher(companies)
    expect(m('ZF Rane Automotive India Pvt Ltd')?.id).toBe('co-zf')
    expect(m('TVS SRICHAKRA LTD')?.id).toBe('co-tvs')
    expect(m('Unknown Customer')).toBeNull()
  })

  it('matches production names with "P. LTD" and a bracketed plant location', () => {
    const m = makeCompanyMatcher([
      { id: 'co-galva', displayName: 'Galva Decoparts Pvt Ltd (Cheyyar)', state: null },
      { id: 'co-zf', displayName: 'ZF Rane Automotive India Private Limited', state: null },
      { id: 'co-lt', displayName: 'L&T Valves Limited', state: null },
    ])
    expect(m('GALVA DECO PARTS P. LTD')?.id).toBe('co-galva')
    expect(m('ZF Rane Automotive India Pvt. Ltd.')?.id).toBe('co-zf')
    expect(m('L&T VALVES LTD')?.id).toBe('co-lt')
  })

  it('matches item names to products, longest first, typo corrected', () => {
    const m = makeProductMatcher(products)
    expect(m('UNIKLEAN-SP 123521560209')?.key).toBe('uniklean-sp')
    expect(m('UNKLEAN-SP 123521560209')?.key).toBe('uniklean-sp')
    expect(m('UNIKLEAN-SF')?.key).toBe('uniklean-sf')
    expect(m('Freight charges')).toBeNull()
  })
})

describe('invoiced sales', () => {
  const { lines, missing } = toSaleLines(invoices, companies, products)

  it('skips void invoices and reports invoices without line items', () => {
    expect(lines.some((l) => l.invoiceId === 'v')).toBe(false)
    expect(missing).toEqual([{ invoiceId: 'm', date: '2026-11-04' }])
    expect(missingIn(missing, '2026-11-01', '2026-11-30')).toBe(1)
  })

  it('totals a window with customer and product filters', () => {
    expect(windowTotals(lines, '2026-11-01', '2026-11-30')).toMatchObject({ value: 700, invoices: 2, customers: 2 })
    expect(windowTotals(lines, '2026-10-01', '2026-11-30', { productKey: 'uniklean-sp' }).value).toBe(1400)
    expect(windowTotals(lines, '2026-10-01', '2026-11-30', { customerId: 'co-tvs' }).value).toBe(300)
  })

  it('builds trailing trends with the same period a year earlier', () => {
    const t = trend(lines, new Date(2026, 10, 3), 'month', 12)
    expect(t).toHaveLength(12)
    expect(t.at(-1)).toMatchObject({ period: '2026-11', totalValue: 700, priorTotalValue: 250, invoiceCount: 2 })
    expect(trend(lines, new Date(2026, 10, 3), 'quarter', 8).at(-1)).toMatchObject({ period: '2026-Q4', totalValue: 2200, priorTotalValue: 250 })
    expect(trend(lines, new Date(2026, 10, 3), 'year', 5).at(-1)).toMatchObject({ period: '2026', totalValue: 2200, priorTotalValue: 250 })
  })

  it('breaks down by customer, product and region', () => {
    const byProduct = breakdown(lines, '2026-10-01', '2026-11-30', (l) => l.productKey ?? l.productName)
    expect(byProduct.map((r) => [r.key, r.totalValue])).toEqual([['uniklean-sp', 1400], ['corrcut-100', 500], ['uniklean-sf', 300]])
    const byRegion = breakdown(lines, '2026-10-01', '2026-11-30', (l) => l.region)
    expect(byRegion[0]).toMatchObject({ key: 'Tamil Nadu', totalValue: 2200 }) // TVS has no invoice state → company state
  })

  it('labels periods', () => {
    expect([periodOf('2026-02-10', 'month'), periodOf('2026-02-10', 'quarter'), periodOf('2026-02-10', 'year')]).toEqual(['2026-02', '2026-Q1', '2026'])
  })
})
