import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

// Read endpoints added for the Operations Center v2 views.
let app: FastifyInstance
let adminCookies: string[]

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const login = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = login.headers['set-cookie']
})

afterAll(async () => {
  await app.close()
})

describe('GET /finished-goods/by-product', () => {
  it('requires a session', async () => {
    const res = await supertest(app.server).get('/v1/finished-goods/by-product')
    expect(res.status).toBe(401)
  })

  it('returns per-product stock with cover', async () => {
    const res = await supertest(app.server).get('/v1/finished-goods/by-product').set('Cookie', adminCookies)
    expect(res.status).toBe(200)
    expect(res.body.data.windowWeeks).toBe(8)
    for (const p of res.body.data.products) {
      expect(typeof p.productCode).toBe('string')
      expect(p.available).toBeCloseTo(p.inStock - p.reserved, 3)
      if (p.avgWeeklyDispatch > 0) expect(p.coverWeeks).toBeCloseTo(p.available / p.avgWeeklyDispatch, 3)
      else expect(p.coverWeeks).toBeNull()
    }
  })
})

describe('GET /quotations?open=true', () => {
  it('returns only recent quotations, oldest first', async () => {
    const res = await supertest(app.server).get('/v1/quotations?open=true&limit=50').set('Cookie', adminCookies)
    expect(res.status).toBe(200)
    const dates: string[] = res.body.data.quotations.map((q: { quotDate: string }) => q.quotDate)
    const cutoff = new Date(Date.now() - 91 * 864e5).toISOString().slice(0, 10)
    for (const d of dates) expect(d >= cutoff).toBe(true)
    expect([...dates].sort()).toEqual(dates)
  })
})

describe('GET /inventory/low-stock', () => {
  it('lists the products that use each flagged material', async () => {
    const res = await supertest(app.server).get('/v1/inventory/low-stock').set('Cookie', adminCookies)
    expect(res.status).toBe(200)
    for (const item of res.body.data.items) expect(Array.isArray(item.usedIn)).toBe(true)
  })
})
