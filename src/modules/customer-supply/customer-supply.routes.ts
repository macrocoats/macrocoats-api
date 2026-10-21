import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  supplySummaryQuerySchema,
  createPipelineEntrySchema,
  updatePipelineEntrySchema,
  pipelineEntryParamsSchema,
  listPipelineQuerySchema,
} from './customer-supply.schema.js'
import {
  getSupplySummary,
  listPipelineEntries,
  createPipelineEntry,
  updatePipelineEntry,
  deletePipelineEntry,
} from './customer-supply.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

/** Registered with prefix `${prefix}/customer-supply` in app.ts. */
export async function customerSupplyRoutes(app: FastifyInstance) {
  // ── GET /customer-supply/summary ──────────────────────────────────────────
  // Customer-wise, product-wise and monthly supply figures from Zoho invoices,
  // with dispatch-confirmed quantities from this portal's dispatch records.
  app.get('/summary', { preHandler }, async (request, reply) => {
    const query = supplySummaryQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await getSupplySummary(query.data)
    if ('code' in result) {
      if (result.code === 'ZOHO_NOT_CONFIGURED') return reply.code(400).send({ error: AppErrors.ZOHO_NOT_CONFIGURED })
      return reply.code(502).send({ error: AppErrors.ZOHO_SYNC_FAILED, message: result.message })
    }
    return reply.send({ data: result })
  })

  // ── GET /customer-supply/pipeline ─────────────────────────────────────────
  app.get('/pipeline', { preHandler }, async (request, reply) => {
    const query = listPipelineQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }
    const rows = await listPipelineEntries(query.data.includeArchived === 'true')
    return reply.send({ data: rows })
  })

  // ── POST /customer-supply/pipeline ────────────────────────────────────────
  app.post('/pipeline', { preHandler }, async (request, reply) => {
    const body = createPipelineEntrySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const row = await createPipelineEntry(body.data, request.authUser?.id)
    return reply.code(201).send({ data: row })
  })

  // ── PATCH /customer-supply/pipeline/:id ───────────────────────────────────
  app.patch<{ Params: { id: string } }>('/pipeline/:id', { preHandler }, async (request, reply) => {
    const params = pipelineEntryParamsSchema.safeParse(request.params)
    const body = updatePipelineEntrySchema.safeParse(request.body)
    if (!params.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
    }
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const row = await updatePipelineEntry(params.data.id, body.data)
    if (!row) return reply.code(404).send({ error: AppErrors.NOT_FOUND })
    return reply.send({ data: row })
  })

  // ── DELETE /customer-supply/pipeline/:id ──────────────────────────────────
  app.delete<{ Params: { id: string } }>('/pipeline/:id', { preHandler }, async (request, reply) => {
    const params = pipelineEntryParamsSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
    }
    const deleted = await deletePipelineEntry(params.data.id)
    if (!deleted) return reply.code(404).send({ error: AppErrors.NOT_FOUND })
    return reply.code(204).send()
  })
}
