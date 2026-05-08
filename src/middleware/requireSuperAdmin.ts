import type { FastifyRequest, FastifyReply } from 'fastify'
import { AppErrors } from '../types/errors.js'

/**
 * Rejects with 403 unless the authenticated user is a superadmin.
 * Always chain after `requireAuth`.
 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.authUser?.role !== 'superadmin') {
    return reply.code(403).send({ error: AppErrors.FORBIDDEN, message: 'Superadmin access required.' })
  }
}
