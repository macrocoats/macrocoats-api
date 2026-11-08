/**
 * Receivables ageing by days past DUE date (pure, unit-tested in
 * tests/unit/receivables-ageing.test.ts). Fed by every unpaid Zoho invoice
 * (zoho-invoice.service.ts#listZohoReceivables) — no date window.
 */

export interface ReceivableInput {
  invoiceId:     string
  invoiceNumber: string
  customerName:  string | null
  status:        string
  total:         number
  balance:       number
  invoiceDate:   string | null
  dueDate:       string | null
}

export type AgeingBucketKey = 'current' | 'd30' | 'd60' | 'd90' | 'd90plus'

export const AGEING_BUCKETS: { key: AgeingBucketKey; label: string; min: number; max: number }[] = [
  { key: 'current', label: 'Not yet due',      min: -Infinity, max: 0 },
  { key: 'd30',     label: '1–30 days overdue',  min: 1,  max: 30 },
  { key: 'd60',     label: '31–60 days overdue', min: 31, max: 60 },
  { key: 'd90',     label: '61–90 days overdue', min: 61, max: 90 },
  { key: 'd90plus', label: 'Over 90 days overdue', min: 91, max: Infinity },
]

const DAY_MS = 86_400_000

const dayUtc = (value: string | null | undefined): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** Local calendar day as a UTC midnight timestamp (server-local, like investor-dashboard). */
const todayUtc = (today: Date) => Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())

/** Whole days past the due date (negative = not yet due); null without a due date. */
export function daysPastDue(dueDate: string | null | undefined, today = new Date()): number | null {
  const due = dayUtc(dueDate)
  return due === null ? null : Math.round((todayUtc(today) - due) / DAY_MS)
}

export function bucketFor(days: number | null): AgeingBucketKey {
  if (days === null) return 'current'
  return AGEING_BUCKETS.find((b) => days >= b.min && days <= b.max)!.key
}

const isOpen = (inv: ReceivableInput) => {
  const status = inv.status.toLowerCase()
  return status !== 'void' && status !== 'draft' && status !== 'paid' && Number.isFinite(inv.balance) && inv.balance > 0
}

export interface ReceivablesSummary {
  totals: {
    outstanding: number; invoiceCount: number; customerCount: number
    overdue: number; overdueCount: number; notDue: number; undated: number
  }
  buckets: { key: AgeingBucketKey; label: string; value: number; count: number; share: number }[]
  customers: { name: string; outstanding: number; overdue: number; over90: number; invoiceCount: number; maxDaysPastDue: number | null }[]
  invoices: (ReceivableInput & { daysPastDue: number | null; bucket: AgeingBucketKey })[]
}

/** Open invoices (balance > 0, not draft/void/paid) aged by due date; de-duplicated by invoiceId. */
export function summariseReceivables(rows: ReceivableInput[], today = new Date()): ReceivablesSummary {
  const seen = new Set<string>()
  const invoices = rows
    .filter((inv) => isOpen(inv) && !seen.has(inv.invoiceId) && seen.add(inv.invoiceId))
    .map((inv) => {
      const days = daysPastDue(inv.dueDate, today)
      return { ...inv, daysPastDue: days, bucket: bucketFor(days) }
    })
    .sort((a, b) => (b.daysPastDue ?? -Infinity) - (a.daysPastDue ?? -Infinity))

  const outstanding = invoices.reduce((s, i) => s + i.balance, 0)
  const overdueRows = invoices.filter((i) => i.bucket !== 'current')
  const overdue = overdueRows.reduce((s, i) => s + i.balance, 0)

  const buckets = AGEING_BUCKETS.map((b) => {
    const inBucket = invoices.filter((i) => i.bucket === b.key)
    const value = inBucket.reduce((s, i) => s + i.balance, 0)
    return { key: b.key, label: b.label, value, count: inBucket.length, share: outstanding > 0 ? value / outstanding : 0 }
  })

  const byCustomer = new Map<string, ReceivablesSummary['customers'][number]>()
  for (const inv of invoices) {
    const name = inv.customerName?.trim() || 'Unknown customer'
    const cur = byCustomer.get(name) ?? { name, outstanding: 0, overdue: 0, over90: 0, invoiceCount: 0, maxDaysPastDue: null }
    cur.outstanding += inv.balance
    cur.invoiceCount += 1
    if (inv.bucket !== 'current') cur.overdue += inv.balance
    if (inv.bucket === 'd90plus') cur.over90 += inv.balance
    if (inv.daysPastDue !== null && (cur.maxDaysPastDue === null || inv.daysPastDue > cur.maxDaysPastDue)) cur.maxDaysPastDue = inv.daysPastDue
    byCustomer.set(name, cur)
  }
  const customers = [...byCustomer.values()].sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding)

  return {
    totals: {
      outstanding, invoiceCount: invoices.length, customerCount: customers.length,
      overdue, overdueCount: overdueRows.length, notDue: outstanding - overdue,
      undated: invoices.filter((i) => i.daysPastDue === null).length,
    },
    buckets,
    customers,
    invoices,
  }
}
