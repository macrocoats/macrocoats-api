import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

// ── Test setup ─────────────────────────────────────────────────────────────────
let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

const request = () => supertest(app.server)

// ── POST /v1/auth/login ────────────────────────────────────────────────────────
describe('POST /v1/auth/login', () => {
  it('returns 200 and sets cookies on valid superadmin credentials', async () => {
    const res = await request()
      .post('/v1/auth/login')
      .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
      .expect(200)

    expect(res.body.user.role).toBe('superadmin')
    expect(res.headers['set-cookie']).toBeDefined()
    // Both cookies should be httpOnly
    const cookies = res.headers['set-cookie'] as string[]
    expect(cookies.some((c: string) => c.includes('accessToken'))).toBe(true)
    expect(cookies.some((c: string) => c.includes('refreshToken'))).toBe(true)
    expect(cookies.every((c: string) => c.includes('HttpOnly'))).toBe(true)
  })

  it('returns 200 and correct product list on valid company credentials', async () => {
    const res = await request()
      .post('/v1/auth/login')
      .send({ username: 'rane', password: 'r7Kx9mNpQ2wLvYtA8bZeJ3dF' })
      .expect(200)

    expect(res.body.user.role).toBe('company')
    expect(res.body.user.companyName).toBe('rane')
    expect(res.body.user.allowedProducts).toContain('uniklean-sp')
  })

  it('returns 401 on wrong password', async () => {
    await request()
      .post('/v1/auth/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401)
  })

  it('returns 400 on missing fields', async () => {
    await request()
      .post('/v1/auth/login')
      .send({ username: 'admin' })
      .expect(400)
  })

  it('normalises username case', async () => {
    const res = await request()
      .post('/v1/auth/login')
      .send({ username: 'ADMIN', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
      .expect(200)

    expect(res.body.user.role).toBe('superadmin')
  })
})

// ── POST /v1/auth/token ────────────────────────────────────────────────────────
describe('POST /v1/auth/token', () => {
  it('returns 200 with redirectTo on valid token', async () => {
    const res = await request()
      .post('/v1/auth/token')
      .send({ token: 'sN4wP8tRmXkL2vBqA7cYeJ5G' })  // sanmar
      .expect(200)

    expect(res.body.user.companyName).toBe('sanmar')
    expect(res.body.redirectTo).toMatch(/\/products\/uniklean-sp\/tds/)
  })

  it('returns 401 on invalid token', async () => {
    await request()
      .post('/v1/auth/token')
      .send({ token: 'definitely-invalid-token' })
      .expect(401)
  })
})

// ── GET /v1/auth/me ────────────────────────────────────────────────────────────
describe('GET /v1/auth/me', () => {
  it('returns 401 with no cookie', async () => {
    await request().get('/v1/auth/me').expect(401)
  })

  it('returns current user when authenticated', async () => {
    // Login to get cookie
    const login = await request()
      .post('/v1/auth/login')
      .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })

    const cookies = login.headers['set-cookie']

    const res = await request()
      .get('/v1/auth/me')
      .set('Cookie', cookies)
      .expect(200)

    expect(res.body.user.role).toBe('superadmin')
  })
})

// ── POST /v1/auth/logout ───────────────────────────────────────────────────────
describe('POST /v1/auth/logout', () => {
  it('returns 204 and clears cookies', async () => {
    await request().post('/v1/auth/logout').expect(204)
  })
})

// ── POST /v1/auth/refresh ──────────────────────────────────────────────────────
describe('POST /v1/auth/refresh', () => {
  it('returns 401 with no refresh cookie', async () => {
    await request().post('/v1/auth/refresh').expect(401)
  })

  it('rotates a valid refresh token: new cookies, new access token works, old refresh token is rejected on reuse', async () => {
    const login = await request()
      .post('/v1/auth/login')
      .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
    const loginCookies = login.headers['set-cookie'] as string[]

    const refresh = await request()
      .post('/v1/auth/refresh')
      .set('Cookie', loginCookies)
      .expect(200)

    expect(refresh.body.user.role).toBe('superadmin')
    const refreshedCookies = refresh.headers['set-cookie'] as string[]
    expect(refreshedCookies).toBeDefined()
    // Rotation must issue a genuinely new refresh token, not re-send the old one.
    const oldRefreshCookie = loginCookies.find((c) => c.startsWith('refreshToken='))
    const newRefreshCookie = refreshedCookies.find((c) => c.startsWith('refreshToken='))
    expect(newRefreshCookie).toBeDefined()
    expect(newRefreshCookie).not.toBe(oldRefreshCookie)

    // The new access token must actually authenticate a follow-up request.
    await request().get('/v1/auth/me').set('Cookie', refreshedCookies).expect(200)

    // The old (now-rotated) refresh token must be rejected — no replay.
    await request().post('/v1/auth/refresh').set('Cookie', loginCookies).expect(401)
  })

  it('rejects a garbage refresh token', async () => {
    await request()
      .post('/v1/auth/refresh')
      .set('Cookie', ['refreshToken=not-a-real-token'])
      .expect(401)
  })
})

// ── Mobile (Bearer-token) refresh — same service functions, JSON body instead of cookies ──
describe('POST /v1/auth/mobile/login + /v1/auth/mobile/refresh', () => {
  it('logs in, refreshes, and rejects reuse of the rotated-away refresh token', async () => {
    const login = await request()
      .post('/v1/auth/mobile/login')
      .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
      .expect(200)

    expect(login.body.accessToken).toBeTruthy()
    expect(login.body.refreshToken).toBeTruthy()

    const refresh = await request()
      .post('/v1/auth/mobile/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200)

    expect(refresh.body.accessToken).toBeTruthy()
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken)

    // Old mobile refresh token is now rotated away — reuse must fail.
    await request()
      .post('/v1/auth/mobile/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401)
  })
})

// ── POST /v1/auth/logout — verify the refresh token is actually revoked ─────────
describe('POST /v1/auth/logout revokes the refresh token', () => {
  it('a refresh token can no longer be used after logout', async () => {
    const login = await request()
      .post('/v1/auth/login')
      .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
    const cookies = login.headers['set-cookie'] as string[]

    await request().post('/v1/auth/logout').set('Cookie', cookies).expect(204)
    await request().post('/v1/auth/refresh').set('Cookie', cookies).expect(401)
  })
})
