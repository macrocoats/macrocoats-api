import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { analyzeSchema } from './optimizer.schema.js'
import { analyzeFormulation } from './optimizer.service.js'

const adminHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function optimizerRoutes(app: FastifyInstance) {
  // ── POST /optimizer/analyze ────────────────────────────────────────────────
  app.post('/analyze', { preHandler: adminHandler }, async (request, reply) => {
    const body = analyzeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await analyzeFormulation(body.data)
    if (!result) {
      return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    }

    return reply.send({ data: result })
  })
}
