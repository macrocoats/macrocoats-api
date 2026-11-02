import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { isZohoConfigured } from '../../src/modules/zoho-invoice/zoho-invoice.service.js'
import { ADMIN_PASSWORD, OPERATOR_PASSWORD } from '../helpers/credentials.js'

let app: FastifyInstance
let adminCookies: string[]
let operatorCookies: string[]

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = adminLogin.headers['set-cookie']

  const operatorLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'operator', password: OPERATOR_PASSWORD })
  operatorCookies = operatorLogin.headers['set-cookie']
})

afterAll(async () => {
  await app.close()
})

describe('GET /zoho-invoices/:invoiceId/pdf', () => {
  it('requires a session', async () => {
    const res = await supertest(app.server).get('/v1/zoho-invoices/123/pdf')
    expect(res.status).toBe(401)
  })

  it('is superadmin only', async () => {
    const res = await supertest(app.server).get('/v1/zoho-invoices/123/pdf').set('Cookie', operatorCookies)
    expect(res.status).toBe(403)
  })

  it('rejects an id that is not numeric', async () => {
    const res = await supertest(app.server).get('/v1/zoho-invoices/12a..b/pdf').set('Cookie', adminCookies)
    expect(res.status).toBe(400)
  })

  it('keeps the stored-status route working beside it', async () => {
    const res = await supertest(app.server)
      .get('/v1/zoho-invoices/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies)
    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  // Read-only calls to the real Zoho account; skipped where it isn't connected.
  it.runIf(isZohoConfigured())('returns 404 for an invoice Zoho does not have', async () => {
    const res = await supertest(app.server).get('/v1/zoho-invoices/1/pdf').set('Cookie', adminCookies)
    expect(res.status).toBe(404)
  })

  it.runIf(isZohoConfigured())('downloads a real invoice as a PDF', async () => {
    const list = await supertest(app.server).get('/v1/zoho-invoices?perPage=1').set('Cookie', adminCookies)
    expect(list.status).toBe(200)
    const invoiceId = list.body.data.invoices[0]?.invoiceId
    if (!invoiceId) return

    const res = await supertest(app.server)
      .get(`/v1/zoho-invoices/${invoiceId}/pdf`)
      .set('Cookie', adminCookies)
      .responseType('blob')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toBe(`attachment; filename="invoice-${invoiceId}.pdf"`)
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF')
  })
})
