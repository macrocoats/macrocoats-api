import 'fastify'
import type { AuthUser } from './index.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `authenticate` preHandler. Null on unauthenticated routes. */
    authUser: AuthUser | null
  }
}
