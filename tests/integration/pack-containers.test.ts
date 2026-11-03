import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD, OPERATOR_PASSWORD } from '../helpers/credentials.js'

// Container stock: deducted when a batch is generated, returned with it, and
// adjusted from the Container stock page. Restores each count it changes.

let app: FastifyInstance
let adminCookies: string[]
let operatorCookies: string[]
const original = new Map<string, number>()

const req = () => supertest(app.server)
const stockOf = async (id: string) => {
  const res = await req().get('/v1/pack-containers').set('Cookie', adminCookies).expect(200)
  return res.body.data.find((c: { id: string }) => c.id === id).stockQty as number
}
const setStock = (id: string, quantity: number) => req().post(`/v1/pack-containers/${id}/adjustments`)
  .set('Cookie', adminCookies).send({ type: 'count', quantity, note: 'Integration test' }).expect(201)
const postBatch = (packContainerId: string | undefined, batchSize: number, batchType: 'Production' | 'Trial' = 'Production') => req()
  .post('/v1/batches').set('Cookie', adminCookies).send({
    productCode: 'uniklean-sp', companyName: 'Container Test', batchSize, batchType,
    formulationSnapshot: { components: [] },
    labelSnapshot: {
      productName: 'UNIKLEAN-SP', manufactureDate: '2026-01-01', expiryDate: '2099-01-01',
      netWeight: '30 L', hazardPictograms: [], signalWord: 'Warning', packContainerId,
    },
    costSummary: {
      rawMaterialCostPerL: 1, lossAdjustmentPerL: 0, transportCostPerL: 0, handlingBufferPerL: 0,
      productionCostPerL: 1, sellingPricePerL: 2, profitPerL: 1, profitMargin: 50,
    },
  })

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  adminCookies = (await req().post('/v1/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD })).headers['set-cookie'] as unknown as string[]
  operatorCookies = (await req().post('/v1/auth/login').send({ username: 'operator', password: OPERATOR_PASSWORD })).headers['set-cookie'] as unknown as string[]
  const list = await req().get('/v1/pack-containers').set('Cookie', adminCookies).expect(200)
  for (const c of list.body.data) original.set(c.id, c.stockQty)
})

afterAll(async () => {
  for (const [id, qty] of original) await setStock(id, qty)
  await app.close()
}, 60_000)

describe('batch deduction', () => {
  it('takes one container per started capacity: 65 L in 30 L cans is 3', async () => {
    await setStock('can-30-blue', 10)
    await postBatch('can-30-blue', 65).expect(201)
    expect(await stockOf('can-30-blue')).toBe(7)
  })

  it('an exact fill takes no extra container: 60 L is 2', async () => {
    await setStock('can-30-grey', 10)
    await postBatch('can-30-grey', 60).expect(201)
    expect(await stockOf('can-30-grey')).toBe(8)
  })

  it('refuses when there are too few, and changes nothing', async () => {
    await setStock('drum-210-plastic', 1)
    const res = await postBatch('drum-210-plastic', 300).expect(409)
    expect(res.body).toMatchObject({ error: 'INSUFFICIENT_CONTAINERS', available: 1, required: 2 })
    expect(await stockOf('drum-210-plastic')).toBe(1)
  })

  it('a Trial batch takes no containers', async () => {
    await setStock('can-50', 5)
    await postBatch('can-50', 50, 'Trial').expect(201)
    expect(await stockOf('can-50')).toBe(5)
  })

  it('a batch with no listed container takes none', async () => {
    const before = await stockOf('can-50')
    await postBatch(undefined, 50).expect(201)
    expect(await stockOf('can-50')).toBe(before)
  })

  it('concurrent batches never oversell', async () => {
    await setStock('drum-210-steel', 3)
    const results = await Promise.all(Array.from({ length: 5 }, () => postBatch('drum-210-steel', 210)))
    expect(results.filter((r) => r.status === 201)).toHaveLength(3)
    expect(results.filter((r) => r.status === 409)).toHaveLength(2)
    expect(await stockOf('drum-210-steel')).toBe(0)
  })

  it('the batch picker shows stock to operators, who cannot adjust it', async () => {
    const list = await req().get('/v1/batches/pack-containers').set('Cookie', operatorCookies).expect(200)
    expect(typeof list.body.data[0].stockQty).toBe('number')
    await req().get('/v1/pack-containers').set('Cookie', operatorCookies).expect(403)
    await req().post('/v1/pack-containers/can-50/adjustments').set('Cookie', operatorCookies).send({ type: 'receipt', quantity: 1 }).expect(403)
  })
})

describe('returning containers', () => {
  it('deleting a batch returns them', async () => {
    await setStock('can-30-blue', 10)
    const batch = await postBatch('can-30-blue', 65).expect(201)
    const res = await req().delete(`/v1/batches/${batch.body.data.id}`).set('Cookie', adminCookies).expect(200)
    expect(res.body.data.containersReturned).toEqual([{ containerId: 'can-30-blue', name: '30 L blue can', quantity: 3 }])
    expect(await stockOf('can-30-blue')).toBe(10)
  })

  it('cancelling keeps them unless asked, and returns only once', async () => {
    await setStock('can-30-blue', 10)
    const batch = await postBatch('can-30-blue', 30).expect(201)
    const number = batch.body.data.batchNumber
    const cancel = (returnMaterials?: boolean) => req().post(`/v1/batches/${number}/lifecycle`).set('Cookie', adminCookies)
      .send({ status: 'cancelled', reason: 'Integration test', returnMaterials }).expect(200)
    await cancel()
    expect(await stockOf('can-30-blue')).toBe(9)
    await cancel(true)
    expect(await stockOf('can-30-blue')).toBe(10)
    await cancel(true)
    expect(await stockOf('can-30-blue')).toBe(10)
    await req().post(`/v1/batches/${number}/lifecycle`).set('Cookie', adminCookies)
      .send({ status: 'on_hold', reason: 'Integration test' }).expect(409)
  })
})

describe('adjusting stock', () => {
  it('a receipt adds and a count replaces, and both are in the history', async () => {
    await setStock('can-50', 10)
    await req().post('/v1/pack-containers/can-50/adjustments').set('Cookie', adminCookies)
      .send({ type: 'receipt', quantity: 5, note: 'Delivery' }).expect(201)
    expect(await stockOf('can-50')).toBe(15)
    const res = await req().get('/v1/pack-containers/movements').query({ containerId: 'can-50', limit: 1 }).set('Cookie', adminCookies).expect(200)
    expect(res.body.data[0]).toMatchObject({ movementType: 'receipt', quantityChange: 5, stockAfter: 15, note: 'Delivery' })
  })

  it('rejects a bad quantity and an unknown container', async () => {
    await req().post('/v1/pack-containers/can-50/adjustments').set('Cookie', adminCookies).send({ type: 'receipt', quantity: 0 }).expect(400)
    await req().post('/v1/pack-containers/can-50/adjustments').set('Cookie', adminCookies).send({ type: 'count', quantity: 1.5 }).expect(400)
    await req().post('/v1/pack-containers/bucket/adjustments').set('Cookie', adminCookies).send({ type: 'receipt', quantity: 1 }).expect(404)
  })

  it('flags stock below the minimum', async () => {
    await setStock('can-50', 3)
    const patched = await req().patch('/v1/pack-containers/can-50').set('Cookie', adminCookies).send({ lowStockThreshold: 4 }).expect(200)
    expect(patched.body.data.stockStatus).toBe('low')
    await req().patch('/v1/pack-containers/can-50').set('Cookie', adminCookies).send({ lowStockThreshold: 5 }).expect(200)
  })
})
