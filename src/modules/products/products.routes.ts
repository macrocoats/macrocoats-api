import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { checkProductAccess } from '../../middleware/checkProductAccess.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { logAccess } from '../../middleware/logAccess.js'
import { productParamsSchema, updateDocumentSchema } from './products.schema.js'
import { getDocument, updateDocument, listProducts } from './products.service.js'

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

  // ── GET /products/:productLine/:docType ──────────────────────────────────
  app.get<{ Params: { productLine: string; docType: string } }>(
    '/:productLine/:docType',
    { preHandler: [authenticate, requireAuth, checkProductAccess, logAccess] },
    async (request, reply) => {
      const params = productParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: params.error.flatten() })
      }

      const doc = await getDocument(params.data.productLine, params.data.docType)
      if (!doc) {
        return reply.code(404).send({ error: 'DOCUMENT_NOT_FOUND' })
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
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: params.error.flatten() })
      }

      const body = updateDocumentSchema.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
      }

      const updated = await updateDocument(
        params.data.productLine,
        params.data.docType,
        body.data,
        request.authUser!.id,
      )

      if (!updated) {
        return reply.code(404).send({ error: 'DOCUMENT_NOT_FOUND' })
      }

      return reply.send(updated)
    },
  )
}
