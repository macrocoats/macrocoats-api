import type { FastifyInstance } from 'fastify'
import fastifyCookie from '@fastify/cookie'
import { env } from '../config/env.js'

export async function registerCookies(app: FastifyInstance) {
  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    hook:   'onRequest',
  })
}

/** Options for the short-lived access token cookie */
export const accessCookieOptions = {
  httpOnly:  true,
  secure:    env.COOKIE_SECURE,
  sameSite:  'strict' as const,
  domain:    env.COOKIE_DOMAIN,
  path:      '/',
  maxAge:    15 * 60,   // 15 minutes in seconds
}

/** Options for the long-lived refresh token cookie */
export const refreshCookieOptions = {
  httpOnly:  true,
  secure:    env.COOKIE_SECURE,
  sameSite:  'strict' as const,
  domain:    env.COOKIE_DOMAIN,
  path:      '/v1/auth',  // scoped — only sent to auth endpoints
  maxAge:    7 * 24 * 60 * 60,   // 7 days
}
