import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { createBatchSchema, listBatchesQuerySchema } from './batches.schema.js'
import { createBatch, listBatches, getBatchByNumber, deleteBatch } from './batches.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function batchRoutes(app: FastifyInstance) {
  // ── POST /batches ─────────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createBatchSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const batch = await createBatch(body.data, request.authUser?.id ?? null)
    return reply.code(201).send(batch)
  })

  // ── GET /batches ──────────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listBatchesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: query.error.flatten() })
    }

    const result = await listBatches(query.data)
    return reply.send(result)
  })

  // ── GET /batches/:batchNumber ─────────────────────────────────────────────
  app.get<{ Params: { batchNumber: string } }>('/:batchNumber', { preHandler }, async (request, reply) => {
    const batch = await getBatchByNumber(request.params.batchNumber)
    if (!batch) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' })
    return reply.send(batch)
  })

  // ── DELETE /batches/:id ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteBatch(request.params.id)
    if (!deleted) return reply.code(404).send({ error: 'BATCH_NOT_FOUND' })
    return reply.code(204).send()
  })
}
