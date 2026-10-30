import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import {
  createWorkOrderBatchSchema, createWorkOrderSchema, idempotencyKeySchema, listWorkOrdersQuerySchema, transitionWorkOrderSchema,
} from './production-work-orders.schema.js'
import { createWorkOrder, createWorkOrderBatch, getWorkOrder, listWorkOrders, transitionWorkOrder } from './production-work-orders.service.js'

const operatorPreHandler = [authenticate, requireAuth, requireRole('superadmin', 'operator')]

export async function productionWorkOrderRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: operatorPreHandler }, async (request, reply) => {
    const query = listWorkOrdersQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: query.error.flatten() })
    const result = await listWorkOrders(query.data, request.authUser!.role === 'superadmin')
    return reply.send({ data: result })
  })

  app.post('/', { preHandler: operatorPreHandler }, async (request, reply) => {
    const body = createWorkOrderSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    const result = await createWorkOrder(body.data, request.authUser!.id, request.authUser!.role === 'superadmin')
    if ('code' in result) {
      const status = result.code === 'VARIANT_NOT_FOUND' || result.code === 'FORMULA_NOT_FOUND' ? 404 : 409
      return reply.code(status).send({ error: result.code, remaining: result.remaining })
    }
    return reply.code(201).send({ data: result })
  })

  app.get<{ Params: { id: string } }>('/:id', { preHandler: operatorPreHandler }, async (request, reply) => {
    const result = await getWorkOrder(request.params.id, request.authUser!.role === 'superadmin')
    if (!result) return reply.code(404).send({ error: 'PRODUCTION_WORK_ORDER_NOT_FOUND' })
    return reply.send({ data: result })
  })

  app.post<{ Params: { id: string } }>('/:id/transition', { preHandler: operatorPreHandler }, async (request, reply) => {
    const body = transitionWorkOrderSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    const result = await transitionWorkOrder(request.params.id, body.data, request.authUser!.id, request.authUser!.role === 'superadmin')
    if ('code' in result) {
      const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'REASON_REQUIRED' ? 400 : result.code === 'FORBIDDEN' ? 403 : 409
      const message = result.code === 'MATERIALS_NOT_READY' ? 'Raw materials are short for this work order.' : undefined
      return reply.code(status).send({ error: result.code, message, shortages: result.shortages })
    }
    return reply.send({ data: result })
  })

  // Operators produce batches here (server builds formula/label/cost snapshots
  // and returns the operator-safe batch view). `Idempotency-Key` makes a
  // retried submit return the batch it already created instead of a second one.
  app.post<{ Params: { id: string } }>('/:id/batches', { preHandler: operatorPreHandler }, async (request, reply) => {
    const body = createWorkOrderBatchSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    const key = idempotencyKeySchema.safeParse(request.headers['idempotency-key'])
    if (!key.success) return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: key.error.flatten() })
    const role = request.authUser!.role === 'superadmin' ? 'superadmin' : 'operator'
    const result = await createWorkOrderBatch(request.params.id, body.data, { id: request.authUser!.id, role }, key.data)
    if ('code' in result) {
      if (result.code === 'NOT_FOUND' || result.code === 'VARIANT_NOT_FOUND') return reply.code(404).send({ error: result.code })
      if (result.code === 'MATERIAL_NOT_FOUND') return reply.code(409).send({ error: result.code, message: `No usable inventory balance exists for ${result.materialName}.` })
      if (result.code === 'INSUFFICIENT_MATERIAL') return reply.code(409).send({ error: result.code, message: `Insufficient ${result.materialName}.`, available: result.available, required: result.required })
      return reply.code(409).send({ error: result.code })
    }
    return reply.code(result.replayed ? 200 : 201).send({ data: result })
  })
}
