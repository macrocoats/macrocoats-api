import { realpath, stat } from 'node:fs/promises'
import { relative, isAbsolute } from 'node:path'
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  companies,
  users,
  customerPurchaseOrders as orders,
  customerPurchaseOrderItems as items,
  customerPurchaseOrderDocuments as documents,
  dispatches,
  batches,
  products,
} from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import { pdfService } from '../pdf/pdf.service.js'
import { pdfBodySchemas } from '../pdf/pdf.schema.js'
import {
  fetchZohoInvoicePdf,
  isZohoConfigured,
  zohoGet,
} from '../zoho-invoice/zoho-invoice.service.js'

export type PortalCompany = typeof companies.$inferSelect

const PAGE_SIZE = 25

// Resolve the live account binding, rather than trusting a client or stale JWT company name.
export async function getCustomerAccount(userId: string) {
  const [row] = await db
    .select({ company: companies })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(and(eq(users.id, userId), eq(users.role, 'company')))
  return row?.company
}

export const toProfile = (c: PortalCompany) => ({
  id: c.id,
  displayName: c.displayName,
  contactPerson: c.contactPerson,
  email: c.email,
  phone: c.phone,
  gstNumber: c.gstNumber,
  address: c.address,
  city: c.city,
  state: c.state,
  pincode: c.pincode,
  hasLogo: Boolean(c.logoStorageKey),
  logoUpdatedAt: c.logoUpdatedAt?.toISOString() ?? null,
})

// Resolve a stored file and refuse anything outside the storage root.
async function storedFile(storageKey: string) {
  try {
    const root = await realpath(env.PROCUREMENT_STORAGE_PATH)
    const path = await realpath(storageKey)
    const within = relative(root, path)
    if (within.startsWith('..') || isAbsolute(within) || !(await stat(path)).isFile())
      return null
    return path
  } catch {
    return null
  }
}

export async function getCompanyLogoFile(company: PortalCompany) {
  if (!company.logoStorageKey || !company.logoMimeType) return null
  const path = await storedFile(company.logoStorageKey)
  return path ? { path, mimeType: company.logoMimeType } : null
}

const orderFields = {
  id: orders.id,
  poNumber: orders.poNumber,
  customerPoNumber: orders.customerPoNumber,
  customerPoDate: orders.customerPoDate,
  expectedDeliveryDate: orders.expectedDeliveryDate,
  status: orders.status,
}
const ownedOrder = (companyId: string, id?: string) =>
  and(
    eq(orders.customerId, companyId),
    isNull(orders.deletedAt),
    ne(orders.status, 'draft'),
    id ? eq(orders.id, id) : undefined,
  )
const supplied = (companyId: string, batchId?: string) =>
  and(
    eq(dispatches.companyId, companyId),
    isNull(dispatches.voidedAt),
    inArray(batches.lifecycleStatus, ['released', 'closed']),
    isNotNull(batches.coaSnapshot),
    sql`CASE WHEN jsonb_typeof(${batches.coaSnapshot}->'tests') = 'array' THEN jsonb_array_length(${batches.coaSnapshot}->'tests') > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${batches.coaSnapshot}->'tests') t WHERE t->>'status' IS DISTINCT FROM 'Pass') ELSE false END`,
    batchId ? eq(batches.id, batchId) : undefined,
  )

const paged = <T>(rows: T[], page: number) => ({
  items: rows.slice(0, PAGE_SIZE),
  page,
  hasMore: rows.length > PAGE_SIZE,
})

export async function listOrders(companyId: string, page: number, search: string) {
  const rows = await db
    .select(orderFields)
    .from(orders)
    .where(
      and(
        ownedOrder(companyId),
        search
          ? or(
              ilike(orders.customerPoNumber, `%${search}%`),
              ilike(orders.poNumber, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(orders.customerPoDate), desc(orders.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE)
  return paged(rows, page)
}

export async function getOrder(companyId: string, id: string) {
  const [order] = await db
    .select(orderFields)
    .from(orders)
    .where(ownedOrder(companyId, id))
  if (!order) return null
  const lines = await db
    .select({
      id: items.id,
      productName: products.displayName,
      customerProductCode: items.customerProductCode,
      quantityOrdered: items.quantityOrdered,
      unit: items.unit,
      unitPrice: items.unitPrice,
      amount: items.amount,
    })
    .from(items)
    .innerJoin(products, eq(items.productKey, products.key))
    .where(eq(items.orderId, order.id))
    .orderBy(items.sortOrder)
  const attachments = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      version: documents.version,
    })
    .from(documents)
    .where(
      and(
        eq(documents.orderId, order.id),
        eq(documents.category, 'po_pdf'),
        eq(documents.mimeType, 'application/pdf'),
      ),
    )
    .orderBy(desc(documents.version))
  const deliveries = await db
    .select({
      id: dispatches.id,
      dispatchNumber: dispatches.dispatchNumber,
      dispatchDate: dispatches.dispatchDate,
      quantity: dispatches.quantity,
      unit: items.unit,
      batchNumber: batches.batchNumber,
    })
    .from(dispatches)
    .innerJoin(batches, eq(dispatches.batchId, batches.id))
    .leftJoin(
      items,
      and(
        eq(dispatches.customerPurchaseOrderItemId, items.id),
        eq(items.orderId, order.id),
      ),
    )
    .where(
      and(
        eq(dispatches.companyId, companyId),
        eq(dispatches.customerPurchaseOrderId, order.id),
        isNull(dispatches.voidedAt),
      ),
    )
  return { ...order, items: lines, documents: attachments, deliveries }
}

/** The customer's own PO PDF on disk, or null when it isn't theirs or sits outside storage. */
export async function getOrderDocumentFile(
  companyId: string,
  orderId: string,
  documentId: string,
) {
  const [document] = await db
    .select({
      storageKey: documents.storageKey,
      filename: documents.filename,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .innerJoin(orders, eq(documents.orderId, orders.id))
    .where(
      and(
        ownedOrder(companyId, orderId),
        eq(documents.id, documentId),
        eq(documents.category, 'po_pdf'),
        eq(documents.mimeType, 'application/pdf'),
      ),
    )
  if (!document) return null
  const path = await storedFile(document.storageKey)
  return path ? { path, filename: document.filename, mimeType: document.mimeType } : null
}

export async function listCertificates(companyId: string, page: number, search: string) {
  // Select only safe certificate metadata; never return a batch object or its formulation.
  const rows = await db
    .select({
      id: batches.id,
      batchNumber: batches.batchNumber,
      productName: products.displayName,
      productionDate: batches.productionDate,
      expiryDate: batches.expiryDate,
      supplyDate: sql<string>`max(${dispatches.dispatchDate})`,
    })
    .from(dispatches)
    .innerJoin(batches, eq(dispatches.batchId, batches.id))
    .innerJoin(products, eq(batches.productCode, products.key))
    .where(
      and(
        supplied(companyId),
        search
          ? or(
              ilike(batches.batchNumber, `%${search}%`),
              ilike(products.displayName, `%${search}%`),
            )
          : undefined,
      ),
    )
    .groupBy(batches.id, products.displayName)
    .orderBy(desc(sql`max(${dispatches.dispatchDate})`), desc(batches.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE)
  return paged(rows, page)
}

interface CoaTest {
  parameter: string
  specification: string
  result: string
  unit?: string
  method?: string
  status: string
}
interface Coa {
  tests?: CoaTest[]
  prodDate?: string
}
function approvedCoa(snapshot: unknown): snapshot is Coa & { tests: CoaTest[] } {
  const tests = (snapshot as Coa | null)?.tests
  return Array.isArray(tests) && tests.length > 0 && tests.every((t) => t.status === 'Pass')
}

/** CoA PDF for a batch supplied to this company: 'not_found' | 'unavailable' | the PDF. */
export async function getCertificatePdf(company: PortalCompany, batchId: string) {
  const [row] = await db
    .select({ batch: batches, productName: products.displayName })
    .from(dispatches)
    .innerJoin(batches, eq(dispatches.batchId, batches.id))
    .innerJoin(products, eq(batches.productCode, products.key))
    .where(supplied(company.id, batchId))
    .limit(1)
  if (!row || !approvedCoa(row.batch.coaSnapshot)) return 'not_found' as const
  const snapshot = row.batch.coaSnapshot
  const payload = pdfBodySchemas.coa.safeParse({
    productName: row.productName,
    productCode: row.batch.productCode,
    productLine: row.batch.productCode,
    batchNumber: row.batch.batchNumber,
    manufacturingDate: snapshot.prodDate ?? row.batch.productionDate,
    expiryDate: row.batch.expiryDate,
    customer: { companyName: company.displayName },
    testResults: snapshot.tests.map((t) => ({
      parameter: t.parameter,
      specification: t.specification,
      result: t.result || '—',
      unit: t.unit ?? '',
      method: t.method ?? '',
      status: 'PASS',
    })),
    conclusion: 'APPROVED',
  })
  if (!payload.success) return 'unavailable' as const
  const pdf = await pdfService.generatePDF('coa', payload.data)
  return { buffer: pdf.buffer, batchId: row.batch.id }
}

// ── Invoices (live from Zoho) ───────────────────────────────────────────────

interface Invoice {
  invoice_id: string
  customer_id: string
  invoice_number: string
  status: string
  total: number
  balance: number
  date: string
  due_date: string
  currency_code?: string
}

export class PortalInvoiceError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code)
  }
}

function configured(customerId: string | null) {
  if (!customerId) throw new PortalInvoiceError('CUSTOMER_NOT_MAPPED', 409)
  if (!isZohoConfigured()) throw new PortalInvoiceError('INVOICES_UNAVAILABLE', 503)
  return customerId
}

export async function customerInvoices(customerId: string | null, page: number, search: string) {
  const id = configured(customerId)
  const result = await zohoGet<{
    invoices?: Invoice[]
    page_context?: { has_more_page?: boolean }
  }>('/invoice/v3/invoices', {
    customer_id: id,
    page: String(page),
    per_page: String(PAGE_SIZE),
    sort_column: 'date',
    sort_order: 'D',
    ...(search ? { search_text: search } : {}),
  })
  // Do not trust an upstream filter as an authorization boundary.
  const invoices = (result.invoices ?? [])
    .filter((row) => row.customer_id === id && row.status !== 'draft')
    .map((row) => ({
      id: row.invoice_id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      total: Number(row.total),
      balance: Number(row.balance),
      invoiceDate: row.date,
      dueDate: row.due_date,
      currencyCode: row.currency_code ?? 'INR',
    }))
  return {
    items: invoices,
    page,
    hasMore: result.page_context?.has_more_page ?? false,
  }
}

export async function customerInvoicePdf(customerId: string | null, invoiceId: string) {
  const id = configured(customerId)
  const result = await zohoGet<{ invoice?: Invoice }>(`/invoice/v3/invoices/${invoiceId}`)
  if (!result.invoice || result.invoice.customer_id !== id || result.invoice.status === 'draft') {
    throw new PortalInvoiceError('NOT_FOUND', 404)
  }
  const pdf = await fetchZohoInvoicePdf(invoiceId)
  if ('code' in pdf) throw new PortalInvoiceError('INVOICES_UNAVAILABLE', 502)
  return pdf.pdf
}

async function outstandingBalance(customerId: string | null) {
  if (!customerId || !isZohoConfigured()) return null
  try {
    const { contact } = await zohoGet<{
      contact?: { contact_id?: string; outstanding_receivable_amount?: number; currency_code?: string }
    }>(`/invoice/v3/contacts/${encodeURIComponent(customerId)}`)
    if (!contact || contact.contact_id !== customerId) return null
    return {
      amount: Number(contact.outstanding_receivable_amount ?? 0),
      currencyCode: contact.currency_code ?? 'INR',
    }
  } catch {
    return null // Zoho outage must not break the overview
  }
}

export async function getPortalSummary(company: PortalCompany) {
  const [[openOrders], [certificates], outstanding] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(ownedOrder(company.id), notInArray(orders.status, ['completed', 'cancelled']))),
    db
      .select({ count: sql<number>`count(distinct ${batches.id})::int` })
      .from(dispatches)
      .innerJoin(batches, eq(dispatches.batchId, batches.id))
      .where(supplied(company.id)),
    outstandingBalance(company.zohoCustomerId),
  ])
  return { openOrders: openOrders.count, certificates: certificates.count, outstanding }
}
