import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let operatorCookies: string[]
let testBatchNumber: string

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
  adminCookies = adminLogin.headers['set-cookie']

  const operatorLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'operator', password: 'fW8mQ2vLtK9pXsA4nJ6dYcRe' })
  operatorCookies = operatorLogin.headers['set-cookie']

  // A real batch with formula/cost data, created by admin, to prove the
  // operator-facing read strips it.
  const created = await supertest(app.server)
    .post('/v1/batches')
    .set('Cookie', adminCookies)
    .send({
      productCode: 'uniklean-sp',
      companyName: 'Test Industries Ltd',
      batchSize: 100,
      formulationSnapshot: {
        components: [
          { name: 'Sodium Metasilicate (SMS)', percentage: 5.5, quantityUsed: 5.5, unit: 'Kg', materialRate: 50, costContribution: 275 },
        ],
      },
      labelSnapshot: {
        productName: 'UNIKLEAN-SP',
        manufactureDate: new Date().toISOString().slice(0, 10),
        expiryDate: new Date().toISOString().slice(0, 10),
        netWeight: '100 L',
        hazardPictograms: [],
        signalWord: 'WARNING',
      },
      costSummary: {
        rawMaterialCostPerL: 10.61, lossAdjustmentPerL: 0.5, transportCostPerL: 0.5, handlingBufferPerL: 0.3,
        productionCostPerL: 12, sellingPricePerL: 92, profitPerL: 80, profitMargin: 87,
      },
    })
    .expect(201)
  testBatchNumber = created.body.batchNumber
})

afterAll(async () => { await app.close() })

const req = () => supertest(app.server)

describe('operator role — login and identity', () => {
  it('logs in with role "operator" and null allowedProducts', async () => {
    const res = await req()
      .post('/v1/auth/login')
      .send({ username: 'operator', password: 'fW8mQ2vLtK9pXsA4nJ6dYcRe' })
      .expect(200)

    expect(res.body.user.role).toBe('operator')
    expect(res.body.user.allowedProducts).toBeNull()
  })
})

describe('operator role — granted access', () => {
  it('can list and view batches, with formulationSnapshot/costSummary stripped', async () => {
    const list = await req().get('/v1/batches').set('Cookie', operatorCookies).expect(200)
    const listed = list.body.batches.find((b: { batchNumber: string }) => b.batchNumber === testBatchNumber)
    expect(listed).toBeDefined()
    expect(listed.formulationSnapshot).toBeUndefined()
    expect(listed.costSummary).toBeUndefined()
    // Non-sensitive fields survive.
    expect(listed.labelSnapshot).toBeDefined()
    expect(listed.productCode).toBe('uniklean-sp')

    const detail = await req().get(`/v1/batches/${testBatchNumber}`).set('Cookie', operatorCookies).expect(200)
    expect(detail.body.formulationSnapshot).toBeUndefined()
    expect(detail.body.costSummary).toBeUndefined()
    expect(detail.body.labelSnapshot).toBeDefined()
  })

  it('the same batch, read by a superadmin, still includes formulationSnapshot/costSummary', async () => {
    const detail = await req().get(`/v1/batches/${testBatchNumber}`).set('Cookie', adminCookies).expect(200)
    expect(detail.body.formulationSnapshot).toBeDefined()
    expect(detail.body.costSummary).toBeDefined()
  })

  it('can view finished goods and production planning', async () => {
    await req().get('/v1/finished-goods').set('Cookie', operatorCookies).expect(200)
    await req().get('/v1/finished-goods/summary').set('Cookie', operatorCookies).expect(200)
    await req().get('/v1/production-planning/overview').set('Cookie', operatorCookies).expect(200)
  })

  it('can view and create dispatches', async () => {
    await req().get('/v1/dispatches').set('Cookie', operatorCookies).expect(200)
    await req().get('/v1/dispatches/summary').set('Cookie', operatorCookies).expect(200)
    // A full create-dispatch flow needs a real finished-goods record with
    // available stock, which is out of scope to construct deterministically
    // here — access to the route itself (not blocked at 403) is what this
    // suite verifies; business-rule validation of dispatch creation is
    // covered by hitting it with an empty/invalid body and confirming we
    // get a 400 (validation), never a 403 (authorization).
    await req().post('/v1/dispatches').set('Cookie', operatorCookies).send({}).expect(400)
  })
})

describe('operator role — denied access', () => {
  it('cannot create a batch', async () => {
    await req().post('/v1/batches').set('Cookie', operatorCookies).send({}).expect(403)
  })

  it('cannot edit or void a dispatch', async () => {
    await req().patch('/v1/dispatches/00000000-0000-0000-0000-000000000000').set('Cookie', operatorCookies).send({}).expect(403)
    await req().patch('/v1/dispatches/00000000-0000-0000-0000-000000000000/void').set('Cookie', operatorCookies).send({ reason: 'x' }).expect(403)
  })

  it('cannot backfill finished goods', async () => {
    await req().post(`/v1/finished-goods/backfill/${testBatchNumber}`).set('Cookie', operatorCookies).send({}).expect(403)
  })

  it('cannot access superadmin-only business/admin routes', async () => {
    await req().get('/v1/companies').set('Cookie', operatorCookies).expect(403)
    await req().get('/v1/vendors').set('Cookie', operatorCookies).expect(403)
    await req().get('/v1/inventory').set('Cookie', operatorCookies).expect(403)
    await req().get('/v1/cost-intelligence/overview').set('Cookie', operatorCookies).expect(403)
    await req().get('/v1/investor-dashboard/executive-kpis').set('Cookie', operatorCookies).expect(403)
    // NOTE: GET /v1/formulation-variants is NOT covered here — it's gated by
    // `readHandler = [authenticate, requireAuth]` (no role check at all, predates
    // this change) and returns full component percentages to ANY authenticated
    // user, including 'company' role. This is a pre-existing gap, not something
    // introduced by the operator role — flagged in the session notes, not fixed
    // here since tightening it affects company-role behavior too.
  })
})
