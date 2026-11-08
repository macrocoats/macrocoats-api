import { describe, expect, it } from 'vitest'
import { bucketFor, daysPastDue, summariseReceivables, type ReceivableInput } from '../../src/utils/receivablesAgeing.js'

const today = new Date(2026, 10, 8) // 8 Nov 2026, local
const inv = (id: string, customerName: string, dueDate: string | null, balance: number, status = 'sent', total = balance): ReceivableInput =>
  ({ invoiceId: id, invoiceNumber: `INV-${id}`, customerName, status, total, balance, invoiceDate: '2026-01-01', dueDate })

describe('daysPastDue / bucketFor', () => {
  it('counts calendar days past the due date; negative when not yet due', () => {
    expect(daysPastDue('2026-11-08', today)).toBe(0)
    expect(daysPastDue('2026-11-01', today)).toBe(7)
    expect(daysPastDue('2026-11-20', today)).toBe(-12)
    expect(daysPastDue(null, today)).toBeNull()
  })
  it('buckets the boundaries correctly', () => {
    expect(bucketFor(0)).toBe('current')
    expect(bucketFor(1)).toBe('d30')
    expect(bucketFor(30)).toBe('d30')
    expect(bucketFor(31)).toBe('d60')
    expect(bucketFor(90)).toBe('d90')
    expect(bucketFor(91)).toBe('d90plus')
    expect(bucketFor(null)).toBe('current')
  })
})

describe('summariseReceivables', () => {
  const rows = [
    inv('1', 'ZF Rane', '2026-11-20', 10000),                     // not due
    inv('2', 'ZF Rane', '2026-07-01', 5000, 'overdue'),            // 130 d
    inv('3', 'TVS', '2026-10-20', 20000, 'partially_paid', 30000), // 19 d
    inv('3', 'TVS', '2026-10-20', 20000, 'partially_paid', 30000), // duplicate (fetched under two statuses)
    inv('4', 'TVS', '2026-09-01', 0, 'paid'),
    inv('5', 'L&T', '2026-09-01', 3000, 'void'),
    inv('6', 'L&T', '2026-08-25', 4000, 'overdue'),               // 75 d
    inv('7', 'Brakes', null, 1000),                                // undated
  ]
  const r = summariseReceivables(rows, today)

  it('totals open invoices once each', () => {
    expect(r.totals).toEqual({ outstanding: 40000, invoiceCount: 5, customerCount: 4, overdue: 29000, overdueCount: 3, notDue: 11000, undated: 1 })
  })
  it('buckets by days past due; shares sum to 1', () => {
    expect(r.buckets.map((b) => [b.key, b.value, b.count])).toEqual([
      ['current', 11000, 2], ['d30', 20000, 1], ['d60', 0, 0], ['d90', 4000, 1], ['d90plus', 5000, 1],
    ])
    expect(r.buckets.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1)
  })
  it('ranks customers by overdue amount', () => {
    expect(r.customers.map((c) => [c.name, c.overdue, c.over90, c.maxDaysPastDue])).toEqual([
      ['TVS', 20000, 0, 19], ['ZF Rane', 5000, 5000, 130], ['L&T', 4000, 0, 75], ['Brakes', 0, 0, null],
    ])
  })
  it('lists invoices most overdue first', () => {
    expect(r.invoices.map((i) => i.invoiceId)).toEqual(['2', '6', '3', '1', '7'])
  })
})
