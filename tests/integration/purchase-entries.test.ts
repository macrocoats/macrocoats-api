import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

let vendorId: string
let pricedItemId: string   // has an active vendor price
let unpricedItemId: string // no vendor price, ever

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

  const vendorRes = await supertest(app.server)
    .post('/v1/vendors')
    .set('Cookie', adminCookies)
    .send({ vendorName: `Test Vendor PE ${Date.now()}`, gstNumber: '33AAAAA0000A1Z5' })
  vendorId = vendorRes.body.vendor.id

  const pricedItemRes = await supertest(app.server)
    .post('/v1/inventory')
    .set('Cookie', adminCookies)
    .send({ material: `Test Material PE Priced ${Date.now()}`, unit: 'Kg', price: 42 })
  pricedItemId = pricedItemRes.body.id

  const unpricedItemRes = await supertest(app.server)
    .post('/v1/inventory')
    .set('Cookie', adminCookies)
    .send({ material: `Test Material PE Unpriced ${Date.now()}`, unit: 'Kg', price: 42 })
  unpricedItemId = unpricedItemRes.body.id

  await supertest(app.server)
    .post(`/v1/vendors/${vendorId}/prices`)
    .set('Cookie', adminCookies)
    .send({ inventoryItemId: pricedItemId, effectiveFrom: '2024-01-01', unitPrice: 50, unit: 'Kg' })
    .expect(201)
})

afterAll(async () => {
  await app.close()
})

const req = () => supertest(app.server)

async function getStockQty(id: string): Promise<number> {
  const res = await req().get('/v1/inventory').set('Cookie', adminCookies).expect(200)
  const item = res.body.items.find((i: { id: string }) => i.id === id)
  return item.stockQty ?? 0
}

describe('POST /v1/purchase-entries', () => {
  it('auto-suggests price from vendor price history when unitPrice is omitted', async () => {
    const before = await getStockQty(pricedItemId)

    const res = await req()
      .post('/v1/purchase-entries')
      .set('Cookie', adminCookies)
      .send({
        vendorId,
        inventoryItemId: pricedItemId,
        purchaseDate: '2024-02-01',
        quantity: 10,
        unit: 'Kg',
      })
      .expect(201)

    expect(res.body.data.priceSource).toBe('vendor_price_history')
    expect(res.body.data.unitPrice).toBe(50)
    expect(res.body.data.suggestedUnitPrice).toBe(50)
    expect(res.body.data.totalAmount).toBe(500)

    const after = await getStockQty(pricedItemId)
    expect(after).toBe(before + 10)
  })

  it('uses an explicit unitPrice as a manual override, keeping the suggested price for audit', async () => {
    const before = await getStockQty(pricedItemId)

    const res = await req()
      .post('/v1/purchase-entries')
      .set('Cookie', adminCookies)
      .send({
        vendorId,
        inventoryItemId: pricedItemId,
        purchaseDate: '2024-02-15',
        quantity: 5,
        unit: 'Kg',
        unitPrice: 999,
      })
      .expect(201)

    expect(res.body.data.priceSource).toBe('manual')
    expect(res.body.data.unitPrice).toBe(999)
    expect(res.body.data.suggestedUnitPrice).toBe(50)
    expect(res.body.data.vendorPriceId).toBeTruthy()

    const after = await getStockQty(pricedItemId)
    expect(after).toBe(before + 5)
  })

  it('400 PRICE_NOT_AVAILABLE when no vendor price exists and no override is given', async () => {
    const res = await req()
      .post('/v1/purchase-entries')
      .set('Cookie', adminCookies)
      .send({
        vendorId,
        inventoryItemId: unpricedItemId,
        purchaseDate: '2024-02-01',
        quantity: 3,
        unit: 'Kg',
      })
      .expect(400)

    expect(res.body.error).toBe('PRICE_NOT_AVAILABLE')
  })

  it('403 for company role', async () => {
    await req()
      .post('/v1/purchase-entries')
      .set('Cookie', raneCookies)
      .send({ vendorId, inventoryItemId: pricedItemId, purchaseDate: '2024-02-01', quantity: 1, unit: 'Kg' })
      .expect(403)
  })

  it('401 with no auth', async () => {
    await req()
      .post('/v1/purchase-entries')
      .send({ vendorId, inventoryItemId: pricedItemId, purchaseDate: '2024-02-01', quantity: 1, unit: 'Kg' })
      .expect(401)
  })
})

describe('GET /v1/purchase-entries', () => {
  it('lists entries and applies vendorId/inventoryItemId filters', async () => {
    const all = await req()
      .get('/v1/purchase-entries')
      .query({ vendorId })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(all.body.data.purchaseEntries.length).toBeGreaterThanOrEqual(2)
    expect(all.body.data.purchaseEntries.every((e: { vendorId: string }) => e.vendorId === vendorId)).toBe(true)

    const filtered = await req()
      .get('/v1/purchase-entries')
      .query({ vendorId, inventoryItemId: pricedItemId })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(filtered.body.data.purchaseEntries.length).toBe(2)
    expect(filtered.body.data.purchaseEntries.every(
      (e: { inventoryItemId: string }) => e.inventoryItemId === pricedItemId,
    )).toBe(true)
  })

  it('403 for company role', async () => {
    await req().get('/v1/purchase-entries').set('Cookie', raneCookies).expect(403)
  })

  it('401 with no auth', async () => {
    await req().get('/v1/purchase-entries').expect(401)
  })
})
