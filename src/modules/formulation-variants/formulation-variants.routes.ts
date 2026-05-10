import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  createVariantSchema,
  updateVariantSchema,
  replaceComponentsSchema,
} from './formulation-variants.schema.js'
import {
  listVariantsForProduct,
  getVariantById,
  createVariant,
  updateVariant,
  replaceComponents,
  deleteVariant,
} from './formulation-variants.service.js'

const adminHandler = [authenticate, requireAuth, requireSuperAdmin]
const readHandler  = [authenticate, requireAuth]

export async function formulationVariantRoutes(app: FastifyInstance) {
  // ── GET /formulation-variants?productKey=X ────────────────────────────────
  app.get<{ Querystring: { productKey?: string } }>('/', { preHandler: readHandler }, async (request, reply) => {
    const { productKey } = request.query
    if (!productKey) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, message: 'productKey query param is required' })
    }
    const variants = await listVariantsForProduct(productKey)
    return reply.send({ data: variants })
  })

  // ── GET /formulation-variants/:variantId ──────────────────────────────────
  app.get<{ Params: { variantId: string } }>('/:variantId', { preHandler: readHandler }, async (request, reply) => {
    const variant = await getVariantById(request.params.variantId)
    if (!variant) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    return reply.send({ data: variant })
  })

  // ── POST /formulation-variants ────────────────────────────────────────────
  app.post('/', { preHandler: adminHandler }, async (request, reply) => {
    const body = createVariantSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    try {
      const variant = await createVariant(body.data)
      return reply.code(201).send({ data: variant })
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.code(409).send({ error: 'VARIANT_EXISTS', message: 'A variant for this product+company already exists.' })
      }
      throw err
    }
  })

  // ── PUT /formulation-variants/:variantId ──────────────────────────────────
  app.put<{ Params: { variantId: string } }>('/:variantId', { preHandler: adminHandler }, async (request, reply) => {
    const body = updateVariantSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const variant = await updateVariant(request.params.variantId, body.data)
    if (!variant) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    return reply.send({ data: variant })
  })

  // ── PUT /formulation-variants/:variantId/components ───────────────────────
  app.put<{ Params: { variantId: string } }>('/:variantId/components', { preHandler: adminHandler }, async (request, reply) => {
    const body = replaceComponentsSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const existing = await getVariantById(request.params.variantId)
    if (!existing) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })

    const components = await replaceComponents(request.params.variantId, body.data.components)
    return reply.send({ data: components })
  })

  // ── DELETE /formulation-variants/:variantId ───────────────────────────────
  app.delete<{ Params: { variantId: string } }>('/:variantId', { preHandler: adminHandler }, async (request, reply) => {
    const deleted = await deleteVariant(request.params.variantId)
    if (!deleted) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    return reply.code(204).send()
  })
}
