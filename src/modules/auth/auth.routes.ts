import type { FastifyInstance } from 'fastify'
import { loginSchema, tokenSchema, mobileRefreshSchema, changePasswordSchema } from './auth.schema.js'
import {
  loginWithCredentials,
  loginWithToken,
  rotateRefreshToken,
  revokeRefreshToken,
  getMeById,
  changePassword,
} from './auth.service.js'
import { accessCookieOptions, refreshCookieOptions } from '../../plugins/cookie.js'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { AppErrors } from '../../types/errors.js'

// Per-IP limits on credential and token endpoints. Kept loose enough that staff
// sharing one office NAT IP don't lock each other out, tight enough to stop brute force.
const CREDENTIAL_RATE_LIMIT = { max: 20, timeWindow: '5 minutes' }
const REFRESH_RATE_LIMIT    = { max: 60, timeWindow: '1 minute' }

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/login ─────────────────────────────────────────────────────
  app.post('/login', { config: { rateLimit: CREDENTIAL_RATE_LIMIT } }, async (request, reply) => {
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
  app.post('/token', { config: { rateLimit: CREDENTIAL_RATE_LIMIT } }, async (request, reply) => {
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
  app.post('/refresh', { config: { rateLimit: REFRESH_RATE_LIMIT } }, async (request, reply) => {
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

    // Clear with the same domain/path/flags they were set with, or the browser keeps them
    const { maxAge: _a, ...clearAccess }  = accessCookieOptions
    const { maxAge: _r, ...clearRefresh } = refreshCookieOptions
    reply
      .clearCookie('accessToken', clearAccess)
      .clearCookie('refreshToken', clearRefresh)
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

  // ── POST /auth/change-password ───────────────────────────────────────────
  // Re-verifies the current password; on success every refresh token for the
  // user is revoked (other sessions must log in again) and this session gets a
  // fresh pair — as cookies for the browser, in the body for Bearer clients.
  // A wrong current password is 400, not 401: the web client treats 401 as an
  // expired session and would refresh and retry.
  app.post(
    '/change-password',
    { preHandler: [authenticate, requireAuth], config: { rateLimit: CREDENTIAL_RATE_LIMIT } },
    async (request, reply) => {
      const body = changePasswordSchema.safeParse(request.body)
      if (!body.success) {
        return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten(), details: body.error.flatten() })
      }

      const result = await changePassword(request.authUser!.id, body.data.currentPassword, body.data.newPassword)
      if (!result) {
        return reply.code(400).send({ error: AppErrors.INVALID_CREDENTIALS })
      }

      if (request.cookies?.accessToken) {
        reply
          .setCookie('accessToken', result.accessToken, accessCookieOptions)
          .setCookie('refreshToken', result.refreshToken, refreshCookieOptions)
        return reply.send({ data: { changed: true } })
      }
      return reply.send({ data: { changed: true, accessToken: result.accessToken, refreshToken: result.refreshToken } })
    },
  )

  // ── Mobile (Bearer-token) auth ───────────────────────────────────────────
  // Native clients have no cookie jar to share with a browser, so these routes
  // return the raw tokens in the JSON body instead of setting cookies. The web
  // routes above are untouched — cookie-based auth remains the browser contract.

  // ── POST /auth/mobile/login ──────────────────────────────────────────────
  app.post('/mobile/login', { config: { rateLimit: CREDENTIAL_RATE_LIMIT } }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await loginWithCredentials(body.data.username, body.data.password)
    if (!result) {
      return reply.code(401).send({ error: AppErrors.INVALID_CREDENTIALS })
    }

    return reply.send({
      user: result.authUser,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    })
  })

  // ── POST /auth/mobile/refresh ─────────────────────────────────────────────
  app.post('/mobile/refresh', { config: { rateLimit: REFRESH_RATE_LIMIT } }, async (request, reply) => {
    const body = mobileRefreshSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await rotateRefreshToken(body.data.refreshToken)
    if (!result) {
      return reply.code(401).send({ error: AppErrors.REFRESH_TOKEN_INVALID })
    }

    return reply.send({
      user: result.authUser,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    })
  })

  // ── POST /auth/mobile/logout ──────────────────────────────────────────────
  app.post('/mobile/logout', async (request, reply) => {
    const body = mobileRefreshSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    await revokeRefreshToken(body.data.refreshToken)
    return reply.code(204).send()
  })
}
