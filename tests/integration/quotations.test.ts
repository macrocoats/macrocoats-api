import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

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
})

afterAll(async () => { await app.close() })

const req = () => supertest(app.server)

const baseQuotation = (customerName: string) => ({
  customerName,
  quotDate:  '2026-07-28',
  validDays: 30,
  lineItems: [
    { catalogId: 13, description: 'Degreasing SP', code: 'UNIKLEAN SP', qty: 200, rate: 92 },
  ],
})

describe('POST /v1/quotations — companyId reconciliation', () => {
  it('sets companyId + matchedCompanyName when customerName matches a real company (case-insensitive)', async () => {
    const res = await req()
      .post('/v1/quotations')
      .set('Cookie', adminCookies)
      .send(baseQuotation('rane industries ltd'))
      .expect(201)

    expect(res.body.data.customerName).toBe('rane industries ltd')
    expect(res.body.data.companyId).toBeTruthy()
    expect(res.body.data.matchedCompanyName).toBe('Rane Industries Ltd')
  })

  it('leaves companyId/matchedCompanyName null when no company matches', async () => {
    const res = await req()
      .post('/v1/quotations')
      .set('Cookie', adminCookies)
      .send(baseQuotation('Totally Unmatched Prospect Pvt Ltd'))
      .expect(201)

    expect(res.body.data.companyId).toBeNull()
    expect(res.body.data.matchedCompanyName).toBeNull()
  })

  it('returns 403 for a company-role user', async () => {
    await req()
      .post('/v1/quotations')
      .set('Cookie', raneCookies)
      .send(baseQuotation('Rane Industries Ltd'))
      .expect(403)
  })

  it('returns 401 with no auth', async () => {
    await req().post('/v1/quotations').send(baseQuotation('Rane Industries Ltd')).expect(401)
  })
})

describe('GET /v1/quotations — companyId surfaced on reads', () => {
  it('list and get-by-id both include companyId/matchedCompanyName without erroring', async () => {
    const created = await req()
      .post('/v1/quotations')
      .set('Cookie', adminCookies)
      .send(baseQuotation('Rane Industries Ltd'))
      .expect(201)

    const listRes = await req()
      .get('/v1/quotations')
      .set('Cookie', adminCookies)
      .expect(200)

    const listed = listRes.body.data.quotations.find((q: { id: string }) => q.id === created.body.data.id)
    expect(listed).toBeDefined()
    expect(listed.companyId).toBe(created.body.data.companyId)
    expect(listed.matchedCompanyName).toBe('Rane Industries Ltd')

    const getRes = await req()
      .get(`/v1/quotations/${created.body.data.id}`)
      .set('Cookie', adminCookies)
      .expect(200)

    expect(getRes.body.data.companyId).toBe(created.body.data.companyId)
    expect(getRes.body.data.matchedCompanyName).toBe('Rane Industries Ltd')
  })
})
