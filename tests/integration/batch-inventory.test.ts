import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/index.js'
import { inventoryMovements } from '../../src/db/schema/index.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

// Stock side effects of a batch: unit conversion, small quantities, the movement
// record, and returning materials on delete / cancel.

let app: FastifyInstance
let adminCookies: string[]
const createdItemIds: string[] = []
const stamp = Date.now()
let counter = 0

const req = () => supertest(app.server)
const uniqueName = () => `Batch Stock Zq${stamp}x${++counter}`

const createItem = async (unit: 'Kg' | 'L', stockQty: number | null) => {
  const res = await req().post('/v1/inventory').set('Cookie', adminCookies)
    .send({ material: uniqueName(), unit, price: 10, stockQty }).expect(201)
  createdItemIds.push(res.body.data.id)
  return res.body.data as { id: string; material: string; updatedAt: string }
}
const getItem = async (id: string) => {
  const res = await req().get('/v1/inventory').set('Cookie', adminCookies).expect(200)
  return res.body.data.find((i: { id: string }) => i.id === id)
}
const row = (name: string, quantityUsed: number, unit: string, density?: number | null) => ({
  name, percentage: 1, quantityUsed, unit, density, materialRate: 1, costContribution: 1,
})
const postBatch = (components: unknown[], batchType: 'Production' | 'Trial' = 'Production') => req()
  .post('/v1/batches').set('Cookie', adminCookies).send({
    productCode: 'uniklean-sp', companyName: 'Batch Stock Test', batchSize: 100, batchType,
    formulationSnapshot: { components },
    labelSnapshot: {
      productName: 'UNIKLEAN-SP', manufactureDate: '2026-01-01', expiryDate: '2099-01-01',
      netWeight: '100 L', hazardPictograms: [], signalWord: 'Warning',
    },
    costSummary: {
      rawMaterialCostPerL: 1, lossAdjustmentPerL: 0, transportCostPerL: 0, handlingBufferPerL: 0,
      productionCostPerL: 1, sellingPricePerL: 2, profitPerL: 1, profitMargin: 50,
    },
  })
const cancel = (batchNumber: string, returnMaterials?: boolean) => req()
  .post(`/v1/batches/${batchNumber}/lifecycle`).set('Cookie', adminCookies)
  .send({ status: 'cancelled', reason: 'Integration test', returnMaterials })

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const login = await req().post('/v1/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = login.headers['set-cookie'] as unknown as string[]
})

afterAll(async () => {
  for (const id of createdItemIds) await req().delete(`/v1/inventory/${id}`).set('Cookie', adminCookies)
  await app.close()
}, 60_000)

describe('unit conversion', () => {
  it('deducts litres from a Kg item at the row density', async () => {
    const item = await createItem('Kg', 200)
    await postBatch([row(item.material, 100, 'L', 1.7)]).expect(201)
    expect((await getItem(item.id)).stockQty).toBe(30)
  })

  it('deducts kg from a litre item at the row density', async () => {
    const item = await createItem('L', 100)
    await postBatch([row(item.material, 17, 'kg', 1.7)]).expect(201)
    expect((await getItem(item.id)).stockQty).toBe(90)
  })

  it('checks stock in the stocked unit: 100 L at 1.7 needs 170 kg', async () => {
    const item = await createItem('Kg', 150)
    const res = await postBatch([row(item.material, 100, 'L', 1.7)]).expect(409)
    expect(res.body).toMatchObject({ error: 'INSUFFICIENT_MATERIAL', required: 170, available: 150, unit: 'Kg' })
    expect((await getItem(item.id)).stockQty).toBe(150)
  })

  it('refuses differing units with no density, and deducts nothing', async () => {
    const other = await createItem('Kg', 50)
    const item = await createItem('Kg', 100)
    const res = await postBatch([row(other.material, 1, 'Kg'), row(item.material, 10, 'L')]).expect(409)
    expect(res.body.error).toBe('UNIT_CONVERSION_UNAVAILABLE')
    expect((await getItem(item.id)).stockQty).toBe(100)
    expect((await getItem(other.id)).stockQty).toBe(50)
  })
})

describe('stock precision and record', () => {
  it('keeps quantities down to 0.001', async () => {
    const item = await createItem('Kg', 100)
    for (let i = 0; i < 3; i += 1) await postBatch([row(item.material, 0.004, 'Kg')]).expect(201)
    expect((await getItem(item.id)).stockQty).toBe(99.988)
  })

  it('does not refuse a batch over floating-point noise', async () => {
    const item = await createItem('Kg', 0.3)
    await postBatch([row(item.material, 0.1, 'Kg'), row(item.material, 0.2, 'Kg')]).expect(201)
    expect((await getItem(item.id)).stockQty).toBe(0)
  })

  it('updates the item date and records the movement in the stocked unit', async () => {
    const item = await createItem('Kg', 200)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const batch = await postBatch([row(item.material, 10, 'L', 1.5), row('DM Water', 90, 'L')]).expect(201)
    expect((await getItem(item.id)).updatedAt).not.toBe(item.updatedAt)
    const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.batchId, batch.body.data.id))
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({ inventoryItemId: item.id, movementType: 'issue', quantity: '15.000' })
    expect(movements[0].metadata).toMatchObject({ material: item.material, unit: 'Kg', batchNumber: batch.body.data.batchNumber })
  })

  it('a Trial batch deducts and records nothing', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 10, 'Kg')], 'Trial').expect(201)
    expect((await getItem(item.id)).stockQty).toBe(100)
    expect(await db.select().from(inventoryMovements).where(eq(inventoryMovements.batchId, batch.body.data.id))).toHaveLength(0)
  })
})

describe('returning materials', () => {
  it('deleting a batch returns what it took, in the stocked unit', async () => {
    const item = await createItem('Kg', 200)
    const batch = await postBatch([row(item.material, 100, 'L', 1.7)]).expect(201)
    const res = await req().delete(`/v1/batches/${batch.body.data.id}`).set('Cookie', adminCookies).expect(200)
    expect(res.body.data.materialsReturned).toEqual([{ material: item.material, quantity: 170, unit: 'Kg', returned: true }])
    expect((await getItem(item.id)).stockQty).toBe(200)
  })

  it('keeps the movement history after the batch is deleted', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 5, 'Kg')]).expect(201)
    await req().delete(`/v1/batches/${batch.body.data.id}`).set('Cookie', adminCookies).expect(200)
    const movements = await db.select().from(inventoryMovements).where(eq(inventoryMovements.inventoryItemId, item.id))
    expect(movements.map((m) => m.movementType).sort()).toEqual(['issue', 'reversal'])
    expect(movements.every((m) => m.batchId === null)).toBe(true)
  })

  it('cancelling keeps the deduction unless asked to return it', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 25, 'Kg')]).expect(201)
    const res = await cancel(batch.body.data.batchNumber).expect(200)
    expect(res.body.data.materialsReturned).toEqual([])
    expect((await getItem(item.id)).stockQty).toBe(75)
  })

  it('cancelling with returnMaterials returns once, and a later delete adds nothing', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 25, 'Kg')]).expect(201)
    await cancel(batch.body.data.batchNumber, true).expect(200)
    expect((await getItem(item.id)).stockQty).toBe(100)
    await cancel(batch.body.data.batchNumber, true).expect(200)
    expect((await getItem(item.id)).stockQty).toBe(100)
    const deleted = await req().delete(`/v1/batches/${batch.body.data.id}`).set('Cookie', adminCookies).expect(200)
    expect(deleted.body.data.materialsReturned).toEqual([])
    expect((await getItem(item.id)).stockQty).toBe(100)
  })

  it('a cancelled batch whose materials went back cannot become live again', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 25, 'Kg')]).expect(201)
    await cancel(batch.body.data.batchNumber, true).expect(200)
    const res = await req().post(`/v1/batches/${batch.body.data.batchNumber}/lifecycle`).set('Cookie', adminCookies)
      .send({ status: 'on_hold', reason: 'Integration test' }).expect(409)
    expect(res.body.blockingReasons).toEqual(['materials_returned'])
  })

  it('rejecting never returns materials', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 25, 'Kg')]).expect(201)
    await req().post(`/v1/batches/${batch.body.data.batchNumber}/lifecycle`).set('Cookie', adminCookies)
      .send({ status: 'rejected', reason: 'Integration test', returnMaterials: true }).expect(200)
    expect((await getItem(item.id)).stockQty).toBe(75)
  })

  it('reports an item that can no longer take the stock back', async () => {
    const item = await createItem('Kg', 100)
    const batch = await postBatch([row(item.material, 25, 'Kg')]).expect(201)
    await req().patch(`/v1/inventory/${item.id}`).set('Cookie', adminCookies).send({ stockQty: null }).expect(200)
    const res = await req().delete(`/v1/batches/${batch.body.data.id}`).set('Cookie', adminCookies).expect(200)
    expect(res.body.data.materialsReturned).toEqual([{ material: item.material, quantity: 25, unit: 'Kg', returned: false }])
    expect((await getItem(item.id)).stockQty).toBeNull()
  })
})
