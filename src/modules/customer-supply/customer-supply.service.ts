import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { customerPipelineEntries, dispatches, zohoInvoiceDetails, type CustomerPipelineEntry } from '../../db/schema/index.js'
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

/**
 * The in-memory detail cache is a read-through copy of `zoho_invoice_details`:
 * loaded from the table once per process, written back after every Zoho read,
 * so line items survive restarts and deploys instead of being re-read from Zoho.
 */
let detailCacheLoaded: Promise<void> | null = null
function ensureDetailCacheLoaded(): Promise<void> {
  detailCacheLoaded ??= (async () => {
    const rows = await db.select().from(zohoInvoiceDetails)
    for (const r of rows) detailCache.set(r.zohoInvoiceId, { modified: r.lastModified, invoice: r.payload as SupplyInvoice })
  })().catch((err) => {
    detailCacheLoaded = null // retry on the next request
    throw err
  })
  return detailCacheLoaded
}

async function persistDetails(entries: Array<{ modified: string; invoice: SupplyInvoice }>) {
  if (!entries.length) return
  await db.insert(zohoInvoiceDetails)
    .values(entries.map(({ modified, invoice }) => ({
      zohoInvoiceId:  invoice.invoiceId,
      lastModified:   modified,
      invoiceDate:    invoice.date || null,
      zohoCustomerId: invoice.customerId || null,
      payload:        invoice,
      fetchedAt:      new Date(),
    })))
    .onConflictDoUpdate({
      target: zohoInvoiceDetails.zohoInvoiceId,
      set: {
        lastModified:   sql`excluded.last_modified`,
        invoiceDate:    sql`excluded.invoice_date`,
        zohoCustomerId: sql`excluded.zoho_customer_id`,
        payload:        sql`excluded.payload`,
        fetchedAt:      sql`excluded.fetched_at`,
      },
    })
}

async function withDetails(rows: ZohoListRow[], readLimit = DETAIL_FETCH_LIMIT): Promise<{ invoices: SupplyInvoice[]; pending: number; failed: number; read: number }> {
  await ensureDetailCacheLoaded()
  const todo = rows.filter((r) => {
    if (!needsLines(r)) return false
    const cached = detailCache.get(r.invoice_id)
    return !cached || cached.modified !== (r.last_modified_time ?? '')
  })
  const batch = todo.slice(0, readLimit)
  let failed = 0
  const fresh: Array<{ modified: string; invoice: SupplyInvoice }> = []

  for (let i = 0; i < batch.length; i += DETAIL_CONCURRENCY) {
    const chunk = batch.slice(i, i + DETAIL_CONCURRENCY)
    const results = await Promise.allSettled(chunk.map(fetchDetail))
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') {
        const entry = { modified: chunk[j].last_modified_time ?? '', invoice: result.value }
        detailCache.set(chunk[j].invoice_id, entry)
        fresh.push(entry)
      } else {
        failed += 1
      }
    })
  }
  await persistDetails(fresh)

  const invoices = rows.map((r) => {
    const cached = detailCache.get(r.invoice_id)
    if (cached && cached.modified === (r.last_modified_time ?? '')) {
      // Status and balance change without a new line-item read being needed.
      return { ...cached.invoice, status: r.status, balance: Number(r.balance) || 0, total: Number(r.total) || 0 }
    }
    return fromListRow(r, needsLines(r) ? null : [])
  })
  return { invoices, pending: Math.max(todo.length - batch.length, 0), failed, read: fresh.length }
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

/**
 * Every Zoho invoice with its line items where known (from the durable cache,
 * plus up to `readLimit` new/changed invoices read from Zoho now). Shared by
 * the supply summary and the investor dashboard; throws on Zoho errors.
 * `listed` is the raw list, for counts.
 */
export async function listInvoicesWithDetails(opts: { force?: boolean; readLimit?: number } = {}) {
  const listed = await listAllInvoices(opts.force ?? false)
  const result = await withDetails(listed, opts.readLimit ?? DETAIL_FETCH_LIMIT)
  return { ...result, listed }
}

/**
 * Backfill helper: read up to `maxReads` missing/changed invoice details from
 * Zoho in rate-limit-sized rounds, pausing `pauseMs` between rounds. Returns
 * how many were read and how many are still pending.
 */
export async function fillInvoiceDetails(opts: { maxReads: number; pauseMs?: number; log?: (msg: string) => void }) {
  let read = 0
  let pending = Infinity
  let failed = 0
  let first = true
  while (read < opts.maxReads && pending > 0) {
    const round = Math.min(DETAIL_FETCH_LIMIT, opts.maxReads - read)
    const res = await listInvoicesWithDetails({ force: first, readLimit: round })
    first = false
    read += res.read
    failed += res.failed
    pending = res.pending
    opts.log?.(`read ${read} · pending ${pending} · failed so far ${failed}`)
    if (res.read === 0) break // nothing left to read, or Zoho refusing every read — stop rather than spin
    if (pending > 0 && read < opts.maxReads) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 60_000))
  }
  return { read, pending, failed }
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
    const [{ invoices, pending, failed, listed: rows }, linked] = await Promise.all([
      listInvoicesWithDetails({ force: query.refresh === 'true' }),
      listInvoiceDispatches(),
    ])
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
