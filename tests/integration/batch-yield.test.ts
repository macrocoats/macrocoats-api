import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/index.js'
import { batches, finishedGoods } from '../../src/db/schema/index.js'
import { signAccessToken } from '../../src/utils/jwt.js'

// PUT /batches/:batchNumber/yield — record what a batch actually produced.

let app: Awaited<ReturnType<typeof buildApp>>
const stamp = Date.now()
const batchNumber = `YIELD-${stamp}`
let batchId: string
const admin = `Bearer ${signAccessToken({ id: randomUUID(), name: 'Admin', role: 'superadmin', companyName: null, allowedProducts: null } as never)}`
const operator = `Bearer ${signAccessToken({ id: randomUUID(), name: 'Op', role: 'operator', companyName: null, allowedProducts: null } as never)}`

const version = async () =>
  (await db.select({ v: batches.version }).from(batches).where(eq(batches.id, batchId)))[0].v
const putYield = async (actualYield: number, auth = admin, v?: number) =>
  app.inject({
    method: 'PUT',
    url: `/v1/batches/${batchNumber}/yield`,
    headers: { authorization: auth },
    payload: { actualYield, version: v ?? (await version()) },
  })
const fg = async () => (await db.select().from(finishedGoods).where(eq(finishedGoods.batchId, batchId)))[0]

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const [batch] = await db.insert(batches).values({
    batchNumber,
    productCode: 'uniklean-sp',
    companyName: 'Yield Test',
    batchSize: '500',
    productionDate: '2026-11-05',
    formulationSnapshot: {},
    labelSnapshot: {},
    costSummary: {},
    lifecycleStatus: 'released',
  }).returning()
  batchId = batch.id
  await db.insert(finishedGoods).values({
    batchId, productCode: 'uniklean-sp', companyName: 'Yield Test',
    producedQuantity: '500', dispatchedQuantity: '500', status: 'Fully Dispatched',
  })
})
afterAll(async () => {
  await db.delete(batches).where(eq(batches.id, batchId)) // cascades to finished_goods
  await app.close()
})

describe('record actual yield', () => {
  it('is superadmin only', async () => {
    expect((await putYield(510, operator)).statusCode).toBe(403)
  })
  it('sets the yield and reopens fully dispatched stock for the extra litres', async () => {
    const res = await putYield(510)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.actualYield).toBe(510)
    expect(res.json().data.batchSize).toBe(500)
    const row = await fg()
    expect(Number(row.producedQuantity)).toBe(510)
    expect(row.status).toBe('Partially Dispatched')
  })
  it('refuses a yield below what is already dispatched', async () => {
    const res = await putYield(499)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: 'YIELD_BELOW_COMMITTED', committed: 500 })
    expect(Number((await fg()).producedQuantity)).toBe(510)
  })
  it('marks stock fully dispatched again when the yield equals dispatched', async () => {
    expect((await putYield(500)).statusCode).toBe(200)
    expect((await fg()).status).toBe('Fully Dispatched')
  })
  it('rejects a stale version and unknown batches', async () => {
    expect((await putYield(505, admin, 1)).statusCode).toBe(409)
    const missing = await app.inject({
      method: 'PUT', url: '/v1/batches/NOPE-1/yield', headers: { authorization: admin },
      payload: { actualYield: 1, version: 1 },
    })
    expect(missing.statusCode).toBe(404)
  })
})
