import { describe, it, expect } from 'vitest'
import { buildSupplySummary, normalizeUnit, type SupplyInvoice } from '../../src/utils/supplySummary.js'

const invoice = (over: Partial<SupplyInvoice>): SupplyInvoice => ({
  invoiceId: 'i1', invoiceNumber: 'INV-001', date: '2026-09-10', dueDate: null, status: 'paid',
  customerId: 'c1', customerName: 'Customer One', gstNo: null, city: null, state: null,
  referenceNumber: null, currencyCode: 'INR', total: 0, balance: 0, lines: [],
  ...over,
})

const line = (name: string, quantity: number, unit: string | null, amount: number, itemId: string | null = name) =>
  ({ itemId, name, quantity, unit, rate: quantity ? amount / quantity : 0, amount })

describe('normalizeUnit', () => {
  it('maps kilogram and litre spellings', () => {
    expect(['kg', 'Kgs', 'KG.', 'kilogram'].map(normalizeUnit)).toEqual(['KG', 'KG', 'KG', 'KG'])
    expect(['L', 'ltr', 'Ltrs', 'litre', 'Liters', 'lit'].map(normalizeUnit)).toEqual(['L', 'L', 'L', 'L', 'L', 'L'])
  })

  it('keeps other units and flags missing ones', () => {
    expect(normalizeUnit('nos')).toBe('NOS')
    expect(normalizeUnit('')).toBe('Unspecified')
    expect(normalizeUnit(null)).toBe('Unspecified')
  })
})

describe('buildSupplySummary', () => {
  const invoices: SupplyInvoice[] = [
    invoice({ invoiceId: 'a', invoiceNumber: 'INV-1', date: '2026-08-01', customerId: 'galva', customerName: 'Galva Deco Parts', total: 1180, balance: 0,
      lines: [line('UNIKLEAN-SP', 200, 'kg', 1000)] }),
    invoice({ invoiceId: 'b', invoiceNumber: 'INV-2', date: '2026-09-15', customerId: 'galva', customerName: 'Galva Deco Parts', total: 590, balance: 590,
      lines: [line('UNIKLEAN-SP', 100, 'Kgs', 500)] }),
    invoice({ invoiceId: 'c', invoiceNumber: 'INV-3', date: '2026-09-20', customerId: 'zf', customerName: 'ZF Rane', total: 2360, balance: 0,
      lines: [line('CORRCUT 100', 210, 'ltr', 1500), line('UNIKLEAN-SP', 50, 'kg', 500)] }),
    invoice({ invoiceId: 'd', invoiceNumber: 'INV-4', date: '2026-09-25', customerId: 'zf', customerName: 'ZF Rane', status: 'void', total: 9999,
      lines: [line('CORRCUT 100', 999, 'ltr', 9999)] }),
    invoice({ invoiceId: 'e', invoiceNumber: 'INV-5', date: '2025-01-05', customerId: 'old', customerName: 'Old Customer', total: 100,
      lines: [line('UNIPASS', 10, 'kg', 100)] }),
  ]
  const dispatches = [{ invoiceNumber: 'INV-1', dispatchNumber: 'DSP-1', dispatchDate: '2026-08-01', quantity: 200 }]

  const all = buildSupplySummary(invoices, dispatches, {}, '2026-10-21')

  it('excludes void and draft invoices and counts executed orders', () => {
    expect(all.totals.invoiceCount).toBe(4)
    expect(all.coverage.excludedStatuses).toEqual({ void: 1 })
    expect(all.totals.invoicedValue).toBe(1180 + 590 + 2360 + 100)
    expect(all.totals.outstanding).toBe(590)
  })

  it('totals quantities per unit without converting KG to litres', () => {
    expect(all.totals.quantities).toEqual([
      { unit: 'KG', invoiced: 360, confirmed: 200 },
      { unit: 'L', invoiced: 210, confirmed: 0 },
    ])
  })

  it('builds customer-wise rows with active status from the last invoice', () => {
    const galva = all.customers.find((c) => c.customerId === 'galva')!
    expect(galva.invoiceCount).toBe(2)
    expect(galva.confirmedInvoiceCount).toBe(1)
    expect(galva.active).toBe(true)
    expect(galva.products).toEqual([
      { productId: 'UNIKLEAN-SP', name: 'UNIKLEAN-SP', unit: 'KG', invoiced: 300, confirmed: 200, value: 1500, invoiceCount: 2 },
    ])
    expect(all.customers.find((c) => c.customerId === 'old')!.active).toBe(false)
    expect(all.totals.activeCustomerCount).toBe(2)
  })

  it('builds product-wise rows across customers', () => {
    const sp = all.products.find((p) => p.productId === 'UNIKLEAN-SP')!
    expect(sp.invoiced).toBe(350)
    expect(sp.customerCount).toBe(2)
    expect(sp.invoiceCount).toBe(3)
  })

  it('marks delivery only on invoices with a dispatch record', () => {
    expect(all.invoices.find((i) => i.invoiceNumber === 'INV-1')!.delivery?.dispatches).toHaveLength(1)
    expect(all.invoices.find((i) => i.invoiceNumber === 'INV-2')!.delivery).toBeNull()
    expect(all.invoices[0].invoiceNumber).toBe('INV-3') // newest first
  })

  it('applies date, customer and product filters but keeps all filter options', () => {
    const window = buildSupplySummary(invoices, dispatches, { from: '2026-09-01', to: '2026-09-30' }, '2026-10-21')
    expect(window.totals.invoiceCount).toBe(2)
    // Active status ignores the window: Galva is still active.
    expect(window.customers.find((c) => c.customerId === 'galva')!.active).toBe(true)

    const product = buildSupplySummary(invoices, dispatches, { product: 'CORRCUT 100' }, '2026-10-21')
    expect(product.totals.invoiceCount).toBe(1)
    expect(product.totals.invoicedValue).toBe(1500)
    expect(product.totals.quantities).toEqual([{ unit: 'L', invoiced: 210, confirmed: 0 }])
    expect(product.filterOptions.products.map((p) => p.name)).toEqual(['CORRCUT 100', 'UNIKLEAN-SP', 'UNIPASS'])

    const customer = buildSupplySummary(invoices, dispatches, { customerId: 'zf' }, '2026-10-21')
    expect(customer.customers.map((c) => c.customerId)).toEqual(['zf'])
  })

  it('groups by month', () => {
    expect(all.monthly.map((m) => [m.month, m.invoiceCount])).toEqual([['2025-01', 1], ['2026-08', 1], ['2026-09', 2]])
  })

  it('reports invoices whose line items could not be read', () => {
    const missing = buildSupplySummary([invoice({ lines: null, total: 50 })], [], {}, '2026-10-21')
    expect(missing.coverage.invoicesMissingLines).toBe(1)
    expect(missing.totals.invoicedValue).toBe(50)
    expect(missing.totals.quantities).toEqual([])
  })
})
