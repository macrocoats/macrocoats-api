import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { createStaffSchema, updateStaffSchema } from './staff.schema.js'
import {
  listStaff, getStaffById, createStaff, updateStaff, deleteStaff,
} from './staff.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function staffRoutes(app: FastifyInstance) {
  // ── GET /staff ────────────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (_request, reply) => {
    const items = await listStaff()
    return reply.send({ staff: items })
  })

  // ── GET /staff/:id ────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const member = await getStaffById(request.params.id)
    if (!member) return reply.code(404).send({ error: 'STAFF_NOT_FOUND' })
    return reply.send({ staff: member })
  })

  // ── POST /staff ───────────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createStaffSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const member = await createStaff(body.data)
    return reply.code(201).send({ staff: member })
  })

  // ── PUT /staff/:id ────────────────────────────────────────────────────────
  app.put<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateStaffSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const member = await updateStaff(request.params.id, body.data)
    if (!member) return reply.code(404).send({ error: 'STAFF_NOT_FOUND' })

    return reply.send({ staff: member })
  })

  // ── DELETE /staff/:id ─────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteStaff(request.params.id)
    if (!deleted) return reply.code(404).send({ error: 'STAFF_NOT_FOUND' })
    return reply.code(204).send()
  })
}
