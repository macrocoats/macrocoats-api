import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { dashboardFilterSchema, projectionsQuerySchema } from './investor-dashboard.schema.js'
import { getExecutiveKpis, getSalesAnalytics, getProjections } from './investor-dashboard.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function investorDashboardRoutes(app: FastifyInstance) {
  app.get('/executive-kpis', { preHandler }, async (request, reply) => {
    const query = dashboardFilterSchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    return reply.send({ data: await getExecutiveKpis(query.data) })
  })

  app.get('/sales-analytics', { preHandler }, async (request, reply) => {
    const query = dashboardFilterSchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    return reply.send({ data: await getSalesAnalytics(query.data) })
  })

  app.get('/projections', { preHandler }, async (request, reply) => {
    const query = projectionsQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    return reply.send({ data: await getProjections(query.data) })
  })
}
