import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { docCategorySchema, listDocumentsQuerySchema } from './purchase-order-documents.schema.js'
import {
  purchaseOrderExists, writeUploadedFile, saveDocumentRecord, listDocuments, getDocumentById, deleteDocument,
} from './purchase-order-documents.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

/**
 * Nested under /purchase-orders (registered with prefix `${prefix}/purchase-orders`
 * in app.ts) — mirrors how vendor-prices nests under /vendors.
 */
export async function purchaseOrderDocumentRoutes(app: FastifyInstance) {
  // ── POST /purchase-orders/:id/documents ───────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/documents', { preHandler }, async (request, reply) => {
    if (!(await purchaseOrderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    }

    const data = await request.file()
    if (!data) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, message: 'No file uploaded.' })
    }

    // Drain the file stream to disk BEFORE reading any other multipart fields.
    // docCategory is sent after the file part in this app's FormData, and
    // busboy only guarantees a field has been parsed once everything
    // preceding it in the body is consumed — reading data.fields before this
    // would race and see it as missing.
    const written = await writeUploadedFile(request.params.id, {
      filename: data.filename, mimetype: data.mimetype, fileStream: data.file,
    })
    if ('code' in written) {
      return reply.code(500).send({ error: AppErrors.PO_UPLOAD_FAILED })
    }

    const field    = data.fields.docCategory
    const rawValue = Array.isArray(field)
      ? (field[0] as { value?: unknown } | undefined)?.value
      : (field as { value?: unknown } | undefined)?.value

    const docCategory = docCategorySchema.safeParse(rawValue)
    if (!docCategory.success) {
      await unlink(written.fullPath).catch(() => {})
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: docCategory.error.flatten() })
    }

    const result = await saveDocumentRecord(request.params.id, written, docCategory.data, request.authUser!.id)

    if ('code' in result && result.code === 'UPLOAD_FAILED') {
      return reply.code(500).send({ error: AppErrors.PO_UPLOAD_FAILED })
    }

    return reply.code(201).send({ data: result })
  })

  // ── GET /purchase-orders/:id/documents ────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/documents', { preHandler }, async (request, reply) => {
    const query = listDocumentsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    if (!(await purchaseOrderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    }

    const documents = await listDocuments(request.params.id, query.data)
    return reply.send({ data: documents })
  })

  // ── GET /purchase-orders/:id/documents/:docId/download ────────────────────
  app.get<{ Params: { id: string; docId: string } }>('/:id/documents/:docId/download', { preHandler }, async (request, reply) => {
    const document = await getDocumentById(request.params.id, request.params.docId)
    if (!document) return reply.code(404).send({ error: AppErrors.PO_DOCUMENT_NOT_FOUND })

    reply.type(document.mimeType).header('Content-Disposition', `inline; filename="${document.filename}"`)
    return reply.send(createReadStream(document.storageKey))
  })

  // ── DELETE /purchase-orders/:id/documents/:docId ──────────────────────────
  app.delete<{ Params: { id: string; docId: string } }>('/:id/documents/:docId', { preHandler }, async (request, reply) => {
    const result = await deleteDocument(request.params.id, request.params.docId, request.authUser!.id)
    if (result === null) return reply.code(404).send({ error: AppErrors.PO_DOCUMENT_NOT_FOUND })

    return reply.code(204).send()
  })
}
