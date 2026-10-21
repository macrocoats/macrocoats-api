import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { customerPipelineEntries, dispatches, type CustomerPipelineEntry } from '../../db/schema/index.js'
import { isZohoConfigured, zohoGet } from '../zoho-invoice/zoho-invoice.service.js'
import {
  buildSupplySummary,
  type SupplyDispatch,
  type SupplyInvoice,
  type SupplySummary,
} from '../../utils/supplySummary.js'
import type { CreatePipelineEntryBody, SupplySummaryQuery, UpdatePipelineEntryBody } from './customer-supply.schema.js'

// ── Zoho reads ─────────────────────────────────────────────────────────────────

interface ZohoListRow {
  invoice_id:          string
  invoice_number:      string
  status:              string
  date:                string
  due_date?:           string
  customer_id:         string
  customer_name:       string
  reference_number?:   string
  currency_code?:      string
  total:               number
  balance:             number
  last_modified_time?: string
}

interface ZohoDetail {
  invoice: ZohoListRow & {
    gst_no?:          string
    billing_address?: { city?: string; state?: string }
    line_items?: Array<{
      item_id?:    string
      name?:       string
      description?: string
      quantity?:   number
      unit?:       string
      rate?:       number
      item_total?: number
    }>
  }
}

const LIST_PAGE_SIZE = 200
const LIST_MAX_PAGES = 25
const LIST_TTL_MS = 2 * 60_000
/**
 * Zoho allows about 100 API calls a minute per organization. Line items need
 * one call per invoice, so a single summary fetches at most this many new or
 * changed invoices; the rest are reported as pending and fill in on the next
 * refresh. Fetched details are cached until Zoho's last_modified_time changes.
 */
const DETAIL_FETCH_LIMIT = 60
const DETAIL_CONCURRENCY = 4

let listCache: { fetchedAt: number; rows: ZohoListRow[] } | null = null
const detailCache = new Map<string, { modified: string; invoice: SupplyInvoice }>()

async function listAllInvoices(force: boolean): Promise<ZohoListRow[]> {
  if (!force && listCache && Date.now() - listCache.fetchedAt < LIST_TTL_MS) return listCache.rows

  const rows: ZohoListRow[] = []
  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const body = await zohoGet<{ invoices?: ZohoListRow[]; page_context?: { has_more_page?: boolean } }>(
      '/invoice/v3/invoices',
      { page: String(page), per_page: String(LIST_PAGE_SIZE), sort_column: 'date', sort_order: 'D' },
    )
    rows.push(...(body.invoices ?? []))
    if (!body.page_context?.has_more_page) break
  }
  listCache = { fetchedAt: Date.now(), rows }
  return rows
}

const text = (v: string | undefined | null) => (v && v.trim() ? v.trim() : null)

function fromListRow(row: ZohoListRow, lines: SupplyInvoice['lines'], extra: Partial<SupplyInvoice> = {}): SupplyInvoice {
  return {
    invoiceId:       row.invoice_id,
    invoiceNumber:   row.invoice_number,
    date:            row.date,
    dueDate:         text(row.due_date),
    status:          row.status,
    customerId:      row.customer_id,
    customerName:    row.customer_name,
    gstNo:           null,
    city:            null,
    state:           null,
    referenceNumber: text(row.reference_number),
    currencyCode:    text(row.currency_code),
    total:           Number(row.total) || 0,
    balance:         Number(row.balance) || 0,
    lines,
    ...extra,
  }
}

async function fetchDetail(row: ZohoListRow): Promise<SupplyInvoice> {
  const { invoice } = await zohoGet<ZohoDetail>(`/invoice/v3/invoices/${encodeURIComponent(row.invoice_id)}`)
  const lines = (invoice.line_items ?? []).map((l) => ({
    itemId:   text(l.item_id),
    name:     text(l.name) ?? text(l.description) ?? 'Unnamed item',
    quantity: Number(l.quantity) || 0,
    unit:     text(l.unit),
    rate:     Number(l.rate) || 0,
    amount:   Number(l.item_total) || 0,
  }))
  return fromListRow({ ...row, ...invoice }, lines, {
    gstNo: text(invoice.gst_no),
    city:  text(invoice.billing_address?.city),
    state: text(invoice.billing_address?.state),
  })
}

/** Drafts and voids never need line items. */
const needsLines = (row: ZohoListRow) => !['draft', 'void'].includes(row.status.toLowerCase())

async function withDetails(rows: ZohoListRow[]): Promise<{ invoices: SupplyInvoice[]; pending: number; failed: number }> {
  const todo = rows.filter((r) => {
    if (!needsLines(r)) return false
    const cached = detailCache.get(r.invoice_id)
    return !cached || cached.modified !== (r.last_modified_time ?? '')
  })
  const batch = todo.slice(0, DETAIL_FETCH_LIMIT)
  let failed = 0

  for (let i = 0; i < batch.length; i += DETAIL_CONCURRENCY) {
    const chunk = batch.slice(i, i + DETAIL_CONCURRENCY)
    const results = await Promise.allSettled(chunk.map(fetchDetail))
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') {
        detailCache.set(chunk[j].invoice_id, { modified: chunk[j].last_modified_time ?? '', invoice: result.value })
      } else {
        failed += 1
      }
    })
  }

  const invoices = rows.map((r) => {
    const cached = detailCache.get(r.invoice_id)
    if (cached && cached.modified === (r.last_modified_time ?? '')) {
      // Status and balance change without a new line-item read being needed.
      return { ...cached.invoice, status: r.status, balance: Number(r.balance) || 0, total: Number(r.total) || 0 }
    }
    return fromListRow(r, needsLines(r) ? null : [])
  })
  return { invoices, pending: Math.max(todo.length - batch.length, 0), failed }
}

async function listInvoiceDispatches(): Promise<SupplyDispatch[]> {
  const rows = await db
    .select({
      invoiceNumber:  dispatches.invoiceNumber,
      dispatchNumber: dispatches.dispatchNumber,
      dispatchDate:   dispatches.dispatchDate,
      quantity:       dispatches.quantity,
    })
    .from(dispatches)
    .where(and(isNotNull(dispatches.invoiceNumber), isNull(dispatches.voidedAt)))
  return rows.map((r) => ({
    invoiceNumber:  (r.invoiceNumber as string).trim(),
    dispatchNumber: r.dispatchNumber,
    dispatchDate:   r.dispatchDate,
    quantity:       Number(r.quantity),
  }))
}

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type SupplySummaryResult =
  | (SupplySummary & { source: 'zoho'; generatedAt: string; coverage: SupplySummary['coverage'] & { detailsPending: number; detailsFailed: number; invoicesListed: number } })
  | { code: 'ZOHO_NOT_CONFIGURED' }
  | { code: 'ZOHO_SYNC_FAILED'; message: string }

export async function getSupplySummary(query: SupplySummaryQuery): Promise<SupplySummaryResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }

  try {
    const rows = await listAllInvoices(query.refresh === 'true')
    const [{ invoices, pending, failed }, linked] = await Promise.all([withDetails(rows), listInvoiceDispatches()])
    const summary = buildSupplySummary(invoices, linked, query, localToday())
    return {
      source:      'zoho',
      generatedAt: new Date(listCache?.fetchedAt ?? Date.now()).toISOString(),
      ...summary,
      coverage: { ...summary.coverage, invoicesListed: rows.length, detailsPending: pending, detailsFailed: failed },
    }
  } catch (err) {
    return { code: 'ZOHO_SYNC_FAILED', message: err instanceof Error ? err.message : 'Unknown Zoho error' }
  }
}

// ── Pipeline (trials and vendor registration) ──────────────────────────────────

function toPipelineResponse(row: CustomerPipelineEntry) {
  return {
    id:                 row.id,
    companyName:        row.companyName,
    location:           row.location,
    companyId:          row.companyId,
    trialStatus:        row.trialStatus,
    vendorRegistration: row.vendorRegistration,
    products:           row.products,
    nextStep:           row.nextStep,
    notes:              row.notes,
    statusDate:         row.statusDate,
    archived:           row.archivedAt !== null,
    createdAt:          row.createdAt.toISOString(),
    updatedAt:          row.updatedAt.toISOString(),
  }
}

export type PipelineEntryResponse = ReturnType<typeof toPipelineResponse>

export async function listPipelineEntries(includeArchived: boolean): Promise<PipelineEntryResponse[]> {
  const rows = await db
    .select()
    .from(customerPipelineEntries)
    .where(includeArchived ? undefined : isNull(customerPipelineEntries.archivedAt))
    .orderBy(desc(customerPipelineEntries.updatedAt), asc(customerPipelineEntries.companyName))
  return rows.map(toPipelineResponse)
}

export async function createPipelineEntry(body: CreatePipelineEntryBody, userId?: string): Promise<PipelineEntryResponse> {
  const [row] = await db
    .insert(customerPipelineEntries)
    .values({ ...body, createdBy: userId ?? null })
    .returning()
  return toPipelineResponse(row)
}

export async function updatePipelineEntry(id: string, body: UpdatePipelineEntryBody): Promise<PipelineEntryResponse | null> {
  const { archived, ...fields } = body
  const [row] = await db
    .update(customerPipelineEntries)
    .set({
      ...fields,
      ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      updatedAt: new Date(),
    })
    .where(eq(customerPipelineEntries.id, id))
    .returning()
  return row ? toPipelineResponse(row) : null
}

export async function deletePipelineEntry(id: string): Promise<boolean> {
  const rows = await db.delete(customerPipelineEntries).where(eq(customerPipelineEntries.id, id)).returning({ id: customerPipelineEntries.id })
  return rows.length > 0
}
