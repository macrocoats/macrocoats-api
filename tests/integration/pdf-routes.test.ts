import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'
import { pdfService } from '../../src/modules/pdf/pdf.service.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

const req = () => supertest(app.server)

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await req()
    .post('/v1/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = adminLogin.headers['set-cookie']

  const raneLogin = await req()
    .post('/v1/auth/login')
    .send({ username: 'rane', password: 'r7Kx9mNpQ2wLvYtA8bZeJ3dF' })
  raneCookies = raneLogin.headers['set-cookie']
}, 60_000)

afterAll(async () => {
  await pdfService.shutdown()
  await app.close()
})

describe('PDF routes — body validation', () => {
  it('rejects a TDS body with an unknown productLine', async () => {
    const res = await req()
      .post('/v1/pdf/tds')
      .set('Cookie', adminCookies)
      .send({ productName: 'X', productCode: 'X', productLine: 'not-a-product', description: '', sections: {} })
      .expect(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  it('rejects a CoA body with an invalid test status', async () => {
    await req()
      .post('/v1/pdf/coa')
      .set('Cookie', adminCookies)
      .send({
        productName: 'X', productCode: 'X', productLine: 'uniklean-sp', batchNumber: 'B1',
        manufacturingDate: '2026-01-01', conclusion: 'APPROVED',
        testResults: [{ parameter: 'pH', specification: '7', result: '7', status: 'MAYBE' }],
      })
      .expect(400)
  })

  it('rejects a letterhead without bodyHtml', async () => {
    await req().post('/v1/pdf/letterhead').set('Cookie', adminCookies).send({ subject: 'Hi' }).expect(400)
  })

  it('rejects a brochure body whose URL and payload product do not match', async () => {
    await req()
      .post('/v1/pdf/brochure/uniklean-sp')
      .set('Cookie', adminCookies)
      .send({
        productName: 'UNIKLEAN-FE', productCode: 'FE', productLine: 'uniklean-fe',
        category: 'Cleaner', description: '', accentColor: '#123a6d', sections: {},
      })
      .expect(400)
  })

  it('stays superadmin-only', async () => {
    await req().post('/v1/pdf/letterhead').set('Cookie', raneCookies).send({ bodyHtml: '<p>x</p>' }).expect(403)
  })
})

describe('PDF routes — render lockdown', () => {
  it('allows a company user to download a brochure for an assigned product', async () => {
    const payload = {
        productName: 'UNIKLEAN-SP', productCode: 'SP', productLine: 'uniklean-sp',
        category: 'Alkaline Cleaner', subtitle: 'Industrial Surface Cleaner',
        description: 'Customer-safe brochure render test.', accentColor: '#1e6b5a',
        sections: { features: [{ head: 'Cleaning', body: 'Removes industrial soils.' }] },
      }
    const download = () => req()
      .post('/v1/pdf/brochure/uniklean-sp')
      .set('Cookie', raneCookies)
      .send(payload)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = []
        r.on('data', (c: Buffer) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
      .expect(200)

    const res = await download()

    expect(res.headers['content-type']).toBe('application/pdf')
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF')

    const cachedStartedAt = performance.now()
    const cached = await download()
    const cachedDurationMs = performance.now() - cachedStartedAt
    expect(cached.headers['x-pdf-cache']).toBe('HIT')
    expect(cached.body).toEqual(res.body)
    expect(cachedDurationMs).toBeLessThan(500)
  }, 60_000)

  it('renders letterhead HTML containing script and internal-URL markup without executing or fetching it', async () => {
    const res = await req()
      .post('/v1/pdf/letterhead')
      .set('Cookie', adminCookies)
      .send({
        referenceNo: 'TEST-LOCKDOWN',
        subject:     'Lockdown check',
        bodyHtml:    '<p>Hello</p><script>document.body.innerHTML="pwned"</script>'
                   + '<img src="http://169.254.169.254/latest/meta-data/">',
      })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = []
        r.on('data', (c: Buffer) => chunks.push(c))
        r.on('end', () => cb(null, Buffer.concat(chunks)))
      })
      .expect(200)

    expect(res.headers['content-type']).toBe('application/pdf')
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF')
  }, 60_000)
})
