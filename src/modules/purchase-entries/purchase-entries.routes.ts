import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createPurchaseEntrySchema, listPurchaseEntriesQuerySchema, purchaseSummaryQuerySchema } from './purchase-entries.schema.js'
import { listPurchaseEntries, getPurchaseEntryById, createPurchaseEntry, getPurchaseSummary } from './purchase-entries.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function purchaseEntryRoutes(app: FastifyInstance) {
  // ── GET /purchase-entries ─────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listPurchaseEntriesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await listPurchaseEntries(query.data)
    return reply.send({ data: result })
  })

  // ── GET /purchase-entries/summary ─────────────────────────────────────────
  // Literal segment registered ahead of `/:id` so it is never read as an id.
  app.get('/summary', { preHandler }, async (request, reply) => {
    const query = purchaseSummaryQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }
    return reply.send({ data: await getPurchaseSummary(query.data) })
  })

  // ── GET /purchase-entries/:id ──────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const entry = await getPurchaseEntryById(request.params.id)
    if (!entry) return reply.code(404).send({ error: AppErrors.PURCHASE_ENTRY_NOT_FOUND })
    return reply.send({ data: entry })
  })

  // ── POST /purchase-entries ────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createPurchaseEntrySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await createPurchaseEntry(body.data, request.authUser?.id ?? null)

    if ('code' in result && result.code === 'PRICE_NOT_AVAILABLE') {
      return reply.code(400).send({ error: AppErrors.PRICE_NOT_AVAILABLE })
    }

    return reply.code(201).send({ data: result })
  })
}
