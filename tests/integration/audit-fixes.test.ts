import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

// Regression tests for the Oct 2026 backend audit fixes: token-type separation,
// company session expiry/rotation, change-password, Postgres error mapping,
// finished-goods un-cancel, and customer PO edits preserving batch links.

let app: FastifyInstance
let adminCookies: string[]
const createdCompanyIds: string[] = []

const req = () => supertest(app.server)
const uniqueKey = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`

function cookieValue(cookies: string[], name: string): string {
  const raw = cookies.find((c) => c.startsWith(`${name}=`))
  if (!raw) throw new Error(`cookie ${name} not set`)
  return raw.split(';')[0].slice(name.length + 1)
}

async function createCompany() {
  const key = uniqueKey('audit')
  const res = await req()
    .post('/v1/companies')
    .set('Cookie', adminCookies)
    .send({ key, displayName: `Audit Fix ${key}`, allowedProducts: ['uniklean-sp'] })
    .expect(201)
  createdCompanyIds.push(res.body.data.id)
  return { id: res.body.data.id as string, key, accessToken: res.body.data.accessToken as string }
}

async function createBatch(batchSize: number) {
  const res = await req()
    .post('/v1/batches')
    .set('Cookie', adminCookies)
    .send({
      productCode:         'uniklean-sp',
      companyName:         `Audit Fix ${Date.now()}`,
      batchSize,
      formulationSnapshot: { components: [] },
      labelSnapshot: {
        productName: 'UNIKLEAN SP', manufactureDate: '2026-01-01', expiryDate: '2027-01-01',
        netWeight: `${batchSize} L`, hazardPictograms: [], signalWord: 'Warning',
      },
      costSummary: {
        rawMaterialCostPerL: 10, lossAdjustmentPerL: 0, transportCostPerL: 0, handlingBufferPerL: 0,
        productionCostPerL: 10, sellingPricePerL: 20, profitPerL: 10, profitMargin: 50,
      },
    })
    .expect(201)
  return { id: res.body.data.id as string, batchNumber: res.body.data.batchNumber as string }
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const login = await req().post('/v1/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD }).expect(200)
  adminCookies = login.headers['set-cookie'] as unknown as string[]
})

afterAll(async () => {
  for (const id of createdCompanyIds) {
    await req().delete(`/v1/companies/${id}`).set('Cookie', adminCookies)
  }
  await app.close()
})

describe('token separation', () => {
  it('rejects a refresh token presented as a Bearer access token', async () => {
    const login = await req().post('/v1/auth/mobile/login').send({ username: 'admin', password: ADMIN_PASSWORD }).expect(200)
    await req().get('/v1/auth/me').set('Authorization', `Bearer ${login.body.refreshToken}`).expect(401)
    await req().get('/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200)
  })

  it('rejects an access token presented as a refresh token', async () => {
    const login = await req().post('/v1/auth/mobile/login').send({ username: 'admin', password: ADMIN_PASSWORD }).expect(200)
    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: login.body.accessToken }).expect(401)
  })
})

describe('company sessions', () => {
  it('stops refreshing once the company token has expired', async () => {
    const company = await createCompany()
    const login = await req().post('/v1/auth/mobile/login').send({ username: company.key, password: company.accessToken }).expect(200)

    await req()
      .patch(`/v1/companies/${company.id}`)
      .set('Cookie', adminCookies)
      .send({ tokenExpiresAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(200)

    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: login.body.refreshToken }).expect(401)
  })

  it('rotating the token invalidates the old password and open sessions', async () => {
    const company = await createCompany()
    const login = await req().post('/v1/auth/mobile/login').send({ username: company.key, password: company.accessToken }).expect(200)

    const rotated = await req().post(`/v1/companies/${company.id}/rotate-token`).set('Cookie', adminCookies).expect(200)
    const newToken = rotated.body.data.accessToken as string

    await req().post('/v1/auth/login').send({ username: company.key, password: company.accessToken }).expect(401)
    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: login.body.refreshToken }).expect(401)
    await req().post('/v1/auth/login').send({ username: company.key, password: newToken }).expect(200)
  })

  it('rotate-token on a missing company is 404', async () => {
    await req()
      .post('/v1/companies/00000000-0000-0000-0000-000000000000/rotate-token')
      .set('Cookie', adminCookies)
      .expect(404)
  })
})

describe('change password', () => {
  it('requires the current password and revokes other sessions', async () => {
    const company = await createCompany()
    const login = await req().post('/v1/auth/login').send({ username: company.key, password: company.accessToken }).expect(200)
    const cookies = login.headers['set-cookie'] as unknown as string[]
    const refreshToken = cookieValue(cookies, 'refreshToken')

    await req()
      .post('/v1/auth/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: 'wrong-password', newPassword: 'a-brand-new-password' })
      .expect(401)

    await req()
      .post('/v1/auth/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: company.accessToken, newPassword: 'short' })
      .expect(400)

    await req()
      .post('/v1/auth/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: company.accessToken, newPassword: 'a-brand-new-password' })
      .expect(200)

    await req().post('/v1/auth/mobile/refresh').send({ refreshToken }).expect(401)
    await req().post('/v1/auth/login').send({ username: company.key, password: company.accessToken }).expect(401)
    await req().post('/v1/auth/login').send({ username: company.key, password: 'a-brand-new-password' }).expect(200)
  })
})

describe('error mapping', () => {
  it('a malformed uuid path param is a 400, not a 500', async () => {
    await req().get('/v1/staff/not-a-uuid').set('Cookie', adminCookies).expect(400)
  })
})

describe('finished goods un-cancel', () => {
  it('restores Fully Dispatched rather than Available when everything was dispatched', async () => {
    const company = await createCompany()
    const batch = await createBatch(10)

    await req()
      .post('/v1/dispatches')
      .set('Cookie', adminCookies)
      .send({ batchId: batch.id, companyId: company.id, dispatchDate: new Date().toISOString().slice(0, 10), quantity: 10 })
      .expect(201)

    const fg = await req().get(`/v1/finished-goods/${batch.batchNumber}`).set('Cookie', adminCookies).expect(200)
    const fgId = (fg.body.data ?? fg.body).id

    await req().patch(`/v1/finished-goods/${fgId}/status`).set('Cookie', adminCookies)
      .send({ status: 'Cancelled', reason: 'audit regression test' }).expect(200)
    const restored = await req().patch(`/v1/finished-goods/${fgId}/status`).set('Cookie', adminCookies)
      .send({ status: 'Available' }).expect(200)

    expect((restored.body.data ?? restored.body).status).toBe('Fully Dispatched')
  })
})

describe('customer PO edit with batch links', () => {
  it('keeps item ids when the lineup is unchanged and locks a lineup change', async () => {
    const company = await createCompany()
    const batch = await createBatch(50)
    const header = {
      customerId:       company.id,
      customerPoNumber: `AF-${Date.now()}`,
      customerPoDate:   new Date().toISOString().slice(0, 10),
    }

    const created = await req()
      .post('/v1/customer-purchase-orders')
      .set('Cookie', adminCookies)
      .send({ ...header, items: [{ productKey: 'uniklean-sp', quantityOrdered: 50, unit: 'L', unitPrice: 20 }] })
      .expect(201)
    const orderId = created.body.data.id
    const detail = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
    const itemId = detail.body.data.items[0].id

    await req()
      .post(`/v1/customer-purchase-orders/${orderId}/batches`)
      .set('Cookie', adminCookies)
      .send({ orderItemId: itemId, batchId: batch.id, linkedQuantity: 20 })
      .expect(201)

    // Same product, new quantity/price → in-place update, item id survives
    await req()
      .put(`/v1/customer-purchase-orders/${orderId}`)
      .set('Cookie', adminCookies)
      .send({ ...header, items: [{ productKey: 'uniklean-sp', quantityOrdered: 60, unit: 'L', unitPrice: 22 }] })
      .expect(200)
    const after = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
    expect(after.body.data.items).toHaveLength(1)
    expect(after.body.data.items[0].id).toBe(itemId)
    expect(Number(after.body.data.items[0].quantityOrdered)).toBe(60)

    // Adding a line would replace the linked item → locked, and nothing changes
    await req()
      .put(`/v1/customer-purchase-orders/${orderId}`)
      .set('Cookie', adminCookies)
      .send({
        ...header,
        customerPoNumber: `${header.customerPoNumber}-X`,
        items: [
          { productKey: 'uniklean-sp', quantityOrdered: 60, unit: 'L', unitPrice: 22 },
          { productKey: 'uniklean-fe', quantityOrdered: 5,  unit: 'L', unitPrice: 30 },
        ],
      })
      .expect(409)
    const unchanged = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
    expect(unchanged.body.data.items[0].id).toBe(itemId)
    expect(unchanged.body.data.customerPoNumber).toBe(header.customerPoNumber)

    await req().delete(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies)
  })
})
