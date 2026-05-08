import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createInventoryItemSchema, updateInventoryItemSchema } from './inventory.schema.js'
import {
  getAllItems, createItem, updateItem, deleteItem, resetToDefaults,
} from './inventory.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function inventoryRoutes(app: FastifyInstance) {
  // ── GET /inventory ────────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (_request, reply) => {
    const items = await getAllItems()
    return reply.send({ items })
  })

  // ── POST /inventory ───────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createInventoryItemSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const item = await createItem(body.data, request.authUser!.id)
    return reply.code(201).send(item)
  })

  // ── PATCH /inventory/:id ──────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateInventoryItemSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const item = await updateItem(request.params.id, body.data, request.authUser!.id)
    if (!item) return reply.code(404).send({ error: AppErrors.ITEM_NOT_FOUND })

    return reply.send(item)
  })

  // ── DELETE /inventory/:id ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteItem(request.params.id)
    if (!deleted) return reply.code(404).send({ error: AppErrors.ITEM_NOT_FOUND })
    return reply.code(204).send()
  })

  // ── POST /inventory/reset ─────────────────────────────────────────────────
  app.post('/reset', { preHandler }, async (_request, reply) => {
    const items = await resetToDefaults()
    return reply.send({ items })
  })
}
