import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createHazardProfileSchema, updateHazardProfileSchema, listHazardProfilesQuerySchema } from './hazard-profiles.schema.js'
import {
  listHazardProfiles,
  getHazardProfileById,
  createHazardProfile,
  updateHazardProfile,
  deactivateHazardProfile,
} from './hazard-profiles.service.js'

const adminHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function hazardProfileRoutes(app: FastifyInstance) {
  // ── GET /hazard-profiles?includeInactive=true ─────────────────────────────
  app.get<{ Querystring: { includeInactive?: string } }>('/', { preHandler: adminHandler }, async (request, reply) => {
    const query = listHazardProfilesQuerySchema.safeParse(request.query)
    const includeInactive = query.success && query.data.includeInactive === 'true'
    const profiles = await listHazardProfiles(includeInactive)
    return reply.send({ data: profiles })
  })

  // ── GET /hazard-profiles/:id ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler: adminHandler }, async (request, reply) => {
    const profile = await getHazardProfileById(request.params.id)
    if (!profile) return reply.code(404).send({ error: AppErrors.HAZARD_PROFILE_NOT_FOUND })
    return reply.send({ data: profile })
  })

  // ── POST /hazard-profiles ────────────────────────────────────────────────────
  app.post('/', { preHandler: adminHandler }, async (request, reply) => {
    const body = createHazardProfileSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    try {
      const profile = await createHazardProfile(body.data, request.authUser!.id)
      return reply.code(201).send({ data: profile })
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.code(409).send({
          error: 'HAZARD_PROFILE_EXISTS',
          message: 'A hazard profile with this canonical name already exists.',
        })
      }
      throw err
    }
  })

  // ── PUT /hazard-profiles/:id ──────────────────────────────────────────────────
  app.put<{ Params: { id: string } }>('/:id', { preHandler: adminHandler }, async (request, reply) => {
    const body = updateHazardProfileSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const profile = await updateHazardProfile(request.params.id, body.data, request.authUser!.id)
    if (!profile) return reply.code(404).send({ error: AppErrors.HAZARD_PROFILE_NOT_FOUND })
    return reply.send({ data: profile })
  })

  // ── DELETE /hazard-profiles/:id (soft-delete — sets isActive=false) ──────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: adminHandler }, async (request, reply) => {
    const profile = await deactivateHazardProfile(request.params.id, request.authUser!.id)
    if (!profile) return reply.code(404).send({ error: AppErrors.HAZARD_PROFILE_NOT_FOUND })
    return reply.code(204).send()
  })
}
