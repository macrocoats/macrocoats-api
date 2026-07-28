import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { AppErrors } from '../../types/errors.js'
import { overviewQuerySchema } from './production-planning.schema.js'
import { getProductionPlanningOverview } from './production-planning.service.js'

// Read-only, no formula percentages or cost/profit data (see the module's own
// notes in macrocoats-api CLAUDE.md) — operators are granted view access
// alongside superadmin.
const preHandler = [authenticate, requireAuth, requireRole('superadmin', 'operator')]

export async function productionPlanningRoutes(app: FastifyInstance) {
  // ── GET /production-planning/overview ─────────────────────────────────────
  app.get('/overview', { preHandler }, async (request, reply) => {
    const query = overviewQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await getProductionPlanningOverview(query.data)
    return reply.send({ data: result })
  })
}
