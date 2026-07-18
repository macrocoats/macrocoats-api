import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createVendorSchema, updateVendorSchema } from './vendors.schema.js'
import {
  listVendors, getVendorById, createVendor, updateVendor, deleteVendor,
} from './vendors.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function vendorRoutes(app: FastifyInstance) {
  // ── GET /vendors ──────────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (_request, reply) => {
    const items = await listVendors()
    return reply.send({ vendors: items })
  })

  // ── GET /vendors/:id ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const vendor = await getVendorById(request.params.id)
    if (!vendor) return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })
    return reply.send({ vendor })
  })

  // ── POST /vendors ─────────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createVendorSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const vendor = await createVendor(body.data)
    return reply.code(201).send({ vendor })
  })

  // ── PUT /vendors/:id ──────────────────────────────────────────────────────
  app.put<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateVendorSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const vendor = await updateVendor(request.params.id, body.data)
    if (!vendor) return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })

    return reply.send({ vendor })
  })

  // ── DELETE /vendors/:id ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteVendor(request.params.id)
    if (!deleted) return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })
    return reply.code(204).send()
  })
}
