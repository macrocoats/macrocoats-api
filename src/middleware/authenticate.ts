import type { FastifyRequest, FastifyReply } from 'fastify'
import { tryVerifyAccessToken } from '../utils/jwt.js'
import type { AuthUser } from '../types/index.js'
import { AppErrors } from '../types/errors.js'

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}

/**
 * Reads the `accessToken` httpOnly cookie and, if valid, sets `request.authUser`.
 * Falls back to an `Authorization: Bearer <token>` header when no cookie is present
 * (native/mobile clients have no cookie jar to share with a browser).
 * Does NOT reject the request on missing token — call `requireAuth` for that.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  request.authUser = null
  const token = request.cookies?.accessToken ?? bearerToken(request)
  if (!token) return

  const payload = tryVerifyAccessToken(token)
  if (!payload) return

  const user: AuthUser = {
    id:              payload.sub,
    name:            payload.name,
    role:            payload.role,
    companyName:     payload.companyName,
    allowedProducts: payload.allowedProducts,
  }
  request.authUser = user
}

/**
 * Hard gate — rejects with 401 if `authenticate` did not set a user.
 * Use this as a preHandler on protected route groups.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser) {
    return reply.code(401).send({ error: AppErrors.NOT_AUTHENTICATED })
  }
}
