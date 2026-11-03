import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { PRODUCT_KEYS } from '../../types/index.js'
import {
  getAccessLog, getAccessSummary, getAccessOverview, ACCESS_DOC_TYPES,
} from './analytics.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

const accessLogQuerySchema = z.object({
  companyKey: z.string().optional(),
  productKey: z.string().optional(),
  docType:    z.enum(ACCESS_DOC_TYPES).optional(),
  q:          z.string().trim().max(100).optional(),
  customerOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  from:       z.string().optional(),
  to:         z.string().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(500).default(50),
})

const accessOverviewQuerySchema = z.object({
  days:       z.enum(['7', '30', '90']).default('30').transform((d) => Number(d) as 7 | 30 | 90),
  companyKey: z.string().optional(),
  productKey: z.enum(PRODUCT_KEYS).optional(),
  docType:    z.enum(ACCESS_DOC_TYPES).optional(),
})

export async function analyticsRoutes(app: FastifyInstance) {
  // ── GET /analytics/access-log ─────────────────────────────────────────────
  app.get('/access-log', { preHandler }, async (request, reply) => {
    const query = accessLogQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }
    const result = await getAccessLog(query.data)
    return reply.send({ data: result })
  })

  // ── GET /analytics/access-overview ────────────────────────────────────────
  app.get('/access-overview', { preHandler }, async (request, reply) => {
    const query = accessOverviewQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }
    const result = await getAccessOverview(query.data)
    return reply.send({ data: result })
  })

  // ── GET /analytics/summary ────────────────────────────────────────────────
  app.get('/summary', { preHandler }, async (_request, reply) => {
    const summary = await getAccessSummary()
    return reply.send({ data: summary })
  })
}
