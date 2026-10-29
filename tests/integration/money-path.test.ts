import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

// End-to-end money path: batch → finished goods → customer PO link → dispatch
// → CPO status recompute → void. Each step asserts the stock and status side
// effects that the transactional services are responsible for.

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

let companyId: string
let companyName: string
let batchId: string
let batchNumber: string
let orderId: string
let orderItemId: string
let secondDispatchId: string

const BATCH_SIZE = 100

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

  const companies = await req().get('/v1/companies').set('Cookie', adminCookies).expect(200)
  companyId = companies.body.data[0].id
  companyName = companies.body.data[0].displayName
})

afterAll(async () => {
  await app.close()
})

async function getFinishedGoods() {
  const res = await req().get(`/v1/finished-goods/${batchNumber}`).set('Cookie', adminCookies).expect(200)
  return res.body.data ?? res.body
}

async function getOrderStatus(): Promise<string> {
  const res = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
  return res.body.data.status
}

function dispatch(quantity: number) {
  return req()
    .post('/v1/dispatches')
    .set('Cookie', adminCookies)
    .send({
      batchId,
      companyId,
      customerPurchaseOrderId:     orderId,
      customerPurchaseOrderItemId: orderItemId,
      dispatchDate:                new Date().toISOString().slice(0, 10),
      quantity,
    })
}

describe('money path: batch → finished goods → customer PO → dispatch', () => {
  it('creating a batch creates a Quarantined finished-goods record for the full batch size', async () => {
    const res = await req()
      .post('/v1/batches')
      .set('Cookie', adminCookies)
      .send({
        productCode:         'uniklean-sp',
        companyName,                                // must match the order customer for allocation
        batchSize:           BATCH_SIZE,
        formulationSnapshot: { components: [] },   // no components → no inventory deduction side effects
        labelSnapshot: {
          productName: 'UNIKLEAN SP', manufactureDate: '2026-01-01', expiryDate: '2099-01-01',
          netWeight: '100 L', hazardPictograms: [], signalWord: 'Warning',
        },
        costSummary: {
          rawMaterialCostPerL: 10, lossAdjustmentPerL: 0, transportCostPerL: 0, handlingBufferPerL: 0,
          productionCostPerL: 10, sellingPricePerL: 20, profitPerL: 10, profitMargin: 50,
        },
      })
      .expect(201)

    batchId     = res.body.data.id
    batchNumber = res.body.data.batchNumber
    expect(batchId).toBeTruthy()

    const fg = await getFinishedGoods()
    expect(Number(fg.producedQuantity)).toBe(BATCH_SIZE)
    expect(Number(fg.dispatchedQuantity)).toBe(0)
    expect(fg.status).toBe('Quarantined')   // held until the batch is released
  })

  it('a batch must pass QC and be released before it can be dispatched', async () => {
    await req()
      .post('/v1/dispatches')
      .set('Cookie', adminCookies)
      .send({
        batchId, companyId, dispatchDate: new Date().toISOString().slice(0, 10), quantity: 1,
        dispatchCategory: 'sample', exceptionReason: 'release gate test',
      })
      .expect(409)

    await req()
      .patch(`/v1/batches/${batchNumber}/coa`)
      .set('Cookie', adminCookies)
      .send({ tests: [{ parameter: 'pH', method: 'IS 1', specification: '10-12', result: '11', status: 'Pass' }] })
      .expect(200)
    const released = await req().post(`/v1/batches/${batchNumber}/release`).set('Cookie', adminCookies).send({}).expect(200)
    expect(released.body.data.lifecycleStatus).toBe('released')
    expect((await getFinishedGoods()).status).toBe('Available')
  })

  it('a confirmed order moves to ready_for_dispatch once a batch covers the ordered quantity', async () => {
    const created = await req()
      .post('/v1/customer-purchase-orders')
      .set('Cookie', adminCookies)
      .send({
        customerId:       companyId,
        customerPoNumber: `MP-${Date.now()}`,
        customerPoDate:   new Date().toISOString().slice(0, 10),
        items: [{ productKey: 'uniklean-sp', quantityOrdered: BATCH_SIZE, unit: 'L', unitPrice: 20 }],
      })
      .expect(201)

    orderId = created.body.data.id
    expect(created.body.data.status).toBe('draft')

    const detail = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
    orderItemId = detail.body.data.items[0].id

    await req()
      .patch(`/v1/customer-purchase-orders/${orderId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'confirmed' })
      .expect(200)

    await req()
      .post(`/v1/customer-purchase-orders/${orderId}/batches`)
      .set('Cookie', adminCookies)
      .send({ orderItemId, batchId, linkedQuantity: BATCH_SIZE })
      .expect(201)

    expect(await getOrderStatus()).toBe('ready_for_dispatch')
  })

  it('rejects a dispatch larger than the order-line remainder with 409 and writes nothing', async () => {
    const res = await dispatch(BATCH_SIZE + 50).expect(409)
    expect(res.body.remaining).toBe(BATCH_SIZE)

    const fg = await getFinishedGoods()
    expect(Number(fg.dispatchedQuantity)).toBe(0)
    expect(await getOrderStatus()).toBe('ready_for_dispatch')
  })

  it('a partial dispatch decrements stock and marks the order partially_dispatched', async () => {
    await dispatch(40).expect(201)

    const fg = await getFinishedGoods()
    expect(Number(fg.dispatchedQuantity)).toBe(40)
    expect(fg.status).toBe('Partially Dispatched')
    expect(await getOrderStatus()).toBe('partially_dispatched')
  })

  it('dispatching the remainder completes the order and fully dispatches the batch', async () => {
    const res = await dispatch(60).expect(201)
    secondDispatchId = res.body.data.id

    const fg = await getFinishedGoods()
    expect(Number(fg.dispatchedQuantity)).toBe(BATCH_SIZE)
    expect(fg.status).toBe('Fully Dispatched')
    expect(await getOrderStatus()).toBe('completed')

    // No stock left — any further dispatch is refused
    await dispatch(1).expect(409)
  })

  it('payment terms start only when an invoice is mapped to a dispatch of the batch', async () => {
    const getBatch = async () => (await req().get(`/v1/batches/${batchNumber}`).set('Cookie', adminCookies).expect(200)).body
    // GET /batches/:batchNumber returns the bare batch (operator-reachable read, see CLAUDE.md)
    expect((await getBatch()).paymentDueDate).toBeNull()

    const invoiceNumber = `INV-TEST-${Date.now()}`
    await req().patch(`/v1/dispatches/${secondDispatchId}`).set('Cookie', adminCookies).send({ invoiceNumber }).expect(200)

    const batch = await getBatch()
    const today = new Date().toISOString().slice(0, 10)
    const due = new Date(`${today}T00:00:00Z`)
    due.setUTCDate(due.getUTCDate() + batch.paymentTermDays)
    expect(batch.invoiceNumber).toBe(invoiceNumber)
    expect(batch.paymentStartDate).toBe(today)
    expect(batch.paymentDueDate).toBe(due.toISOString().slice(0, 10))
  })

  it('voiding a dispatch restores stock and recomputes the order status', async () => {
    await req()
      .patch(`/v1/dispatches/${secondDispatchId}/void`)
      .set('Cookie', adminCookies)
      .send({ reason: 'integration test void' })
      .expect(200)

    const fg = await getFinishedGoods()
    expect(Number(fg.dispatchedQuantity)).toBe(40)
    expect(fg.status).toBe('Partially Dispatched')
    expect(await getOrderStatus()).toBe('partially_dispatched')

    // The voided dispatch carried the only invoice, so the payment term is no longer running
    const batch = (await req().get(`/v1/batches/${batchNumber}`).set('Cookie', adminCookies).expect(200)).body
    expect(batch.paymentDueDate).toBeNull()

    // Voiding twice is rejected
    const again = await req()
      .patch(`/v1/dispatches/${secondDispatchId}/void`)
      .set('Cookie', adminCookies)
      .send({ reason: 'again' })
    expect(again.status).toBeGreaterThanOrEqual(400)
  })
})

describe('money path RBAC', () => {
  it('company users cannot create batches, dispatches, or customer orders', async () => {
    await req().post('/v1/batches').set('Cookie', raneCookies).send({}).expect(403)
    await req().post('/v1/dispatches').set('Cookie', raneCookies).send({}).expect(403)
    await req().post('/v1/customer-purchase-orders').set('Cookie', raneCookies).send({}).expect(403)
  })
})

describe('batch inventory gate', () => {
  const body = (batchType: 'Production' | 'Trial') => ({
    productCode:         'uniklean-sp',
    companyName,
    batchSize:           10,
    batchType,
    formulationSnapshot: { components: [{
      name: 'Not An Inventory Material', percentage: 100, quantityUsed: 10, unit: 'L', materialRate: 0, costContribution: 0,
    }] },
    labelSnapshot: {
      productName: 'UNIKLEAN SP', manufactureDate: '2026-01-01', expiryDate: '2099-01-01',
      netWeight: '10 L', hazardPictograms: [], signalWord: 'Warning',
    },
    costSummary: {
      rawMaterialCostPerL: 10, lossAdjustmentPerL: 0, transportCostPerL: 0, handlingBufferPerL: 0,
      productionCostPerL: 10, sellingPricePerL: 20, profitPerL: 10, profitMargin: 50,
    },
  })

  it('blocks a Production batch whose material has no inventory balance', async () => {
    const res = await req().post('/v1/batches').set('Cookie', adminCookies).send(body('Production')).expect(409)
    expect(res.body.error).toBe('MATERIAL_NOT_FOUND')
  })

  it('creates a Trial batch without checking or deducting inventory', async () => {
    const res = await req().post('/v1/batches').set('Cookie', adminCookies).send(body('Trial')).expect(201)
    expect(res.body.data.batchType).toBe('Trial')
  })

  it('matches formula names to Inventory like the Formula page, and skips water', async () => {
    const stamp = Date.now()
    const item = await req().post('/v1/inventory').set('Cookie', adminCookies)
      .send({ material: `Exxol Gate${stamp}`, unit: 'L', price: 1, stockQty: 50 }).expect(201)
    const itemId = item.body.data.id
    try {
      const components = [
        { name: `Exxsol Gate${stamp}`, percentage: 40, quantityUsed: 4, unit: 'L', materialRate: 1, costContribution: 4 },
        { name: 'Water (DI/RO)', percentage: 60, quantityUsed: 6, unit: 'L', materialRate: 0, costContribution: 0 },
      ]
      await req().post('/v1/batches').set('Cookie', adminCookies)
        .send({ ...body('Production'), formulationSnapshot: { components } }).expect(201)

      const list = await req().get('/v1/inventory').set('Cookie', adminCookies).expect(200)
      const after = list.body.data.find((i: { id: string }) => i.id === itemId)
      expect(after.stockQty).toBe(46)
    } finally {
      await req().delete(`/v1/inventory/${itemId}`).set('Cookie', adminCookies)
    }
  })
})
