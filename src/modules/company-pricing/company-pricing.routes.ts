import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { upsertPricingSchema } from './company-pricing.schema.js'
import { companyExists, getCompanyPricing, upsertCompanyPricing } from './company-pricing.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function companyPricingRoutes(app: FastifyInstance) {
  // ── GET /companies/:id/pricing ────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/pricing', { preHandler }, async (request, reply) => {
    if (!(await companyExists(request.params.id))) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })

    const prices = await getCompanyPricing(request.params.id)
    return reply.send({ data: prices })
  })

  // ── PUT /companies/:id/pricing ─────────────────────────────────────────────
  app.put<{ Params: { id: string } }>('/:id/pricing', { preHandler }, async (request, reply) => {
    if (!(await companyExists(request.params.id))) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })

    const body = upsertPricingSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const prices = await upsertCompanyPricing(request.params.id, body.data)
    return reply.send({ data: prices })
  })
}
