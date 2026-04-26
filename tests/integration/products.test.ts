import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]
let galvaCookies: string[]

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
  adminCookies = adminLogin.headers['set-cookie']

  const raneLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'rane', password: 'r7Kx9mNpQ2wLvYtA8bZeJ3dF' })
  raneCookies = raneLogin.headers['set-cookie']

  const galvaLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'galva', password: 'gL3mQ9xNvKpR7wYtA2bZeJ8F' })
  galvaCookies = galvaLogin.headers['set-cookie']
})

afterAll(async () => { await app.close() })

const req = () => supertest(app.server)

// ── GET /v1/products/:productLine/:docType ─────────────────────────────────────
describe('GET /v1/products/:productLine/:docType', () => {
  it('superadmin can fetch any TDS', async () => {
    const res = await req()
      .get('/v1/products/uniklean-sp/tds')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('TDS-USP-001')
    expect(res.body.sections).toBeDefined()
  })

  it('superadmin can fetch restricted formula doc', async () => {
    const res = await req()
      .get('/v1/products/uniklean-fe/formula')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('FRM-UFE-001')
    expect(res.body.classification).toContain('CONFIDENTIAL')
  })

  it('company user can fetch allowed product TDS', async () => {
    const res = await req()
      .get('/v1/products/uniklean-sp/tds')
      .set('Cookie', raneCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('TDS-USP-001')
  })

  it('company user cannot fetch formula (restricted doc type)', async () => {
    await req()
      .get('/v1/products/uniklean-sp/formula')
      .set('Cookie', raneCookies)
      .expect(403)
  })

  it('company user cannot fetch a product they are not assigned to', async () => {
    // galva is only assigned unicool-al
    await req()
      .get('/v1/products/uniklean-sp/tds')
      .set('Cookie', galvaCookies)
      .expect(403)
  })

  it('galva can access their assigned product', async () => {
    const res = await req()
      .get('/v1/products/unicool-al/tds')
      .set('Cookie', galvaCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('TDS-UCL-001')
  })

  it('returns 401 with no auth', async () => {
    await req().get('/v1/products/uniklean-sp/tds').expect(401)
  })

  it('returns 404 for unknown product', async () => {
    await req()
      .get('/v1/products/nonexistent/tds')
      .set('Cookie', adminCookies)
      .expect(400)  // invalid productLine enum fails Zod validation
  })
})

// ── GET /v1/products (list) ───────────────────────────────────────────────────
describe('GET /v1/products', () => {
  it('superadmin can list all products', async () => {
    const res = await req()
      .get('/v1/products')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.products)).toBe(true)
    expect(res.body.products.length).toBeGreaterThanOrEqual(5)
  })

  it('company user cannot list products', async () => {
    await req()
      .get('/v1/products')
      .set('Cookie', raneCookies)
      .expect(403)
  })
})
