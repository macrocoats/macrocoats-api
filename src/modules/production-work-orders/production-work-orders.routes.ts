import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { createWorkOrderSchema, listWorkOrdersQuerySchema, transitionWorkOrderSchema } from './production-work-orders.schema.js'
import { createWorkOrder, getWorkOrder, listWorkOrders, transitionWorkOrder } from './production-work-orders.service.js'

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
    const result = await transitionWorkOrder(request.params.id, body.data, request.authUser!.role === 'superadmin')
    if ('code' in result) {
      const status = result.code === 'NOT_FOUND' ? 404 : 409
      return reply.code(status).send({ error: result.code })
    }
    return reply.send({ data: result })
  })
}
