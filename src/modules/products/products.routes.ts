import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { checkProductAccess } from '../../middleware/checkProductAccess.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { logAccess } from '../../middleware/logAccess.js'
import { AppErrors } from '../../types/errors.js'
import { productParamsSchema, documentQuerySchema, updateDocumentSchema, transitionStatusSchema } from './products.schema.js'
import { bodySchemaByDocType } from './products.body-schemas.js'
import {
  getDocument,
  updateDocument,
  listProducts,
  transitionDocumentStatus,
  listAuditTrail,
  listExpirySummary,
} from './products.service.js'
import type { DocType } from '../../types/index.js'

export async function productRoutes(app: FastifyInstance) {
  // ── GET /products — list all active products (superadmin only) ───────────
  app.get(
    '/',
    { preHandler: [authenticate, requireAuth, requireSuperAdmin] },
    async (_request, reply) => {
      const products = await listProducts()
      return reply.send({ products })
    },
  )

  // ── GET /products/expiry-summary (superadmin only) ────────────────────────
  // Registered before the /:productLine/:docType routes so "expiry-summary" never matches as a productLine.
  app.get(
    '/expiry-summary',
    { preHandler: [authenticate, requireAuth, requireSuperAdmin] },
    async (_request, reply) => {
      const summary = await listExpirySummary()
      return reply.send({ summary })
    },
  )

  // ── GET /products/:productLine/:docType ──────────────────────────────────
  app.get<{ Params: { productLine: string; docType: string }; Querystring: { variantId?: string; view?: string } }>(
    '/:productLine/:docType',
    { preHandler: [authenticate, requireAuth, checkProductAccess, logAccess] },
    async (request, reply) => {
      const params = productParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
      }

      // variantId/view are optional convenience params, not required input — a malformed
      // value falls back to "no variant selected" (baseline document) rather than 400ing
      // the whole document read.
      const query = documentQuerySchema.safeParse(request.query)
      const opts  = query.success ? { variantId: query.data.variantId, view: query.data.view } : undefined

      const doc = await getDocument(params.data.productLine, params.data.docType, request.authUser, opts)
      if (!doc) {
        return reply.code(404).send({ error: AppErrors.DOCUMENT_NOT_FOUND })
      }

      return reply.send(doc)
    },
  )

  // ── PUT /products/:productLine/:docType (superadmin only) ────────────────
  app.put<{ Params: { productLine: string; docType: string } }>(
    '/:productLine/:docType',
    { preHandler: [authenticate, requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = productParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
      }

      const body = updateDocumentSchema.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
      }

      // Second-pass, docType-specific validation for formula/tds/msds — label/coa
      // have no schema here and stay unchecked (z.record(z.unknown()) at the outer level).
      if (body.data.body !== undefined) {
        const bodySchema = bodySchemaByDocType[params.data.docType as DocType]
        if (bodySchema) {
          const bodyResult = bodySchema.safeParse(body.data.body)
          if (!bodyResult.success) {
            return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: bodyResult.error.flatten() })
          }
        }
      }

      const updated = await updateDocument(
        params.data.productLine,
        params.data.docType,
        body.data,
        request.authUser!.id,
      )

      if (!updated) {
        return reply.code(404).send({ error: AppErrors.DOCUMENT_NOT_FOUND })
      }

      return reply.send(updated)
    },
  )

  // ── PATCH /products/:productLine/:docType/status (superadmin only) ───────
  app.patch<{ Params: { productLine: string; docType: string } }>(
    '/:productLine/:docType/status',
    { preHandler: [authenticate, requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = productParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
      }

      const body = transitionStatusSchema.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
      }

      const result = await transitionDocumentStatus(
        params.data.productLine,
        params.data.docType,
        body.data.status,
        request.authUser!.id,
        body.data.notes,
      )

      if (result === null) {
        return reply.code(404).send({ error: AppErrors.DOCUMENT_NOT_FOUND })
      }
      if (result === 'invalid_transition') {
        return reply.code(409).send({ error: AppErrors.INVALID_STATUS_TRANSITION })
      }

      return reply.send(result)
    },
  )

  // ── GET /products/:productLine/:docType/audit (superadmin only) ──────────
  app.get<{ Params: { productLine: string; docType: string } }>(
    '/:productLine/:docType/audit',
    { preHandler: [authenticate, requireAuth, requireSuperAdmin] },
    async (request, reply) => {
      const params = productParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
      }

      const entries = await listAuditTrail(params.data.productLine, params.data.docType)
      if (entries === null) {
        return reply.code(404).send({ error: AppErrors.DOCUMENT_NOT_FOUND })
      }

      return reply.send({ entries })
    },
  )
}
