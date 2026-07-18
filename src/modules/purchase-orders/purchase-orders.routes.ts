import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  createPurchaseOrderSchema, updateItemsSchema, transitionStatusSchema,
  cancelSchema, updatePaymentSchema, listQuerySchema,
} from './purchase-orders.schema.js'
import {
  listPurchaseOrders, getPurchaseOrderById, createPurchaseOrder,
  updatePurchaseOrderItems, transitionPurchaseOrderStatus, cancelPurchaseOrder,
  updatePayment, listTimeline, getDashboardSummary,
} from './purchase-orders.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function purchaseOrderRoutes(app: FastifyInstance) {
  // ── GET /purchase-orders ──────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const { purchaseOrders: rows, total, page, limit } = await listPurchaseOrders(query.data)
    return reply.send({ data: rows, total, page, limit })
  })

  // ── GET /purchase-orders/summary ──────────────────────────────────────────
  // Registered before /:id so the literal segment "summary" never matches as a param.
  app.get('/summary', { preHandler }, async (_request, reply) => {
    const summary = await getDashboardSummary()
    return reply.send({ data: summary })
  })

  // ── GET /purchase-orders/:id ──────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const po = await getPurchaseOrderById(request.params.id)
    if (!po) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    return reply.send({ data: po })
  })

  // ── POST /purchase-orders ─────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createPurchaseOrderSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const po = await createPurchaseOrder(body.data, request.authUser!.id)
    return reply.code(201).send({ data: po })
  })

  // ── PUT /purchase-orders/:id/items ────────────────────────────────────────
  app.put<{ Params: { id: string } }>('/:id/items', { preHandler }, async (request, reply) => {
    const body = updateItemsSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await updatePurchaseOrderItems(request.params.id, body.data.items, request.authUser!.id)
    if (result === null) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    if (result === 'items_locked') return reply.code(409).send({ error: AppErrors.PO_ITEMS_LOCKED })

    return reply.send({ data: result })
  })

  // ── PATCH /purchase-orders/:id/status ─────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id/status', { preHandler }, async (request, reply) => {
    const body = transitionStatusSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await transitionPurchaseOrderStatus(request.params.id, body.data.status, request.authUser!.id, body.data.notes)
    if (result === null) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    if (result === 'invalid_transition') return reply.code(409).send({ error: AppErrors.INVALID_STATUS_TRANSITION })

    return reply.send({ data: result })
  })

  // ── PATCH /purchase-orders/:id/cancel ─────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id/cancel', { preHandler }, async (request, reply) => {
    const body = cancelSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await cancelPurchaseOrder(request.params.id, body.data.reason, request.authUser!.id)
    if (result === null) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    if (result === 'already_cancelled') return reply.code(409).send({ error: AppErrors.PO_ALREADY_CANCELLED })

    return reply.send({ data: result })
  })

  // ── PATCH /purchase-orders/:id/payment ────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id/payment', { preHandler }, async (request, reply) => {
    const body = updatePaymentSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await updatePayment(request.params.id, body.data, request.authUser!.id)
    if (result === null) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })

    return reply.send({ data: result })
  })

  // ── GET /purchase-orders/:id/timeline ─────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/timeline', { preHandler }, async (request, reply) => {
    const timeline = await listTimeline(request.params.id)
    if (timeline === null) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })

    return reply.send({ data: timeline })
  })
}
