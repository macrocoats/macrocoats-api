import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { listFinishedGoodsQuerySchema, setFinishedGoodsStatusSchema, backfillFinishedGoodsSchema } from './finished-goods.schema.js'
import {
  listFinishedGoods,
  getFinishedGoodsByBatchNumber,
  setFinishedGoodsStatus,
  getFinishedGoodsSummary,
  backfillFinishedGoodsForBatch,
} from './finished-goods.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function finishedGoodsRoutes(app: FastifyInstance) {
  // ── GET /finished-goods ───────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listFinishedGoodsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await listFinishedGoods(query.data)
    return reply.send({ data: result })
  })

  // ── GET /finished-goods/summary ───────────────────────────────────────────
  // Registered before /:batchNumber so the literal segment never matches as a param.
  app.get('/summary', { preHandler }, async (_request, reply) => {
    const summary = await getFinishedGoodsSummary()
    return reply.send({ data: summary })
  })

  // ── POST /finished-goods/backfill/:batchNumber ────────────────────────────
  // Manual, superadmin-only entry point for batches created before this feature
  // existed. Never overwrites an existing finished_goods row.
  app.post<{ Params: { batchNumber: string } }>('/backfill/:batchNumber', { preHandler }, async (request, reply) => {
    const body = backfillFinishedGoodsSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await backfillFinishedGoodsForBatch(request.params.batchNumber, body.data.remainingQuantity)

    if ('code' in result) {
      if (result.code === 'BATCH_NOT_FOUND') {
        return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
      }
      if (result.code === 'ALREADY_EXISTS') {
        return reply.code(409).send({
          error:   AppErrors.FINISHED_GOODS_ALREADY_EXISTS,
          message: 'This batch already has a finished-goods record.',
        })
      }
      return reply.code(400).send({
        error:   AppErrors.VALIDATION_ERROR,
        message: `Remaining quantity cannot exceed the produced quantity (${result.producedQuantity}).`,
      })
    }

    return reply.code(201).send({ data: result })
  })

  // ── GET /finished-goods/:batchNumber ──────────────────────────────────────
  app.get<{ Params: { batchNumber: string } }>('/:batchNumber', { preHandler }, async (request, reply) => {
    const record = await getFinishedGoodsByBatchNumber(request.params.batchNumber)
    if (!record) return reply.code(404).send({ error: AppErrors.FINISHED_GOODS_NOT_FOUND })
    return reply.send({ data: record })
  })

  // ── PATCH /finished-goods/:id/status ──────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id/status', { preHandler }, async (request, reply) => {
    const body = setFinishedGoodsStatusSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await setFinishedGoodsStatus(request.params.id, body.data.status, body.data.reason)

    if (result && 'code' in result && result.code === 'REASON_REQUIRED') {
      return reply.code(400).send({
        error:   AppErrors.VALIDATION_ERROR,
        message: 'A reason is required when cancelling finished goods.',
      })
    }

    if (!result) return reply.code(404).send({ error: AppErrors.FINISHED_GOODS_NOT_FOUND })
    return reply.send({ data: result })
  })
}
