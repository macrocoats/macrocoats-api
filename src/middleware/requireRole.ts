import type { FastifyRequest, FastifyReply } from 'fastify'
import { AppErrors } from '../types/errors.js'
import type { UserRole } from '../types/index.js'

/**
 * PreHandler factory — rejects with 403 unless the authenticated user's role
 * is one of `allowedRoles`. Always chain after `requireAuth`.
 *
 * Use this (not `requireSuperAdmin`) on the specific routes a non-superadmin
 * role is granted — e.g. `requireRole('superadmin', 'operator')` — rather
 * than swapping `requireSuperAdmin` everywhere; most routes should stay
 * superadmin-only and untouched. See root CLAUDE.md's RBAC notes for which
 * routes 'operator' is granted and why.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.authUser || !allowedRoles.includes(request.authUser.role)) {
      return reply.code(403).send({
        error:   AppErrors.FORBIDDEN,
        message: `Access restricted to: ${allowedRoles.join(', ')}.`,
      })
    }
  }
}
