import type { FastifyInstance } from 'fastify'
import { loginSchema, tokenSchema } from './auth.schema.js'
import {
  loginWithCredentials,
  loginWithToken,
  rotateRefreshToken,
  revokeRefreshToken,
  getMeById,
} from './auth.service.js'
import { accessCookieOptions, refreshCookieOptions } from '../../plugins/cookie.js'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { AppErrors } from '../../types/errors.js'

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/login ─────────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await loginWithCredentials(body.data.username, body.data.password)
    if (!result) {
      return reply.code(401).send({ error: AppErrors.INVALID_CREDENTIALS })
    }

    reply
      .setCookie('accessToken', result.accessToken, accessCookieOptions)
      .setCookie('refreshToken', result.refreshToken, refreshCookieOptions)
      .send({ user: result.authUser })
  })

  // ── POST /auth/token (magic-link / QR access) ────────────────────────────
  app.post('/token', async (request, reply) => {
    const body = tokenSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await loginWithToken(body.data.token)
    if (!result) {
      return reply.code(401).send({ error: AppErrors.TOKEN_INVALID })
    }

    reply
      .setCookie('accessToken', result.accessToken, accessCookieOptions)
      .setCookie('refreshToken', result.refreshToken, refreshCookieOptions)
      .send({ user: result.authUser, redirectTo: result.redirectTo })
  })

  // ── POST /auth/refresh ───────────────────────────────────────────────────
  app.post('/refresh', async (request, reply) => {
    const rawRefresh = request.cookies?.refreshToken
    if (!rawRefresh) {
      return reply.code(401).send({ error: AppErrors.NO_REFRESH_TOKEN })
    }

    const result = await rotateRefreshToken(rawRefresh)
    if (!result) {
      return reply.code(401).send({ error: AppErrors.REFRESH_TOKEN_INVALID })
    }

    reply
      .setCookie('accessToken', result.accessToken, accessCookieOptions)
      .setCookie('refreshToken', result.refreshToken, refreshCookieOptions)
      .send({ user: result.authUser })
  })

  // ── POST /auth/logout ────────────────────────────────────────────────────
  app.post('/logout', async (request, reply) => {
    const rawRefresh = request.cookies?.refreshToken
    if (rawRefresh) {
      await revokeRefreshToken(rawRefresh)
    }

    reply
      .clearCookie('accessToken', { path: '/' })
      .clearCookie('refreshToken', { path: '/v1/auth' })
      .code(204)
      .send()
  })

  // ── GET /auth/me ─────────────────────────────────────────────────────────
  app.get(
    '/me',
    { preHandler: [authenticate, requireAuth] },
    async (request, reply) => {
      const user = await getMeById(request.authUser!.id)
      if (!user) {
        return reply.code(401).send({ error: AppErrors.NOT_AUTHENTICATED })
      }
      return reply.send({ user })
    },
  )
}
