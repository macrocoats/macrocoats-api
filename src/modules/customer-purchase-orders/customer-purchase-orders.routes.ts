import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  createCustomerOrderSchema, updateCustomerOrderSchema, listCustomerOrdersQuerySchema,
  updateOrderStatusSchema, linkBatchSchema, addTimelineNoteSchema, documentMetaSchema, searchQuerySchema,
} from './customer-purchase-orders.schema.js'
import {
  createOrder, updateOrder, listOrders, getOrderById, setOrderStatus, softDeleteOrder,
  linkBatch, unlinkBatch, listTimeline, addTimelineNote,
  orderExists, writeUploadedFile, saveDocumentRecord, listDocuments, getDocumentById, deleteDocument,
  getDashboardSummary, getOrderAnalytics, searchOrders, getQuotationPrefill,
} from './customer-purchase-orders.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function customerPurchaseOrderRoutes(app: FastifyInstance) {
  // ── Dashboard / search (registered before /:id so literal segments never match as an id) ──
  app.get('/dashboard-summary', { preHandler }, async (_request, reply) => {
    return reply.send({ data: await getDashboardSummary() })
  })

  app.get('/analytics', { preHandler }, async (_request, reply) => {
    return reply.send({ data: await getOrderAnalytics() })
  })

  app.get('/search', { preHandler }, async (request, reply) => {
    const query = searchQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    return reply.send({ data: await searchOrders(query.data.q) })
  })

  app.get<{ Params: { quotationId: string } }>('/from-quotation/:quotationId', { preHandler }, async (request, reply) => {
    const prefill = await getQuotationPrefill(request.params.quotationId)
    if (!prefill) return reply.code(404).send({ error: AppErrors.QUOTATION_NOT_FOUND })
    return reply.send({ data: prefill })
  })

  // ── CRUD ──────────────────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createCustomerOrderSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })

    const order = await createOrder(body.data, request.authUser!.id)
    return reply.code(201).send({ data: order })
  })

  app.get('/', { preHandler }, async (request, reply) => {
    const query = listCustomerOrdersQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    return reply.send({ data: await listOrders(query.data) })
  })

  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const order = await getOrderById(request.params.id)
    if (!order) return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    return reply.send({ data: order })
  })

  app.put<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateCustomerOrderSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })

    const result = await updateOrder(request.params.id, body.data)
    if ('code' in result && result.code === 'NOT_FOUND') return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    if ('code' in result && result.code === 'LOCKED') return reply.code(409).send({ error: AppErrors.CUSTOMER_ORDER_LOCKED })
    return reply.send({ data: result })
  })

  app.patch<{ Params: { id: string } }>('/:id/status', { preHandler }, async (request, reply) => {
    const body = updateOrderStatusSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })

    const result = await setOrderStatus(request.params.id, body.data.status, request.authUser!.id, body.data.reason)
    if ('code' in result && result.code === 'NOT_FOUND') return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    if ('code' in result && result.code === 'INVALID_TRANSITION') return reply.code(409).send({ error: AppErrors.CUSTOMER_ORDER_INVALID_STATUS_TRANSITION })
    return reply.send({ data: result })
  })

  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const result = await softDeleteOrder(request.params.id)
    if (!result) return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    return reply.code(204).send()
  })

  // ── Batch linking ─────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/batches', { preHandler }, async (request, reply) => {
    const body = linkBatchSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })

    const result = await linkBatch(request.params.id, body.data, request.authUser!.id)
    if ('code' in result && result.code === 'ORDER_NOT_FOUND') return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    if ('code' in result && result.code === 'ITEM_NOT_FOUND') return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_ITEM_NOT_FOUND })
    if ('code' in result && result.code === 'BATCH_NOT_FOUND') return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
    return reply.code(201).send({ data: result })
  })

  app.delete<{ Params: { id: string; linkId: string } }>('/:id/batches/:linkId', { preHandler }, async (request, reply) => {
    const result = await unlinkBatch(request.params.id, request.params.linkId)
    if (!result) return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_BATCH_LINK_NOT_FOUND })
    return reply.code(204).send()
  })

  // ── Timeline ──────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/timeline', { preHandler }, async (request, reply) => {
    return reply.send({ data: await listTimeline(request.params.id) })
  })

  app.post<{ Params: { id: string } }>('/:id/timeline', { preHandler }, async (request, reply) => {
    const body = addTimelineNoteSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })

    const entry = await addTimelineNote(request.params.id, request.authUser!.id, body.data.remarks)
    return reply.code(201).send({ data: entry })
  })

  // ── Documents ─────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/documents', { preHandler }, async (request, reply) => {
    if (!(await orderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    }

    const data = await request.file()
    if (!data) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, message: 'No file uploaded.' })

    // Drain the file to disk BEFORE reading other multipart fields — see the
    // busboy field-ordering gotcha documented in company-documents.service.ts.
    const written = await writeUploadedFile(request.params.id, {
      filename: data.filename, mimetype: data.mimetype, fileStream: data.file,
    })
    if ('code' in written) return reply.code(500).send({ error: AppErrors.CUSTOMER_ORDER_DOC_UPLOAD_FAILED })

    const rawFields: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(data.fields)) {
      const entry = Array.isArray(field) ? field[0] : field
      rawFields[key] = (entry as { value?: unknown } | undefined)?.value
    }

    const meta = documentMetaSchema.safeParse(rawFields)
    if (!meta.success) {
      await unlink(written.fullPath).catch(() => {})
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: meta.error.flatten() })
    }

    const result = await saveDocumentRecord(request.params.id, written, meta.data, request.authUser!.id)
    if ('code' in result) return reply.code(500).send({ error: AppErrors.CUSTOMER_ORDER_DOC_UPLOAD_FAILED })

    return reply.code(201).send({ data: result })
  })

  app.get<{ Params: { id: string } }>('/:id/documents', { preHandler }, async (request, reply) => {
    if (!(await orderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_NOT_FOUND })
    }
    return reply.send({ data: await listDocuments(request.params.id) })
  })

  app.get<{ Params: { id: string; docId: string } }>('/:id/documents/:docId/download', { preHandler }, async (request, reply) => {
    const document = await getDocumentById(request.params.id, request.params.docId)
    if (!document) return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_DOCUMENT_NOT_FOUND })

    reply.type(document.mimeType).header('Content-Disposition', `inline; filename="${document.filename}"`)
    return reply.send(createReadStream(document.storageKey))
  })

  app.delete<{ Params: { id: string; docId: string } }>('/:id/documents/:docId', { preHandler }, async (request, reply) => {
    const result = await deleteDocument(request.params.id, request.params.docId)
    if (result === null) return reply.code(404).send({ error: AppErrors.CUSTOMER_ORDER_DOCUMENT_NOT_FOUND })
    return reply.code(204).send()
  })
}
