import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createDispatchSchema, updateDispatchSchema, voidDispatchSchema, listDispatchesQuerySchema } from './dispatch.schema.js'
import {
  createDispatch,
  updateDispatch,
  listDispatches,
  getDispatchByNumber,
  getDispatchSummary,
  voidDispatch,
} from './dispatch.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function dispatchRoutes(app: FastifyInstance) {
  // ── POST /dispatches ──────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createDispatchSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await createDispatch(body.data, request.authUser!.id)

    if ('code' in result && result.code === 'FINISHED_GOODS_NOT_FOUND') {
      return reply.code(404).send({ error: AppErrors.FINISHED_GOODS_NOT_FOUND })
    }
    if ('code' in result && result.code === 'INSUFFICIENT_STOCK') {
      return reply.code(409).send({
        error:     AppErrors.DISPATCH_INSUFFICIENT_STOCK,
        message:   `Dispatch quantity (${body.data.quantity}) exceeds available stock (${result.available}) for this batch.`,
        available: result.available,
      })
    }

    return reply.code(201).send({ data: result })
  })

  // ── GET /dispatches ───────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listDispatchesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await listDispatches(query.data)
    return reply.send({ data: result })
  })

  // ── GET /dispatches/summary ───────────────────────────────────────────────
  // Registered before /:dispatchNumber so the literal segment never matches as a param.
  app.get('/summary', { preHandler }, async (_request, reply) => {
    const summary = await getDispatchSummary()
    return reply.send({ data: summary })
  })

  // ── GET /dispatches/:dispatchNumber ───────────────────────────────────────
  app.get<{ Params: { dispatchNumber: string } }>('/:dispatchNumber', { preHandler }, async (request, reply) => {
    const dispatch = await getDispatchByNumber(request.params.dispatchNumber)
    if (!dispatch) return reply.code(404).send({ error: AppErrors.DISPATCH_NOT_FOUND })
    return reply.send({ data: dispatch })
  })

  // ── PATCH /dispatches/:id ─────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateDispatchSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await updateDispatch(request.params.id, body.data, request.authUser!.id)

    if ('code' in result && result.code === 'DISPATCH_NOT_FOUND') {
      return reply.code(404).send({ error: AppErrors.DISPATCH_NOT_FOUND })
    }
    if ('code' in result && result.code === 'DISPATCH_ALREADY_VOIDED') {
      return reply.code(409).send({ error: AppErrors.DISPATCH_ALREADY_VOIDED, message: 'Voided dispatches cannot be edited.' })
    }
    if ('code' in result && result.code === 'DISPATCH_BATCH_CANCELLED') {
      return reply.code(409).send({ error: AppErrors.DISPATCH_BATCH_CANCELLED, message: 'This batch has been cancelled and its dispatches can no longer be edited.' })
    }
    if ('code' in result && result.code === 'INSUFFICIENT_STOCK') {
      return reply.code(409).send({
        error:     AppErrors.DISPATCH_INSUFFICIENT_STOCK,
        message:   `Updated quantity exceeds available stock (${result.available}) for this batch.`,
        available: result.available,
      })
    }

    return reply.send({ data: result })
  })

  // ── PATCH /dispatches/:id/void ────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id/void', { preHandler }, async (request, reply) => {
    const body = voidDispatchSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await voidDispatch(request.params.id, body.data.reason, request.authUser!.id)

    if ('code' in result && result.code === 'DISPATCH_NOT_FOUND') {
      return reply.code(404).send({ error: AppErrors.DISPATCH_NOT_FOUND })
    }
    if ('code' in result && result.code === 'DISPATCH_ALREADY_VOIDED') {
      return reply.code(404).send({ error: AppErrors.DISPATCH_ALREADY_VOIDED })
    }

    return reply.send({ data: result })
  })
}
