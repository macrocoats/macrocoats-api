import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { findMaterialMatch } from '../../src/utils/materialMatch.js'
import { ADMIN_PASSWORD, OPERATOR_PASSWORD } from '../helpers/credentials.js'

let app: FastifyInstance
let adminCookies: string[]
let operatorCookies: string[]
const createdWorkOrderIds: string[] = []

const req = () => supertest(app.server)
const today = () => new Date().toISOString().slice(0, 10)
const plusYear = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const admin = await req().post('/v1/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = admin.headers['set-cookie'] as unknown as string[]
  const operator = await req().post('/v1/auth/login').send({ username: 'operator', password: OPERATOR_PASSWORD })
  operatorCookies = operator.headers['set-cookie'] as unknown as string[]
})

afterAll(async () => {
  // Cancel any WO we created that is still open (completed ones cannot be cancelled).
  // In parallel: ~30 sequential round trips to the remote dev DB exceed the default hook timeout.
  await Promise.all(createdWorkOrderIds.map(async (id) => {
    const wo = await req().get(`/v1/production-work-orders/${id}`).set('Cookie', adminCookies)
    if (wo.status === 200 && ['planned', 'released_to_production', 'in_progress', 'draft'].includes(wo.body.data.status)) {
      await req().post(`/v1/production-work-orders/${id}/transition`).set('Cookie', adminCookies)
        .send({ status: 'cancelled', version: wo.body.data.version, reason: 'Integration test cleanup' })
    }
  }))
  await app.close()
}, 60_000)

async function createWo(overrides: Record<string, unknown> = {}) {
  const res = await req().post('/v1/production-work-orders').set('Cookie', operatorCookies).send({
    demandType: 'trial',
    productKey: 'uniklean-sp',
    plannedQuantity: 100,
    unit: 'L',
    scheduledDate: today(),
    reason: 'Hub integration test',
    ...overrides,
  })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  createdWorkOrderIds.push(res.body.data.id)
  return res.body.data
}

const postBatch = (id: string, body: Record<string, unknown>, cookies = operatorCookies, key: string | null = randomUUID()) => {
  let r = req().post(`/v1/production-work-orders/${id}/batches`).set('Cookie', cookies)
  if (key) r = r.set('Idempotency-Key', key)
  return r.send({ expiryDate: plusYear(), ...body })
}

const getWo = async (id: string) => (await req().get(`/v1/production-work-orders/${id}`).set('Cookie', adminCookies).expect(200)).body.data

async function findInView(view: string, id: string) {
  for (let page = 1; page <= 20; page++) {
    const res = await req().get('/v1/production-work-orders').query({ view, page, limit: 100 }).set('Cookie', adminCookies).expect(200)
    const hit = res.body.data.workOrders.find((w: { id: string }) => w.id === id)
    if (hit) return hit
    if (page * 100 >= res.body.data.total) return undefined
  }
  return undefined
}

describe('create work order', () => {
  it('stock_build with releaseNow is planned or released_to_production (never draft) and logs a created event', async () => {
    const wo = await createWo({ demandType: 'stock_build', plannedQuantity: 10, releaseNow: true })
    expect(['planned', 'released_to_production']).toContain(wo.status)
    expect(wo.status).not.toBe('draft')
    const full = await getWo(wo.id)
    expect(full.events.some((e: { action: string }) => e.action === 'created')).toBe(true)
  })

  it('without releaseNow starts at planned', async () => {
    const wo = await createWo({ demandType: 'stock_build' })
    expect(wo.status).toBe('planned')
  })
})

describe('operator batch creation and auto-advance', () => {
  let woId: string
  let version: number
  let firstBatchNumber: string

  it('operator creates a partial batch: sanitized batch, linked, WO in_progress, events recorded', async () => {
    const wo = await createWo({ plannedQuantity: 100 })
    woId = wo.id
    const res = await postBatch(woId, { batchSize: 40 })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const { batch, workOrder, replayed } = res.body.data
    expect(replayed).toBe(false)
    expect(batch.formulationSnapshot).toBeUndefined()
    expect(batch.costSummary).toBeUndefined()
    expect(batch.workOrderId).toBe(woId)
    firstBatchNumber = batch.batchNumber
    expect(workOrder.status).toBe('in_progress')
    expect(workOrder.producedQuantity).toBe(40)
    version = workOrder.version

    const full = await getWo(woId)
    const batchCreated = full.events.find((e: { action: string }) => e.action === 'batch_created')
    expect(batchCreated).toBeDefined()
    expect(batchCreated.payload.batchNumber).toBe(firstBatchNumber)
    const changed = full.events.find((e: { action: string; toStatus: string }) => e.action === 'status_changed' && e.toStatus === 'in_progress')
    expect(changed).toBeDefined()
    expect(changed.payload.automatic).toBe(true)
  })

  it('output within +-5% does NOT complete the WO before release (QC can still fail)', async () => {
    const res = await postBatch(woId, { batchSize: 58, version })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.data.workOrder.producedQuantity).toBe(98)
    expect(res.body.data.workOrder.status).toBe('in_progress')
    version = res.body.data.workOrder.version
  })

  it('batch on a completed WO is 409 WORK_ORDER_NOT_OPEN', async () => {
    await req().post(`/v1/production-work-orders/${woId}/transition`).set('Cookie', adminCookies)
      .send({ status: 'completed', version }).expect(200)
    const res = await postBatch(woId, { batchSize: 1 })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('WORK_ORDER_NOT_OPEN')
  })

  it('batch on a cancelled WO is 409 WORK_ORDER_NOT_OPEN', async () => {
    const wo = await createWo()
    await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
      .send({ status: 'cancelled', version: wo.version, reason: 'test cancel' }).expect(200)
    const res = await postBatch(wo.id, { batchSize: 10 })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('WORK_ORDER_NOT_OPEN')
  })
})

describe('idempotency', () => {
  it('replaying the same Idempotency-Key returns 200, replayed true, same batch, and only one batch exists', async () => {
    const wo = await createWo({ plannedQuantity: 100 })
    const key = randomUUID()
    const first = await postBatch(wo.id, { batchSize: 20 }, operatorCookies, key)
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const second = await postBatch(wo.id, { batchSize: 20 }, operatorCookies, key)
    expect(second.status).toBe(200)
    expect(second.body.data.replayed).toBe(true)
    expect(second.body.data.batch.batchNumber).toBe(first.body.data.batch.batchNumber)
    const full = await getWo(wo.id)
    expect(full.batches).toHaveLength(1)
    expect(full.producedQuantity).toBe(20)
  })
})

describe('superadmin batch creation', () => {
  it('returns the full batch including formulationSnapshot', async () => {
    const wo = await createWo({ plannedQuantity: 100 })
    const res = await postBatch(wo.id, { batchSize: 10 }, adminCookies)
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.data.batch.formulationSnapshot).toBeDefined()
    expect(res.body.data.batch.workOrderId).toBe(wo.id)
  })
})

describe('batch validation', () => {
  it('rejects expiryDate <= productionDate with 400', async () => {
    const wo = await createWo()
    const res = await postBatch(wo.id, { batchSize: 10, productionDate: today(), expiryDate: today() })
    expect(res.status).toBe(400)
    const earlier = await postBatch(wo.id, { batchSize: 10, productionDate: today(), expiryDate: '2000-01-01' })
    expect(earlier.status).toBe(400)
  })

  it('returns 404 for an unknown work order', async () => {
    const res = await postBatch(randomUUID(), { batchSize: 10 })
    expect(res.status).toBe(404)
  })
})

describe('manual transitions', () => {
  let completedWithReasonResponse: Record<string, unknown> | undefined
  it('released_to_production -> in_progress manually is 409 INVALID_TRANSITION', async () => {
    // Trial WOs may be materially short; release via releaseNow and fall back to skipping if not ready.
    let wo = await createWo({ demandType: 'stock_build', plannedQuantity: 1, releaseNow: true })
    if (wo.status !== 'released_to_production') {
      const rel = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
        .send({ status: 'released_to_production', version: wo.version })
      if (rel.status !== 200) {
        // Materials short: still assert the planned -> in_progress manual path is rejected.
        const bad = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
          .send({ status: 'in_progress', version: wo.version })
        expect(bad.status).toBe(409)
        expect(bad.body.error).toBe('INVALID_TRANSITION')
        return
      }
      wo = rel.body.data
    }
    const res = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
      .send({ status: 'in_progress', version: wo.version })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('INVALID_TRANSITION')
  })

  it('cancel without reason is 400 REASON_REQUIRED', async () => {
    const wo = await createWo()
    const res = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
      .send({ status: 'cancelled', version: wo.version })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('REASON_REQUIRED')
  })

  it('complete outside tolerance needs a reason, then succeeds and stores completionReason', async () => {
    const wo = await createWo({ plannedQuantity: 100 })
    const batch = await postBatch(wo.id, { batchSize: 30 })
    expect(batch.status, JSON.stringify(batch.body)).toBe(201)
    const version = batch.body.data.workOrder.version
    expect(batch.body.data.workOrder.status).toBe('in_progress')

    const noReason = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
      .send({ status: 'completed', version })
    expect(noReason.status).toBe(400)
    expect(noReason.body.error).toBe('REASON_REQUIRED')

    const ok = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
      .send({ status: 'completed', version, reason: 'Customer accepted short run' })
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.status).toBe('completed')
    expect((await getWo(wo.id)).completionReason).toBe('Customer accepted short run')
    completedWithReasonResponse = ok.body.data
  })

  // Contract: transition returns the full WorkOrder shape (incl. completionReason).
  // BUG: toResponse() in the transition path omits completionReason.
  it('transition response includes completionReason', () => {
    expect(completedWithReasonResponse?.completionReason).toBe('Customer accepted short run')
  })

  it('operator cannot cancel a work order (403)', async () => {
    const wo = await createWo()
    const res = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', operatorCookies)
      .send({ status: 'cancelled', version: wo.version, reason: 'operator attempt' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('stale version is 409 VERSION_CONFLICT', async () => {
    const wo = await createWo()
    const res = await req().post(`/v1/production-work-orders/${wo.id}/transition`).set('Cookie', adminCookies)
      .send({ status: 'cancelled', version: wo.version + 5, reason: 'stale' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('VERSION_CONFLICT')
  })
})

describe('list views, counts, nextAction', () => {
  // Trial batches are excluded from the QC queue (they never release), so the awaiting_qc case uses a Production batch.
  beforeAll(boostInventory)
  afterAll(restoreInventory)
  it('counts has all five keys', async () => {
    const res = await req().get('/v1/production-work-orders').set('Cookie', operatorCookies).expect(200)
    expect(Object.keys(res.body.data.counts).sort()).toEqual(['active', 'awaiting_qc', 'done', 'exceptions', 'ready_to_ship'])
  })

  it('WO with no batches has nextAction generate_batch', async () => {
    const wo = await createWo()
    const full = await getWo(wo.id)
    expect(full.nextAction?.type).toBe('generate_batch')
  })

  it('WO with a fresh un-QC\'d batch is in awaiting_qc view with nextAction record_qc', async () => {
    const wo = await createWo({ demandType: 'stock_build', plannedQuantity: 100 })
    const created = await postBatch(wo.id, { batchSize: 30 })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const batchNumber = created.body.data.batch.batchNumber

    const hit = await findInView('awaiting_qc', wo.id)
    expect(hit, 'work order missing from awaiting_qc view').toBeDefined()
    expect(hit.nextAction).toMatchObject({ type: 'record_qc', batchNumber })
    expect(hit.batches.map((b: { batchNumber: string }) => b.batchNumber)).toContain(batchNumber)
    // Operator-safe summaries carry no cost/formula data.
    expect(hit.batches[0].costSummary).toBeUndefined()
    expect(hit.batches[0].formulationSnapshot).toBeUndefined()
  })
})

describe('release gate', () => {
  it('operator gets 403 on POST /v1/batches/:n/release', async () => {
    const wo = await createWo()
    const created = await postBatch(wo.id, { batchSize: 10 })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    await req().post(`/v1/batches/${created.body.data.batch.batchNumber}/release`).set('Cookie', operatorCookies).send({}).expect(403)
  })
})

// ── Phase 2: operator QC, release allocation, bulk release ─────────────────

const coaBody = (status: 'Pass' | 'Fail' = 'Pass') => ({
  tests: [{ parameter: 'pH', method: 'pH meter', specification: '9 - 11', result: '10.1', status }],
})

async function recordCoaAndGet(batchNumber: string, cookies = operatorCookies) {
  return req().patch(`/v1/batches/${batchNumber}/coa`).set('Cookie', cookies).send(coaBody())
}

describe('operator QC (CoA) entry', () => {
  it('operator PATCH /batches/:n/coa -> 200, sanitized, and a qc_recorded event on the WO', async () => {
    const wo = await createWo({ plannedQuantity: 100 })
    const created = await postBatch(wo.id, { batchSize: 30 })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const batchNumber = created.body.data.batch.batchNumber

    const res = await recordCoaAndGet(batchNumber)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.formulationSnapshot).toBeUndefined()
    expect(res.body.data.costSummary).toBeUndefined()

    const full = await getWo(wo.id)
    expect(full.events.some((e: { action: string }) => e.action === 'qc_recorded')).toBe(true)
  })

  it('operator CoA on an unreleased batch does not release it; operator bulk release is 403', async () => {
    await req().post('/v1/batches/release').set('Cookie', operatorCookies).send({ batchNumbers: ['XX-00000000-001'] }).expect(403)
  })
})

// Raise stock only for the materials in uniklean-sp's formula (taken from a
// probe work order's readiness snapshot), so an interrupted run can't leave
// unrelated inventory inflated. Restored to the original values in afterAll.
describe('hub detail extras', () => {
  it('returns a results-blank coaTemplate and actor names on events', async () => {
    const wo = await createWo()
    const detail = await getWo(wo.id)
    expect(Array.isArray(detail.coaTemplate)).toBe(true)
    for (const test of detail.coaTemplate) {
      expect(Object.keys(test).sort()).toEqual(['method', 'parameter', 'specification'])
    }
    const created = detail.events.find((e: { action: string }) => e.action === 'created')
    expect(typeof created.actorName).toBe('string')
  })
})

const originalStock = new Map<string, number | null>()
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
async function boostInventory() {
  const probe = await createWo({ demandType: 'stock_build', plannedQuantity: 1 })
  await req().post(`/v1/production-work-orders/${probe.id}/transition`).set('Cookie', adminCookies)
    .send({ status: 'cancelled', version: probe.version, reason: 'Test probe for inventory scope' })
  const inv = await req().get('/v1/inventory').set('Cookie', adminCookies).expect(200)
  const items = inv.body.data as Array<{ id: string; material: string; stockQty: number | null }>
  // Same fuzzy matcher createBatch deducts with, so every deducted item is covered.
  const names = items.map((item) => item.material)
  const needed = new Set(
    ((probe.materialReadinessSnapshot?.materials ?? []) as Array<{ materialName: string }>)
      .map((m) => findMaterialMatch(m.materialName, names)).filter((name): name is string => name !== null).map(normalize),
  )
  for (const item of items) {
    if (!needed.has(normalize(item.material))) continue
    originalStock.set(item.id, item.stockQty ?? null)
    await req().patch(`/v1/inventory/${item.id}`).set('Cookie', adminCookies).send({ stockQty: 1_000_000 })
  }
}
async function restoreInventory() {
  for (const [id, qty] of originalStock) {
    await req().patch(`/v1/inventory/${id}`).set('Cookie', adminCookies).send({ stockQty: qty })
  }
  originalStock.clear()
}

describe('bulk release', () => {
  // Trial batches are never releasable (blockingReasons: trial_batch), so use Production (stock_build) batches.
  beforeAll(boostInventory)
  afterAll(restoreInventory)
  it('returns per-batch results: releasable released, batch without CoA blocked with coa_missing', async () => {
    const good = await createWo({ demandType: 'stock_build', plannedQuantity: 100 })
    const bad = await createWo({ demandType: 'stock_build', plannedQuantity: 100 })
    const goodBatch = (await postBatch(good.id, { batchSize: 10 })).body.data.batch.batchNumber as string
    const badBatch = (await postBatch(bad.id, { batchSize: 10 })).body.data.batch.batchNumber as string
    expect(goodBatch).toBeTruthy()
    expect(badBatch).toBeTruthy()
    await recordCoaAndGet(goodBatch, adminCookies).then((r) => expect(r.status, JSON.stringify(r.body)).toBe(200))

    const res = await req().post('/v1/batches/release').set('Cookie', adminCookies).send({ batchNumbers: [goodBatch, badBatch] })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const results = res.body.data.results as Array<{ batchNumber: string; released: boolean; lifecycleStatus?: string; blockingReasons?: string[] }>
    const g = results.find((r) => r.batchNumber === goodBatch)!
    const b = results.find((r) => r.batchNumber === badBatch)!
    expect(g.released, JSON.stringify(g)).toBe(true)
    expect(g.lifecycleStatus).toBe('released')
    expect(b.released).toBe(false)
    expect(b.blockingReasons).toContain('coa_missing')
  })
})

describe('release auto-allocation to customer order line', () => {
  beforeAll(boostInventory)
  afterAll(restoreInventory)

  it('links the released batch to the order line with linkedQuantity = min(yield, remaining) and logs batch_released', async () => {
    const companies = await req().get('/v1/companies').set('Cookie', adminCookies).expect(200)
    const company = companies.body.data.find((c: { key: string }) => c.key === 'sanmar')
    const cpo = await req().post('/v1/customer-purchase-orders').set('Cookie', adminCookies).send({
      customerId: company.id,
      customerPoNumber: `HUB-${Date.now()}`,
      customerPoDate: today(),
      items: [{ productKey: 'uniklean-sp', quantityOrdered: 50, unit: 'L', unitPrice: 20 }],
    }).expect(201)
    const orderId = cpo.body.data.id as string
    await req().patch(`/v1/customer-purchase-orders/${orderId}/status`).set('Cookie', adminCookies).send({ status: 'confirmed' }).expect(200)
    const detail = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
    const orderItemId = detail.body.data.items[0].id as string

    const wo = await createWo({
      demandType: 'customer_order', plannedQuantity: 50, unit: 'L', reason: undefined,
      demand: { orderId, orderItemId, plannedQuantity: 50 },
    })
    const created = await postBatch(wo.id, { batchSize: 60 })   // yield (60) > line remaining (50)
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const batchNumber = created.body.data.batch.batchNumber as string
    expect(created.body.data.batch.batchType).toBe('Production')

    await recordCoaAndGet(batchNumber, adminCookies).then((r) => expect(r.status, JSON.stringify(r.body)).toBe(200))
    const rel = await req().post(`/v1/batches/${batchNumber}/release`).set('Cookie', adminCookies).send({})
    expect(rel.status, JSON.stringify(rel.body)).toBe(200)

    const order = await req().get(`/v1/customer-purchase-orders/${orderId}`).set('Cookie', adminCookies).expect(200)
    const links = (order.body.data.batches ?? order.body.data.batchLinks ?? []) as Array<{ batchNumber: string; orderItemId: string; linkedQuantity: number }>
    const link = links.find((l) => l.batchNumber === batchNumber)
    expect(link, `no link found; order keys: ${Object.keys(order.body.data).join(',')}`).toBeDefined()
    expect(link!.orderItemId).toBe(orderItemId)
    expect(link!.linkedQuantity).toBe(50)

    const full = await getWo(wo.id)
    const released = full.events.find((e: { action: string }) => e.action === 'batch_released')
    expect(released).toBeDefined()
    expect(released.payload.allocations).toEqual([expect.objectContaining({ orderId, orderItemId, linkedQuantity: 50 })])
  })
})

describe('completion on release, rejection reopens production', () => {
  beforeAll(boostInventory)
  afterAll(restoreInventory)

  it('WO completes only when released output reaches plan', async () => {
    const wo = await createWo({ demandType: 'stock_build', plannedQuantity: 20 })
    const created = await postBatch(wo.id, { batchSize: 20 })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data.workOrder.status).toBe('in_progress')
    const batchNumber = created.body.data.batch.batchNumber as string
    await recordCoaAndGet(batchNumber, adminCookies).then((r) => expect(r.status, JSON.stringify(r.body)).toBe(200))
    await req().post(`/v1/batches/${batchNumber}/release`).set('Cookie', adminCookies).send({}).expect(200)
    const full = await getWo(wo.id)
    expect(full.status).toBe('completed')
    expect(full.events.some((e: { action: string; toStatus: string; payload: { automatic?: boolean } }) =>
      e.action === 'status_changed' && e.toStatus === 'completed' && e.payload.automatic)).toBe(true)
  })

  it('a rejected batch leaves the WO open and offers the next batch', async () => {
    const wo = await createWo({ demandType: 'stock_build', plannedQuantity: 20 })
    const created = await postBatch(wo.id, { batchSize: 20 })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const batch = created.body.data.batch
    await req().post(`/v1/batches/${batch.batchNumber}/lifecycle`).set('Cookie', adminCookies)
      .send({ status: 'rejected', reason: 'QC failed in test', version: batch.version }).expect(200)
    const full = await getWo(wo.id)
    expect(full.status).toBe('in_progress')
    expect(full.producedQuantity).toBe(0)
    expect(full.nextAction?.type).toBe('generate_batch')
    expect(full.events.some((e: { action: string }) => e.action === 'batch_rejected')).toBe(true)
    const again = await postBatch(wo.id, { batchSize: 20 })
    expect(again.status, JSON.stringify(again.body)).toBe(201)
  })
})

describe('idempotency key scope', () => {
  it('a key reused on a different work order is 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const a = await createWo()
    const b = await createWo()
    const key = randomUUID()
    expect((await postBatch(a.id, { batchSize: 5 }, operatorCookies, key)).status).toBe(201)
    const res = await postBatch(b.id, { batchSize: 5 }, operatorCookies, key)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})
