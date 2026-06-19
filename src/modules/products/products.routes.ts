import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { checkProductAccess } from '../../middleware/checkProductAccess.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { logAccess } from '../../middleware/logAccess.js'
import { AppErrors } from '../../types/errors.js'
import { productParamsSchema, updateDocumentSchema, transitionStatusSchema } from './products.schema.js'
import {
  getDocument,
  updateDocument,
  listProducts,
  transitionDocumentStatus,
  listAuditTrail,
  listExpirySummary,
} from './products.service.js'

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
  app.get<{ Params: { productLine: string; docType: string } }>(
    '/:productLine/:docType',
    { preHandler: [authenticate, requireAuth, checkProductAccess, logAccess] },
    async (request, reply) => {
      const params = productParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
      }

      const doc = await getDocument(params.data.productLine, params.data.docType, request.authUser!.role)
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
