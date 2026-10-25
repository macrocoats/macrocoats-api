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
  return { id: res.body.data.id as string, key, displayName: `Audit Fix ${key}`, accessToken: res.body.data.accessToken as string }
}

// Creates a batch for `companyName` and releases it (passing CoA → release),
// since dispatch and order allocation only accept released batches.
async function createBatch(batchSize: number, companyName: string) {
  const res = await req()
    .post('/v1/batches')
    .set('Cookie', adminCookies)
    .send({
      productCode:         'uniklean-sp',
      companyName,
      batchSize,
      formulationSnapshot: { components: [] },
      labelSnapshot: {
        productName: 'UNIKLEAN SP', manufactureDate: '2026-01-01', expiryDate: '2099-01-01',
        netWeight: `${batchSize} L`, hazardPictograms: [], signalWord: 'Warning',
      },
      costSummary: {
        rawMaterialCostPerL: 10, lossAdjustmentPerL: 0, transportCostPerL: 0, handlingBufferPerL: 0,
        productionCostPerL: 10, sellingPricePerL: 20, profitPerL: 10, profitMargin: 50,
      },
    })
    .expect(201)
  const batchNumber = res.body.data.batchNumber as string
  await req()
    .patch(`/v1/batches/${batchNumber}/coa`)
    .set('Cookie', adminCookies)
    .send({ tests: [{ parameter: 'pH', method: 'IS 1', specification: '10-12', result: '11', status: 'Pass' }] })
    .expect(200)
  await req().post(`/v1/batches/${batchNumber}/release`).set('Cookie', adminCookies).send({}).expect(200)
  return { id: res.body.data.id as string, batchNumber }
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
  it('requires the current password, keeps this session and revokes the others', async () => {
    const company = await createCompany()
    const login = await req().post('/v1/auth/login').send({ username: company.key, password: company.accessToken }).expect(200)
    const cookies = login.headers['set-cookie'] as unknown as string[]
    const otherSession = await req().post('/v1/auth/mobile/login').send({ username: company.key, password: company.accessToken }).expect(200)

    // 400, not 401 — the web client treats 401 as an expired session
    await req()
      .post('/v1/auth/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: 'wrong-password', newPassword: 'a-brand-new-password' })
      .expect(400)

    await req()
      .post('/v1/auth/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: company.accessToken, newPassword: 'short' })
      .expect(400)

    const changed = await req()
      .post('/v1/auth/change-password')
      .set('Cookie', cookies)
      .send({ currentPassword: company.accessToken, newPassword: 'a-brand-new-password' })
      .expect(200)
    expect(changed.body.data.accessToken).toBeUndefined()   // cookie client: tokens only as cookies

    // This session got a fresh pair and can keep refreshing…
    const newCookies = changed.headers['set-cookie'] as unknown as string[]
    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: cookieValue(newCookies, 'refreshToken') }).expect(200)
    // …while the old refresh token and every other session are revoked
    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: cookieValue(cookies, 'refreshToken') }).expect(401)
    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: otherSession.body.refreshToken }).expect(401)

    await req().post('/v1/auth/login').send({ username: company.key, password: company.accessToken }).expect(401)
    await req().post('/v1/auth/login').send({ username: company.key, password: 'a-brand-new-password' }).expect(200)
  })

  it('returns the new tokens in the body for Bearer clients', async () => {
    const company = await createCompany()
    const login = await req().post('/v1/auth/mobile/login').send({ username: company.key, password: company.accessToken }).expect(200)

    const changed = await req()
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: company.accessToken, newPassword: 'another-new-password' })
      .expect(200)

    await req().get('/v1/auth/me').set('Authorization', `Bearer ${changed.body.data.accessToken}`).expect(200)
    await req().post('/v1/auth/mobile/refresh').send({ refreshToken: changed.body.data.refreshToken }).expect(200)
  })
})

describe('error mapping', () => {
  it('a malformed uuid path param is a 400, not a 500', async () => {
    await req().get('/v1/vendors/not-a-uuid').set('Cookie', adminCookies).expect(400)
  })
})

describe('finished goods un-cancel', () => {
  it('restores Fully Dispatched rather than Available when everything was dispatched', async () => {
    const company = await createCompany()
    const batch = await createBatch(10, company.displayName)

    await req()
      .post('/v1/dispatches')
      .set('Cookie', adminCookies)
      .send({
        batchId: batch.id, companyId: company.id, dispatchDate: new Date().toISOString().slice(0, 10), quantity: 10,
        dispatchCategory: 'sample', exceptionReason: 'audit regression test',
      })
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
  it('keeps item ids on a draft edit, refuses links to drafts, and locks a linked order', async () => {
    const company = await createCompany()
    const batch = await createBatch(50, company.displayName)
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

    // Draft orders are not open for production allocation
    await req()
      .post(`/v1/customer-purchase-orders/${orderId}/batches`)
      .set('Cookie', adminCookies)
      .send({ orderItemId: itemId, batchId: batch.id, linkedQuantity: 20 })
      .expect(409)

    await req()
      .patch(`/v1/customer-purchase-orders/${orderId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'confirmed' })
      .expect(200)
    await req()
      .post(`/v1/customer-purchase-orders/${orderId}/batches`)
      .set('Cookie', adminCookies)
      .send({ orderItemId: itemId, batchId: batch.id, linkedQuantity: 20 })
      .expect(201)

    // Linking moves the order into production → edits are locked, and nothing changes
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
