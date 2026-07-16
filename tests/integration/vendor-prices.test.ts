import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

let vendorId: string
let inventoryItemId: string

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
    .send({ vendorName: `Test Vendor VP ${Date.now()}`, gstNumber: '33AAAAA0000A1Z5' })
  vendorId = vendorRes.body.vendor.id

  const itemRes = await supertest(app.server)
    .post('/v1/inventory')
    .set('Cookie', adminCookies)
    .send({ material: `Test Material VP ${Date.now()}`, unit: 'Kg', price: 42 })
  inventoryItemId = itemRes.body.id
})

afterAll(async () => {
  // Best-effort cleanup — no DELETE endpoint exists for vendor_material_prices
  // rows, so these deletes rely on vendorMaterialPrices' cascade-on-vendor-delete
  // FK. Never fails the suite if it doesn't fully clean up.
  await supertest(app.server).delete(`/v1/vendors/${vendorId}`).set('Cookie', adminCookies).catch(() => {})
  await supertest(app.server).delete(`/v1/inventory/${inventoryItemId}`).set('Cookie', adminCookies).catch(() => {})
  await app.close()
})

const req = () => supertest(app.server)

describe('POST /v1/vendors/:vendorId/prices', () => {
  it('superadmin can add a new vendor price', async () => {
    const res = await req()
      .post(`/v1/vendors/${vendorId}/prices`)
      .set('Cookie', adminCookies)
      .send({ inventoryItemId, effectiveFrom: '2024-01-01', unitPrice: 100, unit: 'Kg' })
      .expect(201)

    expect(res.body.data.unitPrice).toBe(100)
    expect(res.body.data.effectiveTo).toBeNull()
    expect(res.body.data.vendorId).toBe(vendorId)
    expect(res.body.data.inventoryItemId).toBe(inventoryItemId)
    expect(res.body.data.material).toBeTruthy()
  })

  it('active list shows the newly added price', async () => {
    const res = await req()
      .get(`/v1/vendors/${vendorId}/prices/active`)
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data.length).toBe(1)
    expect(res.body.data[0].unitPrice).toBe(100)
    expect(res.body.data[0].effectiveTo).toBeNull()
  })

  it('a later effectiveFrom closes the previous row and becomes the sole active row', async () => {
    const res = await req()
      .post(`/v1/vendors/${vendorId}/prices`)
      .set('Cookie', adminCookies)
      .send({ inventoryItemId, effectiveFrom: '2024-06-01', unitPrice: 120, unit: 'Kg' })
      .expect(201)

    expect(res.body.data.unitPrice).toBe(120)
    expect(res.body.data.effectiveTo).toBeNull()

    const active = await req()
      .get(`/v1/vendors/${vendorId}/prices/active`)
      .set('Cookie', adminCookies)
      .expect(200)

    expect(active.body.data.length).toBe(1)
    expect(active.body.data[0].unitPrice).toBe(120)

    const history = await req()
      .get(`/v1/vendors/${vendorId}/prices`)
      .set('Cookie', adminCookies)
      .expect(200)

    expect(history.body.data.length).toBe(2)
    const closed = history.body.data.find((r: { unitPrice: number }) => r.unitPrice === 100)
    expect(closed.effectiveTo).toBe('2024-05-31')
    // Closing a row must never rewrite its unitPrice.
    expect(closed.unitPrice).toBe(100)
  })

  it('rejects a same-or-earlier effectiveFrom than the current active row', async () => {
    const res = await req()
      .post(`/v1/vendors/${vendorId}/prices`)
      .set('Cookie', adminCookies)
      .send({ inventoryItemId, effectiveFrom: '2024-06-01', unitPrice: 130, unit: 'Kg' })
      .expect(400)

    expect(res.body.error).toBe('VENDOR_PRICE_INVALID_EFFECTIVE_DATE')
    expect(res.body.currentEffectiveFrom).toBe('2024-06-01')
  })

  it('404s for an unknown vendor', async () => {
    await req()
      .post('/v1/vendors/00000000-0000-0000-0000-000000000000/prices')
      .set('Cookie', adminCookies)
      .send({ inventoryItemId, effectiveFrom: '2025-01-01', unitPrice: 100, unit: 'Kg' })
      .expect(404)
  })

  it('403 for company role', async () => {
    await req()
      .post(`/v1/vendors/${vendorId}/prices`)
      .set('Cookie', raneCookies)
      .send({ inventoryItemId, effectiveFrom: '2025-01-01', unitPrice: 100, unit: 'Kg' })
      .expect(403)
  })

  it('401 with no auth', async () => {
    await req()
      .post(`/v1/vendors/${vendorId}/prices`)
      .send({ inventoryItemId, effectiveFrom: '2025-01-01', unitPrice: 100, unit: 'Kg' })
      .expect(401)
  })
})

describe('GET /v1/vendors/:vendorId/prices/effective', () => {
  it('returns the row that was active on a date inside the first (now-closed) range', async () => {
    const res = await req()
      .get(`/v1/vendors/${vendorId}/prices/effective`)
      .query({ inventoryItemId, date: '2024-03-01' })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data).not.toBeNull()
    expect(res.body.data.unitPrice).toBe(100)
  })

  it('returns the current active row for a date inside its range', async () => {
    const res = await req()
      .get(`/v1/vendors/${vendorId}/prices/effective`)
      .query({ inventoryItemId, date: '2024-07-01' })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data).not.toBeNull()
    expect(res.body.data.unitPrice).toBe(120)
  })

  it('returns null for a date outside any range', async () => {
    const res = await req()
      .get(`/v1/vendors/${vendorId}/prices/effective`)
      .query({ inventoryItemId, date: '2023-01-01' })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data).toBeNull()
  })

  it('403 for company role', async () => {
    await req()
      .get(`/v1/vendors/${vendorId}/prices/effective`)
      .query({ inventoryItemId, date: '2024-07-01' })
      .set('Cookie', raneCookies)
      .expect(403)
  })

  it('401 with no auth', async () => {
    await req()
      .get(`/v1/vendors/${vendorId}/prices/effective`)
      .query({ inventoryItemId, date: '2024-07-01' })
      .expect(401)
  })
})

describe('GET /v1/vendors/:vendorId/prices', () => {
  it('403 for company role', async () => {
    await req()
      .get(`/v1/vendors/${vendorId}/prices`)
      .set('Cookie', raneCookies)
      .expect(403)
  })

  it('401 with no auth', async () => {
    await req().get(`/v1/vendors/${vendorId}/prices`).expect(401)
  })
})
