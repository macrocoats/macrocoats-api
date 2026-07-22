import { eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { zohoInvoiceSyncs, dispatches, type ZohoInvoiceSync, type NewZohoInvoiceSync } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import type { ListZohoInvoicesQuery } from './zoho-invoice.schema.js'

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

function isZohoConfigured(): boolean {
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
