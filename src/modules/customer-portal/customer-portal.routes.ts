import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { relative, isAbsolute } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
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
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { env } from '../../config/env.js'
import { pdfService } from '../pdf/pdf.service.js'
import { pdfBodySchemas } from '../pdf/pdf.schema.js'
import {
  customerInvoicePdf,
  customerInvoices,
  PortalInvoiceError,
} from './customer-portal.invoices.js'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().trim().max(100).default(''),
})
const uuid = z.string().uuid()

// Resolve the live account binding, rather than trusting a client or stale JWT company name.
async function account(request: FastifyRequest) {
  const [company] = await db
    .select({ company: companies })
    .from(users)
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(and(eq(users.id, request.authUser!.id), eq(users.role, 'company')))
  return company?.company
}

const profile = (c: typeof companies.$inferSelect) => ({
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
})
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
export function approvedCoa(
  snapshot: unknown,
): snapshot is Coa & { tests: CoaTest[] } {
  const tests = (snapshot as Coa | null)?.tests
  return (
    Array.isArray(tests) &&
    tests.length > 0 &&
    tests.every((t) => t.status === 'Pass')
  )
}

export async function customerPortalRoutes(app: FastifyInstance) {
  const scopedCompanies = new WeakMap<
    FastifyRequest,
    typeof companies.$inferSelect
  >()
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAuth)
  app.addHook('preHandler', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    if (request.authUser?.role !== 'company')
      return reply.code(403).send({ error: 'CUSTOMER_ACCESS_REQUIRED' })
    const company = await account(request)
    if (
      !company ||
      (company.tokenExpiresAt && company.tokenExpiresAt <= new Date())
    ) {
      return reply.code(403).send({ error: 'CUSTOMER_ACCESS_EXPIRED' })
    }
    scopedCompanies.set(request, company)
  })

  app.get('/company', async (request) => ({
    data: profile(scopedCompanies.get(request)!),
  }))

  app.get('/orders', async (request, reply) => {
    const q = querySchema.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
    const c = scopedCompanies.get(request)!
    const rows = await db
      .select(orderFields)
      .from(orders)
      .where(
        and(
          ownedOrder(c.id),
          q.data.search
            ? or(
                ilike(orders.customerPoNumber, `%${q.data.search}%`),
                ilike(orders.poNumber, `%${q.data.search}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(orders.customerPoDate), desc(orders.id))
      .limit(26)
      .offset((q.data.page - 1) * 25)
    return {
      data: {
        items: rows.slice(0, 25),
        page: q.data.page,
        hasMore: rows.length > 25,
      },
    }
  })

  app.get<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
    if (!uuid.safeParse(request.params.id).success)
      return reply.code(404).send({ error: 'NOT_FOUND' })
    const c = scopedCompanies.get(request)!
    const [order] = await db
      .select(orderFields)
      .from(orders)
      .where(ownedOrder(c.id, request.params.id))
    if (!order) return reply.code(404).send({ error: 'NOT_FOUND' })
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
          eq(dispatches.companyId, c.id),
          eq(dispatches.customerPurchaseOrderId, order.id),
          isNull(dispatches.voidedAt),
        ),
      )
    return {
      data: { ...order, items: lines, documents: attachments, deliveries },
    }
  })

  app.get<{ Params: { id: string; documentId: string } }>(
    '/orders/:id/documents/:documentId',
    async (request, reply) => {
      if (
        !uuid.safeParse(request.params.id).success ||
        !uuid.safeParse(request.params.documentId).success
      )
        return reply.code(404).send({ error: 'NOT_FOUND' })
      const c = scopedCompanies.get(request)!
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
            ownedOrder(c.id, request.params.id),
            eq(documents.id, request.params.documentId),
            eq(documents.category, 'po_pdf'),
            eq(documents.mimeType, 'application/pdf'),
          ),
        )
      if (!document) return reply.code(404).send({ error: 'NOT_FOUND' })
      try {
        const root = await realpath(env.PROCUREMENT_STORAGE_PATH)
        const path = await realpath(document.storageKey)
        const within = relative(root, path)
        if (
          within.startsWith('..') ||
          isAbsolute(within) ||
          !(await stat(path)).isFile()
        )
          return reply.code(404).send({ error: 'NOT_FOUND' })
        return reply
          .type(document.mimeType)
          .header(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
          )
          .send(createReadStream(path))
      } catch {
        return reply.code(404).send({ error: 'NOT_FOUND' })
      }
    },
  )

  app.get('/certificates', async (request, reply) => {
    const q = querySchema.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
    const c = scopedCompanies.get(request)!
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
          supplied(c.id),
          q.data.search
            ? or(
                ilike(batches.batchNumber, `%${q.data.search}%`),
                ilike(products.displayName, `%${q.data.search}%`),
              )
            : undefined,
        ),
      )
      .groupBy(batches.id, products.displayName)
      .orderBy(desc(sql`max(${dispatches.dispatchDate})`), desc(batches.id))
      .limit(26)
      .offset((q.data.page - 1) * 25)
    return {
      data: {
        items: rows.slice(0, 25),
        page: q.data.page,
        hasMore: rows.length > 25,
      },
    }
  })

  app.get<{ Params: { id: string } }>(
    '/certificates/:id/pdf',
    async (request, reply) => {
      if (!uuid.safeParse(request.params.id).success)
        return reply.code(404).send({ error: 'NOT_FOUND' })
      const c = scopedCompanies.get(request)!
      const [row] = await db
        .select({ batch: batches, productName: products.displayName })
        .from(dispatches)
        .innerJoin(batches, eq(dispatches.batchId, batches.id))
        .innerJoin(products, eq(batches.productCode, products.key))
        .where(supplied(c.id, request.params.id))
        .limit(1)
      if (!row || !approvedCoa(row.batch.coaSnapshot))
        return reply.code(404).send({ error: 'NOT_FOUND' })
      const snapshot = row.batch.coaSnapshot
      const payload = pdfBodySchemas.coa.safeParse({
        productName: row.productName,
        productCode: row.batch.productCode,
        productLine: row.batch.productCode,
        batchNumber: row.batch.batchNumber,
        manufacturingDate: snapshot.prodDate ?? row.batch.productionDate,
        expiryDate: row.batch.expiryDate,
        customer: { companyName: c.displayName },
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
      if (!payload.success)
        return reply.code(409).send({ error: 'CERTIFICATE_UNAVAILABLE' })
      const pdf = await pdfService.generatePDF('coa', payload.data)
      return reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="coa-${row.batch.id}.pdf"`,
        )
        .send(pdf.buffer)
    },
  )

  app.get('/invoices', async (request, reply) => {
    const q = querySchema.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
    const c = scopedCompanies.get(request)!
    try {
      return {
        data: await customerInvoices(
          c.zohoCustomerId,
          q.data.page,
          q.data.search,
        ),
      }
    } catch (err) {
      return reply
        .code(err instanceof PortalInvoiceError ? err.status : 502)
        .send({
          error:
            err instanceof PortalInvoiceError
              ? err.code
              : 'INVOICES_UNAVAILABLE',
        })
    }
  })
  app.get<{ Params: { id: string } }>(
    '/invoices/:id/pdf',
    async (request, reply) => {
      if (!/^\d{1,50}$/.test(request.params.id))
        return reply.code(404).send({ error: 'NOT_FOUND' })
      const c = scopedCompanies.get(request)!
      try {
        const pdf = await customerInvoicePdf(
          c.zohoCustomerId,
          request.params.id,
        )
        return reply
          .type('application/pdf')
          .header(
            'Content-Disposition',
            `attachment; filename="invoice-${request.params.id}.pdf"`,
          )
          .send(pdf)
      } catch (err) {
        return reply
          .code(err instanceof PortalInvoiceError ? err.status : 502)
          .send({
            error:
              err instanceof PortalInvoiceError
                ? err.code
                : 'INVOICES_UNAVAILABLE',
          })
      }
    },
  )
}
