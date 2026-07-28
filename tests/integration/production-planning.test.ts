import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let sanmarCompanyId: string
let smsInventoryId: string
let smsOriginalStockQty: number | null

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
  adminCookies = adminLogin.headers['set-cookie']

  const companies = await supertest(app.server).get('/v1/companies').set('Cookie', adminCookies)
  const sanmar = (companies.body.companies ?? companies.body).find((c: { key: string }) => c.key === 'sanmar')
  sanmarCompanyId = sanmar.id

  const inventory = await supertest(app.server).get('/v1/inventory').set('Cookie', adminCookies)
  const sms = inventory.body.items.find((i: { material: string }) => i.material === 'Sodium Metasilicate (SMS)')
  smsInventoryId = sms.id
  smsOriginalStockQty = sms.stockQty ?? null

  // Deterministic low stock so the shortfall assertion below is stable regardless
  // of whatever this dev DB's inventory currently holds.
  await supertest(app.server)
    .patch(`/v1/inventory/${smsInventoryId}`)
    .set('Cookie', adminCookies)
    .send({ stockQty: 1 })
})

afterAll(async () => {
  // Restore whatever stockQty this material had before the test touched it.
  await supertest(app.server)
    .patch(`/v1/inventory/${smsInventoryId}`)
    .set('Cookie', adminCookies)
    .send({ stockQty: smsOriginalStockQty })
  await app.close()
})

const req = () => supertest(app.server)

const todayPlusDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const createOrder = (overrides: Record<string, unknown> = {}) => ({
  customerId: sanmarCompanyId,
  customerPoNumber: `PP-TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  customerPoDate: todayPlusDays(0),
  expectedDeliveryDate: todayPlusDays(2),
  priority: 'normal',
  items: [
    { productKey: 'uniklean-sp', quantityOrdered: 100, unit: 'L', unitPrice: 92 },
  ],
  ...overrides,
})

describe('GET /v1/production-planning/overview — RBAC', () => {
  it('returns 401 with no auth', async () => {
    await req().get('/v1/production-planning/overview').expect(401)
  })
})

describe('GET /v1/production-planning/overview — base-formula item (no variant)', () => {
  it('surfaces an open item and its required materials, with a shortfall flagged for low-stock material', async () => {
    // This dev DB accumulates open orders across test runs, and the materials
    // total legitimately sums across ALL open items in the window — not just
    // this test's own order. Measure the delta this order contributes rather
    // than asserting an absolute total, so the test is robust to whatever
    // else is currently open.
    const before = await req().get('/v1/production-planning/overview').query({ days: 7 }).set('Cookie', adminCookies).expect(200)
    const smsBefore = before.body.data.materials.find((m: { materialName: string }) => m.materialName === 'Sodium Metasilicate (SMS)')
    const requiredBefore = smsBefore?.requiredQty ?? 0
    // 'Water' may already legitimately appear (some other open order's formula
    // may list it at a real, non-null percentage) — capture the baseline so we
    // can prove THIS order's null-percentage balance row contributes nothing,
    // without asserting the global absence of a materialName any other order
    // could validly own.
    const waterBefore = before.body.data.materials.find((m: { materialName: string }) => m.materialName === 'Water')?.requiredQty ?? 0

    const created = await req()
      .post('/v1/customer-purchase-orders')
      .set('Cookie', adminCookies)
      .send(createOrder())
      .expect(201)

    const res = await req()
      .get('/v1/production-planning/overview')
      .query({ days: 7 })
      .set('Cookie', adminCookies)
      .expect(200)

    const item = res.body.data.items.find((i: { orderId: string }) => i.orderId === created.body.data.id)
    expect(item).toBeDefined()
    expect(item.remainingQty).toBe(100)
    expect(item.materialsResolved).toBe(true)
    expect(item.unscheduled).toBe(false)

    // uniklean-sp's base formula has Sodium Metasilicate (SMS) at 5.5% — 5.5% of 100L = 5.5 Kg required.
    const sms = res.body.data.materials.find((m: { materialName: string }) => m.materialName === 'Sodium Metasilicate (SMS)')
    expect(sms).toBeDefined()
    expect(sms.requiredQty - requiredBefore).toBeCloseTo(5.5, 1)
    expect(sms.currentStock).toBe(1)
    expect(sms.sufficient).toBe(false)   // stock is 1, and required (from this order alone, let alone anything else open) already exceeds that

    // This order's water/balance row (percentWV: null) must contribute nothing —
    // whatever 'Water' totalled before this order exists is unchanged after.
    const waterAfter = res.body.data.materials.find((m: { materialName: string }) => m.materialName === 'Water')?.requiredQty ?? 0
    expect(waterAfter).toBeCloseTo(waterBefore, 3)
  })

  it('excludes an item due outside the requested window', async () => {
    const created = await req()
      .post('/v1/customer-purchase-orders')
      .set('Cookie', adminCookies)
      .send(createOrder({ expectedDeliveryDate: todayPlusDays(60) }))
      .expect(201)

    const narrow = await req().get('/v1/production-planning/overview').query({ days: 7 }).set('Cookie', adminCookies).expect(200)
    expect(narrow.body.data.items.some((i: { orderId: string }) => i.orderId === created.body.data.id)).toBe(false)

    const wide = await req().get('/v1/production-planning/overview').query({ days: 90 }).set('Cookie', adminCookies).expect(200)
    expect(wide.body.data.items.some((i: { orderId: string }) => i.orderId === created.body.data.id)).toBe(true)
  })

  it('surfaces an item with no expectedDeliveryDate as unscheduled, regardless of window', async () => {
    const created = await req()
      .post('/v1/customer-purchase-orders')
      .set('Cookie', adminCookies)
      .send(createOrder({ expectedDeliveryDate: null }))
      .expect(201)

    const res = await req().get('/v1/production-planning/overview').query({ days: 1 }).set('Cookie', adminCookies).expect(200)
    const item = res.body.data.items.find((i: { orderId: string }) => i.orderId === created.body.data.id)
    expect(item).toBeDefined()
    expect(item.unscheduled).toBe(true)
  })
})

describe('GET /v1/production-planning/overview — variant-based item', () => {
  it('resolves required materials from formulation_variant_components, not the base formula', async () => {
    // Unique-per-run material name — this dev DB accumulates orders across test
    // runs (see the delta-measurement comment on the base-formula test above),
    // so a fixed literal name would double-count against a previous run's
    // still-open order. A name only this run could have produced sidesteps that.
    const materialName = `Test-Only Alkali Salt ${Date.now()}`
    const variant = await req()
      .post('/v1/formulation-variants')
      .set('Cookie', adminCookies)
      .send({
        productKey: 'uniklean-sp',
        companyId: null,
        variantName: `PP Test Variant ${Date.now()}`,
        isDefault: false,
        components: [
          { materialName, percentage: 10, unit: 'Kg', sortOrder: 0 },
          { materialName: 'Water', percentage: null, unit: 'L', sortOrder: 1 },
        ],
      })
      .expect(201)

    const created = await req()
      .post('/v1/customer-purchase-orders')
      .set('Cookie', adminCookies)
      .send(createOrder({
        items: [{ productKey: 'uniklean-sp', variantId: variant.body.data.id, quantityOrdered: 50, unit: 'L', unitPrice: 92 }],
      }))
      .expect(201)

    const res = await req().get('/v1/production-planning/overview').query({ days: 7 }).set('Cookie', adminCookies).expect(200)
    const item = res.body.data.items.find((i: { orderId: string }) => i.orderId === created.body.data.id)
    expect(item.variantId).toBe(variant.body.data.id)

    const testMaterial = res.body.data.materials.find((m: { materialName: string }) => m.materialName === materialName)
    expect(testMaterial).toBeDefined()
    expect(testMaterial.requiredQty).toBeCloseTo(5, 1)   // 10% of 50L
  })
})
