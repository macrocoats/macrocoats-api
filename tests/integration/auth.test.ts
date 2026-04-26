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
})
