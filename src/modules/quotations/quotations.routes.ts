import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  createQuotationSchema, listQuotationsQuerySchema,
} from './quotations.schema.js'
import {
  createQuotation, listQuotations, getQuotationById,
} from './quotations.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function quotationRoutes(app: FastifyInstance) {
  // ── POST /quotations ──────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createQuotationSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const quotation = await createQuotation(body.data, request.authUser!.id)
    return reply.code(201).send(quotation)
  })

  // ── GET /quotations ───────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listQuotationsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await listQuotations(query.data)
    return reply.send(result)
  })

  // ── GET /quotations/:id ───────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const quotation = await getQuotationById(request.params.id)
    if (!quotation) return reply.code(404).send({ error: AppErrors.QUOTATION_NOT_FOUND })
    return reply.send(quotation)
  })
}
