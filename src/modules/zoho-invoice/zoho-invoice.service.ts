import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { zohoInvoiceSyncs, dispatches, batches, type ZohoInvoiceSync, type NewZohoInvoiceSync } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import type { ListZohoInvoicesQuery } from './zoho-invoice.schema.js'
import { summariseReceivables, type ReceivableInput, type ReceivablesSummary } from '../../utils/receivablesAgeing.js'

interface ZohoInvoiceApiRow {
  invoice_id:     string
  invoice_number: string
  status:         string
  total:          number
  balance:        number
  date:           string
  due_date:       string
  customer_name?: string
  currency_code?: string
}

export function isZohoConfigured(): boolean {
  return !!(env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN && env.ZOHO_ORG_ID)
}

// Module-level in-memory access-token cache — refreshed on demand from the
// long-lived self-client refresh token. Not persisted: a cold restart just
// costs one extra token-refresh round trip on the next sync.
let cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) return cachedToken.accessToken

  const url = new URL('/oauth/v2/token', env.ZOHO_ACCOUNTS_DOMAIN)
  url.searchParams.set('refresh_token', env.ZOHO_REFRESH_TOKEN!)
  url.searchParams.set('client_id', env.ZOHO_CLIENT_ID!)
  url.searchParams.set('client_secret', env.ZOHO_CLIENT_SECRET!)
  url.searchParams.set('grant_type', 'refresh_token')

  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Zoho OAuth token refresh failed (${res.status})`)

  const body = await res.json() as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('Zoho OAuth token refresh returned no access_token')

  cachedToken = { accessToken: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 }
  return cachedToken.accessToken
}

/**
 * Authenticated read-only GET against the Zoho Invoice API (organization_id is
 * added here). Shared with the customer-supply module, which needs invoice
 * line items; throws on a non-2xx response.
 */
export async function zohoGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken()
  const url = new URL(path, env.ZOHO_API_DOMAIN)
  url.searchParams.set('organization_id', env.ZOHO_ORG_ID!)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal:  AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Zoho Invoice API error (${res.status})`)
  return await res.json() as T
}

async function fetchZohoInvoiceByNumber(invoiceNumber: string): Promise<ZohoInvoiceApiRow | null> {
  const token = await getAccessToken()

  const url = new URL('/invoice/v3/invoices', env.ZOHO_API_DOMAIN)
  url.searchParams.set('invoice_number', invoiceNumber)
  url.searchParams.set('organization_id', env.ZOHO_ORG_ID!)

  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal:  AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Zoho Invoice API error (${res.status})`)

  const body = await res.json() as { invoices?: ZohoInvoiceApiRow[] }
  return body.invoices?.[0] ?? null
}

type SyncPatch = Partial<Omit<NewZohoInvoiceSync, 'id' | 'dispatchId' | 'createdAt'>>

async function upsertSync(dispatchId: string, patch: SyncPatch): Promise<ZohoInvoiceSync> {
  const [row] = await db
    .insert(zohoInvoiceSyncs)
    .values({ dispatchId, ...patch })
    .onConflictDoUpdate({ target: zohoInvoiceSyncs.dispatchId, set: { ...patch, updatedAt: new Date() } })
    .returning()
  return row
}

function toResponse(row: ZohoInvoiceSync) {
  return {
    id:                row.id,
    dispatchId:        row.dispatchId,
    zohoInvoiceId:     row.zohoInvoiceId,
    zohoInvoiceNumber: row.zohoInvoiceNumber,
    status:            row.status,
    total:             row.total !== null ? Number(row.total) : null,
    balance:           row.balance !== null ? Number(row.balance) : null,
    invoiceDate:       row.invoiceDate,
    dueDate:           row.dueDate,
    lastSyncedAt:      row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    syncError:         row.syncError,
  }
}

export type ZohoInvoiceSyncRow = ReturnType<typeof toResponse>

export async function getSyncStatus(dispatchId: string): Promise<ZohoInvoiceSyncRow | null> {
  const [row] = await db.select().from(zohoInvoiceSyncs).where(eq(zohoInvoiceSyncs.dispatchId, dispatchId))
  return row ? toResponse(row) : null
}

export type SyncDispatchInvoiceResult =
  | ZohoInvoiceSyncRow
  | { code: 'DISPATCH_NOT_FOUND' }
  | { code: 'DISPATCH_INVOICE_NUMBER_MISSING' }
  | { code: 'ZOHO_NOT_CONFIGURED' }
  | { code: 'ZOHO_INVOICE_NOT_FOUND' }
  | { code: 'ZOHO_SYNC_FAILED'; message: string }

export async function syncDispatchInvoice(dispatchId: string): Promise<SyncDispatchInvoiceResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }

  const [dispatch] = await db
    .select({ invoiceNumber: dispatches.invoiceNumber })
    .from(dispatches)
    .where(eq(dispatches.id, dispatchId))
  if (!dispatch) return { code: 'DISPATCH_NOT_FOUND' }
  if (!dispatch.invoiceNumber) return { code: 'DISPATCH_INVOICE_NUMBER_MISSING' }

  try {
    const invoice = await fetchZohoInvoiceByNumber(dispatch.invoiceNumber)
    if (!invoice) {
      await upsertSync(dispatchId, { syncError: 'No matching invoice found in Zoho', lastSyncedAt: new Date() })
      return { code: 'ZOHO_INVOICE_NOT_FOUND' }
    }

    const row = await upsertSync(dispatchId, {
      zohoInvoiceId:     invoice.invoice_id,
      zohoInvoiceNumber: invoice.invoice_number,
      status:            invoice.status,
      total:             String(invoice.total),
      balance:           String(invoice.balance),
      invoiceDate:       invoice.date,
      dueDate:           invoice.due_date,
      lastSyncedAt:      new Date(),
      syncError:         null,
    })
    return toResponse(row)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Zoho sync error'
    await upsertSync(dispatchId, { syncError: message, lastSyncedAt: new Date() }).catch(() => {})
    return { code: 'ZOHO_SYNC_FAILED', message }
  }
}

export type ZohoInvoicePdfResult =
  | { pdf: Buffer }
  | { code: 'ZOHO_NOT_CONFIGURED' }
  | { code: 'ZOHO_INVOICE_NOT_FOUND' }
  | { code: 'ZOHO_SYNC_FAILED'; message: string }

/**
 * Live proxy of Zoho's own invoice PDF (`?accept=pdf` on the invoice detail
 * endpoint, covered by the existing ZohoInvoice.invoices.READ scope). Nothing
 * is stored, so the file always matches what Zoho shows today.
 */
export async function fetchZohoInvoicePdf(invoiceId: string): Promise<ZohoInvoicePdfResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }

  try {
    const token = await getAccessToken()
    const url = new URL(`/invoice/v3/invoices/${invoiceId}`, env.ZOHO_API_DOMAIN)
    url.searchParams.set('organization_id', env.ZOHO_ORG_ID!)
    url.searchParams.set('accept', 'pdf')

    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal:  AbortSignal.timeout(30_000),
    })
    if (res.status === 404) return { code: 'ZOHO_INVOICE_NOT_FOUND' }
    if (!res.ok) throw new Error(`Zoho Invoice API error (${res.status})`)
    if (!res.headers.get('content-type')?.includes('application/pdf')) {
      throw new Error('Zoho Invoice API did not return a PDF')
    }

    return { pdf: Buffer.from(await res.arrayBuffer()) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Zoho PDF error'
    return { code: 'ZOHO_SYNC_FAILED', message }
  }
}

export type ZohoEwayBillPdfResult =
  | ZohoInvoicePdfResult
  | { code: 'EWAY_BILL_NOT_FOUND' }
  | { code: 'EWAY_BILL_PDF_UNAVAILABLE'; ewayBillNumber: string | null }

/**
 * The e-way bill's PDF, found through its invoice. The invoice list doesn't
 * carry e-way fields, so this reads the invoice detail on click rather than
 * once per row. Bills entered manually in Zoho have a number but no PDF.
 */
export async function fetchZohoEwayBillPdf(invoiceId: string): Promise<ZohoEwayBillPdfResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }

  try {
    const token = await getAccessToken()
    const headers = { Authorization: `Zoho-oauthtoken ${token}` }

    const detailUrl = new URL(`/invoice/v3/invoices/${invoiceId}`, env.ZOHO_API_DOMAIN)
    detailUrl.searchParams.set('organization_id', env.ZOHO_ORG_ID!)
    const detailRes = await fetch(detailUrl, { headers, signal: AbortSignal.timeout(15_000) })
    if (detailRes.status === 404) return { code: 'ZOHO_INVOICE_NOT_FOUND' }
    if (!detailRes.ok) throw new Error(`Zoho Invoice API error (${detailRes.status})`)

    const { invoice } = await detailRes.json() as {
      invoice?: { ewaybill_id?: string; ewaybill_number?: string; ewaybill_status?: string }
    }
    if (!invoice) return { code: 'ZOHO_INVOICE_NOT_FOUND' }
    if (!invoice.ewaybill_id) return { code: 'EWAY_BILL_NOT_FOUND' }
    if (invoice.ewaybill_status === 'manually_generated') {
      return { code: 'EWAY_BILL_PDF_UNAVAILABLE', ewayBillNumber: invoice.ewaybill_number ?? null }
    }

    const pdfUrl = new URL(`/invoice/v3/ewaybills/${encodeURIComponent(invoice.ewaybill_id)}`, env.ZOHO_API_DOMAIN)
    pdfUrl.searchParams.set('organization_id', env.ZOHO_ORG_ID!)
    pdfUrl.searchParams.set('accept', 'pdf')
    const pdfRes = await fetch(pdfUrl, { headers, signal: AbortSignal.timeout(30_000) })
    if (!pdfRes.ok) throw new Error(`Zoho Invoice API error (${pdfRes.status})`)
    if (!pdfRes.headers.get('content-type')?.includes('application/pdf')) {
      throw new Error('Zoho Invoice API did not return a PDF')
    }

    return { pdf: Buffer.from(await pdfRes.arrayBuffer()) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Zoho e-way bill error'
    return { code: 'ZOHO_SYNC_FAILED', message }
  }
}

export interface ZohoInvoiceListRow {
  invoiceId:      string
  invoiceNumber:  string
  customerName:   string | null
  status:         string
  total:          number
  balance:        number
  invoiceDate:    string
  dueDate:        string
  currencyCode:   string | null
  linkedDispatch: { id: string; dispatchNumber: string } | null
  linkedBatches:  { batchNumber: string; hasCoa: boolean }[]
}

export type ListZohoInvoicesResult =
  | { invoices: ZohoInvoiceListRow[]; page: number; perPage: number; hasMorePage: boolean }
  | { code: 'ZOHO_NOT_CONFIGURED' }
  | { code: 'ZOHO_SYNC_FAILED'; message: string }

/**
 * Live list straight from Zoho — not backed by any local table, so there's
 * nothing to keep in sync. `status`/`dateFrom`/`dateTo`/`search` are passed
 * through to Zoho's own query params as best-effort filters (Zoho ignores
 * unrecognized params rather than erroring, so a mismatched value just
 * returns an unfiltered page instead of a 400).
 */
export async function listZohoInvoices(query: ListZohoInvoicesQuery): Promise<ListZohoInvoicesResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }

  try {
    const token = await getAccessToken()
    const url = new URL('/invoice/v3/invoices', env.ZOHO_API_DOMAIN)
    url.searchParams.set('organization_id', env.ZOHO_ORG_ID!)
    url.searchParams.set('page', String(query.page))
    url.searchParams.set('per_page', String(query.perPage))
    url.searchParams.set('sort_column', 'date')
    url.searchParams.set('sort_order', 'D')
    if (query.status) url.searchParams.set('status', query.status)
    if (query.dateFrom) url.searchParams.set('date_start', query.dateFrom)
    if (query.dateTo) url.searchParams.set('date_end', query.dateTo)
    if (query.search) url.searchParams.set('search_text', query.search)
    if (query.customer) url.searchParams.set('customer_name', query.customer)

    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal:  AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Zoho Invoice API error (${res.status})`)

    const body = await res.json() as {
      invoices?: ZohoInvoiceApiRow[]
      page_context?: { page: number; per_page: number; has_more_page: boolean }
    }
    const rawInvoices = body.invoices ?? []

    const invoiceNumbers = rawInvoices.map((inv) => inv.invoice_number).filter(Boolean)
    const linkedRows = invoiceNumbers.length
      ? await db
          .select({ id: dispatches.id, dispatchNumber: dispatches.dispatchNumber, invoiceNumber: dispatches.invoiceNumber })
          .from(dispatches)
          .where(inArray(dispatches.invoiceNumber, invoiceNumbers))
      : []
    const dispatchByInvoiceNumber = new Map(
      linkedRows.filter((d) => d.invoiceNumber !== null).map((d) => [d.invoiceNumber as string, { id: d.id, dispatchNumber: d.dispatchNumber }]),
    )

    // One invoice can cover several batches. Voided dispatches didn't ship.
    const batchRows = invoiceNumbers.length
      ? await db
          .selectDistinct({
            invoiceNumber: dispatches.invoiceNumber,
            batchNumber:   batches.batchNumber,
            hasCoa:        sql<boolean>`${batches.coaSnapshot} IS NOT NULL`,
          })
          .from(dispatches)
          .innerJoin(batches, eq(dispatches.batchId, batches.id))
          .where(and(inArray(dispatches.invoiceNumber, invoiceNumbers), isNull(dispatches.voidedAt)))
      : []
    const batchesByInvoiceNumber = new Map<string, { batchNumber: string; hasCoa: boolean }[]>()
    for (const row of batchRows) {
      const key = row.invoiceNumber as string
      batchesByInvoiceNumber.set(key, [...(batchesByInvoiceNumber.get(key) ?? []), { batchNumber: row.batchNumber, hasCoa: row.hasCoa }])
    }

    const invoices: ZohoInvoiceListRow[] = rawInvoices.map((inv) => ({
      invoiceId:      inv.invoice_id,
      invoiceNumber:  inv.invoice_number,
      customerName:   inv.customer_name ?? null,
      status:         inv.status,
      total:          Number(inv.total),
      balance:        Number(inv.balance),
      invoiceDate:    inv.date,
      dueDate:        inv.due_date,
      currencyCode:   inv.currency_code ?? null,
      linkedDispatch: dispatchByInvoiceNumber.get(inv.invoice_number) ?? null,
      linkedBatches:  batchesByInvoiceNumber.get(inv.invoice_number) ?? [],
    }))

    return {
      invoices,
      page:        body.page_context?.page ?? query.page,
      perPage:     body.page_context?.per_page ?? query.perPage,
      hasMorePage: body.page_context?.has_more_page ?? false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Zoho list error'
    return { code: 'ZOHO_SYNC_FAILED', message }
  }
}

// ── Receivables (all unpaid invoices, aged by due date) ──────────────────────

/** Zoho statuses that can carry a balance. Fetched separately and de-duplicated,
 *  because Zoho's `unpaid` filter is not documented to include `overdue`/`partially_paid`. */
const OPEN_STATUSES = ['unpaid', 'overdue', 'partially_paid'] as const
const RECEIVABLES_PAGE_SIZE = 200
/** Safety cap per status (200 × 25 = 5,000 invoices); hitting it sets `truncated`. */
const RECEIVABLES_MAX_PAGES = 25
const RECEIVABLES_TTL_MS = 2 * 60 * 1000

export type ZohoReceivablesResult =
  | ({ asOf: string; truncated: boolean } & ReceivablesSummary)
  | { code: 'ZOHO_NOT_CONFIGURED' }
  | { code: 'ZOHO_SYNC_FAILED'; message: string }

let receivablesCache: { at: number; value: Extract<ZohoReceivablesResult, { asOf: string }> } | null = null

/**
 * Every open Zoho invoice (no date window), aged by days past due date —
 * backs the web Invoices page's Receivables panel. Read-only; nothing stored.
 * Cached in memory for 2 minutes (`refresh` bypasses), like customer-supply's list.
 */
export async function listZohoReceivables({ refresh = false } = {}): Promise<ZohoReceivablesResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }
  if (!refresh && receivablesCache && Date.now() - receivablesCache.at < RECEIVABLES_TTL_MS) return receivablesCache.value

  try {
    const rows: ReceivableInput[] = []
    let truncated = false
    for (const status of OPEN_STATUSES) {
      for (let page = 1; page <= RECEIVABLES_MAX_PAGES; page++) {
        const body = await zohoGet<{ invoices?: ZohoInvoiceApiRow[]; page_context?: { has_more_page?: boolean } }>(
          '/invoice/v3/invoices',
          { status, page: String(page), per_page: String(RECEIVABLES_PAGE_SIZE), sort_column: 'due_date', sort_order: 'A' },
        )
        for (const inv of body.invoices ?? []) {
          rows.push({
            invoiceId:     inv.invoice_id,
            invoiceNumber: inv.invoice_number,
            customerName:  inv.customer_name ?? null,
            status:        inv.status,
            total:         Number(inv.total),
            balance:       Number(inv.balance),
            invoiceDate:   inv.date ?? null,
            dueDate:       inv.due_date ?? null,
          })
        }
        if (!body.page_context?.has_more_page) break
        if (page === RECEIVABLES_MAX_PAGES) truncated = true
      }
    }
    const value = { asOf: new Date().toISOString(), truncated, ...summariseReceivables(rows) }
    receivablesCache = { at: Date.now(), value }
    return value
  } catch (err) {
    return { code: 'ZOHO_SYNC_FAILED', message: err instanceof Error ? err.message : 'Unknown Zoho error' }
  }
}

// ── Customers (names for the Invoices page's customer filter) ────────────────

/** Safety cap (200 × 25 = 5,000 invoices); hitting it sets `truncated`. */
const CUSTOMERS_MAX_PAGES = 25
const CUSTOMERS_TTL_MS = 10 * 60 * 1000

export type ZohoCustomersResult =
  | { customers: string[]; truncated: boolean }
  | { code: 'ZOHO_NOT_CONFIGURED' }
  | { code: 'ZOHO_SYNC_FAILED'; message: string }

let customersCache: { at: number; value: Extract<ZohoCustomersResult, { customers: string[] }> } | null = null

/**
 * Every customer name that appears on a Zoho invoice, A–Z, de-duplicated — the
 * values the list's `customer_name` filter matches exactly. Read from the invoice
 * list, not `/contacts`, because the self-client only has the invoices READ scope.
 * Read-only; cached in memory for 10 minutes.
 */
export async function listZohoCustomers({ refresh = false } = {}): Promise<ZohoCustomersResult> {
  if (!isZohoConfigured()) return { code: 'ZOHO_NOT_CONFIGURED' }
  if (!refresh && customersCache && Date.now() - customersCache.at < CUSTOMERS_TTL_MS) return customersCache.value

  try {
    const names = new Set<string>()
    let truncated = false
    for (let page = 1; page <= CUSTOMERS_MAX_PAGES; page++) {
      const body = await zohoGet<{ invoices?: ZohoInvoiceApiRow[]; page_context?: { has_more_page?: boolean } }>(
        '/invoice/v3/invoices',
        { page: String(page), per_page: '200', sort_column: 'customer_name', sort_order: 'A' },
      )
      // Untrimmed: the filter must send the name exactly as Zoho stores it.
      for (const inv of body.invoices ?? []) if (inv.customer_name?.trim()) names.add(inv.customer_name)
      if (!body.page_context?.has_more_page) break
      if (page === CUSTOMERS_MAX_PAGES) truncated = true
    }
    const value = { customers: [...names].sort((a, b) => a.localeCompare(b)), truncated }
    customersCache = { at: Date.now(), value }
    return value
  } catch (err) {
    return { code: 'ZOHO_SYNC_FAILED', message: err instanceof Error ? err.message : 'Unknown Zoho error' }
  }
}

/** Test hook: forget the cached receivables. */
export function clearReceivablesCache() { receivablesCache = null }
