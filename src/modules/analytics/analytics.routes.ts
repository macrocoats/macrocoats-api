import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { getAccessLog, getAccessSummary } from './analytics.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

const accessLogQuerySchema = z.object({
  companyKey: z.string().optional(),
  productKey: z.string().optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(500).default(50),
})

export async function analyticsRoutes(app: FastifyInstance) {
  // ── GET /analytics/access-log ─────────────────────────────────────────────
  app.get('/access-log', { preHandler }, async (request, reply) => {
    const query = accessLogQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }
    const result = await getAccessLog(query.data)
    return reply.send(result)
  })

  // ── GET /analytics/summary ────────────────────────────────────────────────
  app.get('/summary', { preHandler }, async (_request, reply) => {
    const summary = await getAccessSummary()
    return reply.send(summary)
  })
}
