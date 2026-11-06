import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/index.js'
import { purchaseEntries } from '../../src/db/schema/index.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

let app: FastifyInstance
let adminCookies: string[]
let vendorId: string
let inventoryItemId: string

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const req = () => supertest(app.server)

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const login = await req().post('/v1/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = login.headers['set-cookie']

  const vendor = await req().post('/v1/vendors').set('Cookie', adminCookies)
    .send({ vendorName: `Test Vendor VI ${Date.now()}`, gstNumber: '33AAAAA0000A1Z5' })
  vendorId = vendor.body.data.id
  const item = await req().post('/v1/inventory').set('Cookie', adminCookies)
    .send({ material: `Test Material VI ${Date.now()}`, unit: 'Kg', price: 42 })
  inventoryItemId = item.body.data.id

  await req().post(`/v1/vendors/${vendorId}/prices`).set('Cookie', adminCookies)
    .send({ inventoryItemId, effectiveFrom: '2024-01-01', unitPrice: 100, unit: 'Kg' }).expect(201)
  await req().post(`/v1/vendors/${vendorId}/prices`).set('Cookie', adminCookies)
    .send({ inventoryItemId, effectiveFrom: '2024-06-01', unitPrice: 110, unit: 'Kg' }).expect(201)
  await req().post('/v1/purchase-entries').set('Cookie', adminCookies)
    .send({ vendorId, inventoryItemId, purchaseDate: today(), quantity: 10, unit: 'Kg', unitPrice: 110 }).expect(201)
})

afterAll(async () => {
  // purchase_entries restricts vendor/item deletes, so clear them first.
  await db.delete(purchaseEntries).where(eq(purchaseEntries.vendorId, vendorId)).catch(() => {})
  await req().delete(`/v1/vendors/${vendorId}`).set('Cookie', adminCookies).catch(() => {})
  await req().delete(`/v1/inventory/${inventoryItemId}`).set('Cookie', adminCookies).catch(() => {})
  await app.close()
})

describe('GET /v1/vendors/insights', () => {
  it('returns spend, monthly series and rate movement per vendor', async () => {
    const res = await req().get('/v1/vendors/insights').set('Cookie', adminCookies).expect(200)
    expect(res.body.data.months).toHaveLength(6)
    const v = res.body.data.vendors.find((x: { vendorId: string }) => x.vendorId === vendorId)
    expect(v.spend).toBe(1100)
    expect(v.monthly[5]).toBe(1100)
    expect(v.lastReceipt).toBe(today())
    expect(v.ratesUp).toBe(1)
    expect(v.ratesDown).toBe(0)
    expect(v.rates[0]).toMatchObject({ unitPrice: 110, changePct: 10 })
  })

  it('rejects unauthenticated requests', async () => {
    await req().get('/v1/vendors/insights').expect(401)
  })
})

describe('GET /v1/vendors/:id/insights', () => {
  it('returns monthly spend and spend by material', async () => {
    const res = await req().get(`/v1/vendors/${vendorId}/insights`).set('Cookie', adminCookies).expect(200)
    expect(res.body.data.spend).toBe(1100)
    expect(res.body.data.monthly).toHaveLength(6)
    expect(res.body.data.byMaterial[0]).toMatchObject({ inventoryItemId, totalValue: 1100 })
    expect(res.body.data.lastReceipt).toBe(today())
  })

  it('404s for an unknown vendor', async () => {
    await req().get('/v1/vendors/00000000-0000-0000-0000-000000000000/insights').set('Cookie', adminCookies).expect(404)
  })
})
