import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

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

describe('analytics access-overview', () => {
  it('requires a session', async () => {
    const res = await supertest(app.server).get('/v1/analytics/access-overview')
    expect(res.status).toBe(401)
  })

  it('rejects an unsupported window', async () => {
    const res = await supertest(app.server)
      .get('/v1/analytics/access-overview?days=14')
      .set('Cookie', adminCookies)
    expect(res.status).toBe(400)
  })

  it('returns the cube, unique IPs and last opens', async () => {
    const res = await supertest(app.server)
      .get('/v1/analytics/access-overview?days=7&docType=tds')
      .set('Cookie', adminCookies)
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.days).toBe(7)
    expect(d.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Array.isArray(d.cube)).toBe(true)
    expect(typeof d.uniqueIps).toBe('number')
    expect(Array.isArray(d.lastOpenByCompany)).toBe(true)
    for (const r of d.cube) {
      expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['tds', 'msds']).toContain(r.docType)
      expect(r.opens).toBeGreaterThan(0)
    }
  })
})

describe('analytics access-log filters', () => {
  it('accepts docType and q, and rejects an unknown docType', async () => {
    const ok = await supertest(app.server)
      .get('/v1/analytics/access-log?docType=msds&q=100%25_x&limit=5')
      .set('Cookie', adminCookies)
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ page: 1, limit: 5 })
    for (const e of ok.body.data.events) expect(e.docType).toBe('msds')

    const customer = await supertest(app.server)
      .get('/v1/analytics/access-log?customerOnly=true&limit=50')
      .set('Cookie', adminCookies)
    expect(customer.status).toBe(200)
    for (const e of customer.body.data.events) {
      expect(e.companyKey).toBeTruthy()
      expect(['tds', 'msds']).toContain(e.docType)
    }

    const bad = await supertest(app.server)
      .get('/v1/analytics/access-log?docType=formula')
      .set('Cookie', adminCookies)
    expect(bad.status).toBe(400)
  })
})
