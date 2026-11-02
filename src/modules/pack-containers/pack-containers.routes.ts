import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { adjustStockSchema, containerIdSchema, listMovementsQuerySchema, updateContainerSchema } from './pack-containers.schema.js'
import { adjustStock, listContainers, listMovements, updateMinimum } from './pack-containers.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function packContainerRoutes(app: FastifyInstance) {
  // ── GET /pack-containers ──────────────────────────────────────────────────
  app.get('/', { preHandler }, async (_request, reply) => {
    return reply.send({ data: await listContainers() })
  })

  // ── GET /pack-containers/movements ────────────────────────────────────────
  app.get('/movements', { preHandler }, async (request, reply) => {
    const query = listMovementsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }
    return reply.send({ data: await listMovements(query.data) })
  })

  // ── POST /pack-containers/:id/adjustments ─────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/adjustments', { preHandler }, async (request, reply) => {
    const id = containerIdSchema.safeParse(request.params.id)
    if (!id.success) return reply.code(404).send({ error: 'CONTAINER_NOT_FOUND' })
    const body = adjustStockSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    return reply.code(201).send({ data: await adjustStock(id.data, body.data, request.authUser!.id) })
  })

  // ── PATCH /pack-containers/:id ────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const id = containerIdSchema.safeParse(request.params.id)
    if (!id.success) return reply.code(404).send({ error: 'CONTAINER_NOT_FOUND' })
    const body = updateContainerSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    return reply.send({ data: await updateMinimum(id.data, body.data.lowStockThreshold, request.authUser!.id) })
  })
}
