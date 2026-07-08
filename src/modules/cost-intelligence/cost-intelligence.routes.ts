import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  overviewQuerySchema,
  trendsQuerySchema,
  batchCostQuerySchema,
  profitabilityQuerySchema,
  comparisonQuerySchema,
} from './cost-intelligence.schema.js'
import {
  getOverview,
  getTrends,
  listBatchCosts,
  getMaterials,
  getAlerts,
  getProfitability,
  getComparison,
} from './cost-intelligence.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function costIntelligenceRoutes(app: FastifyInstance) {
  // ── GET /cost-intelligence/overview ───────────────────────────────────────
  app.get('/overview', { preHandler }, async (request, reply) => {
    const query = overviewQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await getOverview(query.data)
    if (!result) return reply.code(404).send({ error: 'No matching batch found' })
    return reply.send(result)
  })

  // ── GET /cost-intelligence/trends ─────────────────────────────────────────
  app.get('/trends', { preHandler }, async (request, reply) => {
    const query = trendsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await getTrends(query.data)
    return reply.send(result)
  })

  // ── GET /cost-intelligence/batches ────────────────────────────────────────
  app.get('/batches', { preHandler }, async (request, reply) => {
    const query = batchCostQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await listBatchCosts(query.data)
    return reply.send(result)
  })

  // ── GET /cost-intelligence/materials ──────────────────────────────────────
  app.get('/materials', { preHandler }, async (_request, reply) => {
    const result = await getMaterials()
    return reply.send(result)
  })

  // ── GET /cost-intelligence/alerts ─────────────────────────────────────────
  app.get('/alerts', { preHandler }, async (_request, reply) => {
    const result = await getAlerts()
    return reply.send(result)
  })

  // ── GET /cost-intelligence/profitability ──────────────────────────────────
  app.get('/profitability', { preHandler }, async (request, reply) => {
    const query = profitabilityQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await getProfitability(query.data)
    return reply.send(result)
  })

  // ── GET /cost-intelligence/comparison ─────────────────────────────────────
  app.get('/comparison', { preHandler }, async (request, reply) => {
    const query = comparisonQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await getComparison(query.data)
    if (!result) return reply.code(404).send({ error: 'No batches found for comparison' })
    return reply.send(result)
  })
}
