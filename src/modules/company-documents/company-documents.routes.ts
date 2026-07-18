import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { documentMetaSchema } from './company-documents.schema.js'
import {
  companyExists, writeUploadedFile, saveDocumentRecord, listDocuments, getDocumentById, deleteDocument,
} from './company-documents.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

/**
 * Nested under /companies (registered with prefix `${prefix}/companies` in
 * app.ts) — mirrors how company-pricing nests under /companies/:id, and how
 * purchase-order-documents nests under /purchase-orders/:id.
 */
export async function companyDocumentRoutes(app: FastifyInstance) {
  // ── POST /companies/:id/documents ─────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/documents', { preHandler }, async (request, reply) => {
    if (!(await companyExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })
    }

    const data = await request.file()
    if (!data) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, message: 'No file uploaded.' })
    }

    // Drain the file stream to disk BEFORE reading any other multipart fields.
    // The metadata fields (orderNumber, orderDate, ...) are sent after the
    // file part in this app's FormData, and busboy only guarantees a field
    // has been parsed once everything preceding it in the body is consumed —
    // reading data.fields before this would race and see them as missing.
    const written = await writeUploadedFile(request.params.id, {
      filename: data.filename, mimetype: data.mimetype, fileStream: data.file,
    })
    if ('code' in written) {
      return reply.code(500).send({ error: AppErrors.COMPANY_DOC_UPLOAD_FAILED })
    }

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

    if ('code' in result && result.code === 'UPLOAD_FAILED') {
      return reply.code(500).send({ error: AppErrors.COMPANY_DOC_UPLOAD_FAILED })
    }

    return reply.code(201).send({ data: result })
  })

  // ── GET /companies/:id/documents ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/documents', { preHandler }, async (request, reply) => {
    if (!(await companyExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })
    }

    const documents = await listDocuments(request.params.id)
    return reply.send({ data: documents })
  })

  // ── GET /companies/:id/documents/:docId/download ──────────────────────────
  app.get<{ Params: { id: string; docId: string } }>('/:id/documents/:docId/download', { preHandler }, async (request, reply) => {
    const document = await getDocumentById(request.params.id, request.params.docId)
    if (!document) return reply.code(404).send({ error: AppErrors.COMPANY_DOCUMENT_NOT_FOUND })

    reply.type(document.mimeType).header('Content-Disposition', `inline; filename="${document.filename}"`)
    return reply.send(createReadStream(document.storageKey))
  })

  // ── DELETE /companies/:id/documents/:docId ────────────────────────────────
  app.delete<{ Params: { id: string; docId: string } }>('/:id/documents/:docId', { preHandler }, async (request, reply) => {
    const result = await deleteDocument(request.params.id, request.params.docId)
    if (result === null) return reply.code(404).send({ error: AppErrors.COMPANY_DOCUMENT_NOT_FOUND })

    return reply.code(204).send()
  })
}
