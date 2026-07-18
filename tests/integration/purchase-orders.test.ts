import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { computeOverallStatus } from '../../src/modules/purchase-orders/purchase-orders.service.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

let vendorId: string
let material1Id: string
let material2Id: string

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
    .send({ vendorName: `Test Vendor PO ${Date.now()}`, gstNumber: '33AAAAA0000A1Z5' })
  vendorId = vendorRes.body.vendor.id

  const material1Res = await supertest(app.server)
    .post('/v1/inventory')
    .set('Cookie', adminCookies)
    .send({ material: `Test Material PO 1 ${Date.now()}`, unit: 'Kg', price: 42 })
  material1Id = material1Res.body.id

  const material2Res = await supertest(app.server)
    .post('/v1/inventory')
    .set('Cookie', adminCookies)
    .send({ material: `Test Material PO 2 ${Date.now()}`, unit: 'Kg', price: 42 })
  material2Id = material2Res.body.id
})

afterAll(async () => {
  await app.close()
})

const req = () => supertest(app.server)

// itemsTotal for the standard 2-item PO used across the lifecycle test:
// 10 * 100 * 1.18 = 1180, 5 * 50 * 1.18 = 295 → 1475
const STANDARD_ITEMS_TOTAL = 1475

function standardCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    vendorId,
    poDate:               '2026-01-05',
    expectedDeliveryDate: '2026-01-20',
    paymentTerms:         'Net 30',
    items: [
      { materialId: material1Id, quantity: 10, unit: 'Kg', unitPrice: 100, gstPercent: 18 },
      { materialId: material2Id, quantity: 5,  unit: 'Kg', unitPrice: 50,  gstPercent: 18 },
    ],
    ...overrides,
  }
}

describe('computeOverallStatus', () => {
  it('never advances out of a terminal status (cancelled/closed)', () => {
    expect(computeOverallStatus('cancelled', 1000, 1000, 'paid')).toBe('cancelled')
    expect(computeOverallStatus('closed', 1000, 1000, 'paid')).toBe('closed')
  })

  it('leaves the status unchanged when nothing has been invoiced yet', () => {
    expect(computeOverallStatus('draft', 1000, 0, 'pending')).toBe('draft')
    expect(computeOverallStatus('issued', 1000, 0, 'pending')).toBe('issued')
    expect(computeOverallStatus('confirmed', 1000, 0, 'pending')).toBe('confirmed')
  })

  it('returns partially_invoiced when some but not all of itemsTotal has been invoiced', () => {
    expect(computeOverallStatus('issued', 1000, 400, 'pending')).toBe('partially_invoiced')
  })

  it('returns fully_invoiced once invoicedTotal reaches itemsTotal but payment is still pending', () => {
    expect(computeOverallStatus('partially_invoiced', 1000, 1000, 'pending')).toBe('fully_invoiced')
    expect(computeOverallStatus('partially_invoiced', 1000, 1200, 'pending')).toBe('fully_invoiced')
  })

  it('returns partially_paid whenever paymentStatus is partially_paid, regardless of invoice coverage', () => {
    expect(computeOverallStatus('fully_invoiced', 1000, 1000, 'partially_paid')).toBe('partially_paid')
    expect(computeOverallStatus('partially_invoiced', 1000, 400, 'partially_paid')).toBe('partially_paid')
  })

  it('returns paid only when paymentStatus is paid AND invoicedTotal covers itemsTotal', () => {
    expect(computeOverallStatus('fully_invoiced', 1000, 1000, 'paid')).toBe('paid')
    // Paid status flag alone isn't enough if the invoiced amount hasn't caught up.
    expect(computeOverallStatus('partially_invoiced', 1000, 400, 'paid')).toBe('partially_invoiced')
  })
})

describe('Purchase orders — auth guards', () => {
  it('401 with no auth on core routes', async () => {
    await req().get('/v1/purchase-orders').expect(401)
    await req().get('/v1/purchase-orders/summary').expect(401)
    await req().post('/v1/purchase-orders').send(standardCreateBody()).expect(401)
  })

  it('403 for company role on core routes', async () => {
    await req().get('/v1/purchase-orders').set('Cookie', raneCookies).expect(403)
    await req().get('/v1/purchase-orders/summary').set('Cookie', raneCookies).expect(403)
    await req().post('/v1/purchase-orders').set('Cookie', raneCookies).send(standardCreateBody()).expect(403)
  })
})

describe('POST /v1/purchase-orders', () => {
  it('creates a PO with 2 items and returns a PO-YYYY-NNNN number', async () => {
    const res = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)

    expect(res.body.data.poNumber).toMatch(/^PO-\d{4}-\d{4}$/)
    expect(res.body.data.status).toBe('draft')
    expect(res.body.data.items).toHaveLength(2)
    expect(res.body.data.itemsTotal).toBe(STANDARD_ITEMS_TOTAL)
  })
})

describe('GET /v1/purchase-orders (list)', () => {
  it('returns a flat pagination envelope with the PO array under data', async () => {
    const created = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)

    const res = await req()
      .get('/v1/purchase-orders')
      .query({ limit: 10, sortBy: 'poDate', sortDir: 'desc', search: created.body.data.poNumber })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.data)).toBe(true)
    expect(typeof res.body.total).toBe('number')
    expect(res.body.page).toBe(1)
    expect(res.body.limit).toBe(10)
    expect(res.body.data.some((po: { id: string }) => po.id === created.body.data.id)).toBe(true)
  })
})

describe('Purchase order lifecycle', () => {
  let poId: string

  beforeAll(async () => {
    const res = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)
    poId = res.body.data.id
  })

  it('GET /:id returns correct computed totals', async () => {
    const res = await req().get(`/v1/purchase-orders/${poId}`).set('Cookie', adminCookies).expect(200)

    expect(res.body.data.itemsTotal).toBe(STANDARD_ITEMS_TOTAL)
    expect(res.body.data.invoicedTotal).toBe(0)
    expect(res.body.data.paymentStatus).toBe('pending')
    expect(res.body.data.paymentPendingAmount).toBe(STANDARD_ITEMS_TOTAL)
  })

  it('transitions draft → issued → confirmed', async () => {
    const issued = await req()
      .patch(`/v1/purchase-orders/${poId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'issued' })
      .expect(200)
    expect(issued.body.data.status).toBe('issued')

    const confirmed = await req()
      .patch(`/v1/purchase-orders/${poId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'confirmed' })
      .expect(200)
    expect(confirmed.body.data.status).toBe('confirmed')
  })

  it('409s on an illegal direct jump (draft → closed) for a fresh PO', async () => {
    const res = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)
    const freshId = res.body.data.id

    const attempt = await req()
      .patch(`/v1/purchase-orders/${freshId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'closed' })
      .expect(409)
    expect(attempt.body.error).toBe('INVALID_STATUS_TRANSITION')
  })

  it('adding two invoices summing less than itemsTotal → partially_invoiced', async () => {
    await req()
      .post(`/v1/purchase-orders/${poId}/invoices`)
      .set('Cookie', adminCookies)
      .send({ invoiceNumber: 'INV-001', invoiceDate: '2026-01-10', invoiceAmount: 500 })
      .expect(201)

    await req()
      .post(`/v1/purchase-orders/${poId}/invoices`)
      .set('Cookie', adminCookies)
      .send({ invoiceNumber: 'INV-002', invoiceDate: '2026-01-15', invoiceAmount: 500 })
      .expect(201)

    const res = await req().get(`/v1/purchase-orders/${poId}`).set('Cookie', adminCookies).expect(200)
    expect(res.body.data.status).toBe('partially_invoiced')
    expect(res.body.data.invoicedTotal).toBe(1000)
  })

  it('a third invoice reaching the full total → fully_invoiced', async () => {
    await req()
      .post(`/v1/purchase-orders/${poId}/invoices`)
      .set('Cookie', adminCookies)
      .send({ invoiceNumber: 'INV-003', invoiceDate: '2026-01-20', invoiceAmount: STANDARD_ITEMS_TOTAL - 1000 })
      .expect(201)

    const res = await req().get(`/v1/purchase-orders/${poId}`).set('Cookie', adminCookies).expect(200)
    expect(res.body.data.status).toBe('fully_invoiced')
    expect(res.body.data.invoicedTotal).toBe(STANDARD_ITEMS_TOTAL)
  })

  it('409s closing before payment is paid, then 200s after marking paid', async () => {
    const tooEarly = await req()
      .patch(`/v1/purchase-orders/${poId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'closed' })
      .expect(409)
    expect(tooEarly.body.error).toBe('INVALID_STATUS_TRANSITION')

    const paidRes = await req()
      .patch(`/v1/purchase-orders/${poId}/payment`)
      .set('Cookie', adminCookies)
      .send({ paymentStatus: 'paid', paymentDate: '2026-01-25', paymentReferenceNumber: 'TXN-123' })
      .expect(200)
    expect(paidRes.body.data.paymentStatus).toBe('paid')
    expect(paidRes.body.data.status).toBe('paid')
    expect(paidRes.body.data.paymentPendingAmount).toBe(0)

    const closed = await req()
      .patch(`/v1/purchase-orders/${poId}/status`)
      .set('Cookie', adminCookies)
      .send({ status: 'closed' })
      .expect(200)
    expect(closed.body.data.status).toBe('closed')
  })

  it('GET .../timeline includes created, status_changed, invoice_added, payment_updated entries', async () => {
    const res = await req().get(`/v1/purchase-orders/${poId}/timeline`).set('Cookie', adminCookies).expect(200)
    const actions = (res.body.data as Array<{ action: string }>).map((row) => row.action)

    expect(actions).toContain('created')
    expect(actions).toContain('status_changed')
    expect(actions).toContain('invoice_added')
    expect(actions).toContain('payment_updated')
  })
})

describe('Cancelling a purchase order', () => {
  it('cancels a draft PO, sets cancelledAt, and locks further item edits', async () => {
    const created = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)
    const poId = created.body.data.id

    const cancelled = await req()
      .patch(`/v1/purchase-orders/${poId}/cancel`)
      .set('Cookie', adminCookies)
      .send({ reason: 'No longer needed' })
      .expect(200)

    expect(cancelled.body.data.status).toBe('cancelled')
    expect(cancelled.body.data.cancelledAt).toBeTruthy()
    expect(cancelled.body.data.cancelReason).toBe('No longer needed')

    const itemsEdit = await req()
      .put(`/v1/purchase-orders/${poId}/items`)
      .set('Cookie', adminCookies)
      .send({ items: [{ materialId: material1Id, quantity: 1, unit: 'Kg', unitPrice: 10, gstPercent: 18 }] })
      .expect(409)
    expect(itemsEdit.body.error).toBe('PO_ITEMS_LOCKED')
  })

  it('409s cancelling an already-cancelled PO', async () => {
    const created = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)
    const poId = created.body.data.id

    await req()
      .patch(`/v1/purchase-orders/${poId}/cancel`)
      .set('Cookie', adminCookies)
      .send({ reason: 'first cancel' })
      .expect(200)

    const second = await req()
      .patch(`/v1/purchase-orders/${poId}/cancel`)
      .set('Cookie', adminCookies)
      .send({ reason: 'second cancel' })
      .expect(409)
    expect(second.body.error).toBe('PO_ALREADY_CANCELLED')
  })
})

describe('Purchase order documents', () => {
  let poId: string

  beforeAll(async () => {
    const res = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)
    poId = res.body.data.id
  })

  it('uploads, downloads, lists, and deletes a document', async () => {
    const fileContents = 'hello purchase order world'

    const uploadRes = await req()
      .post(`/v1/purchase-orders/${poId}/documents`)
      .set('Cookie', adminCookies)
      .field('docCategory', 'supporting')
      .attach('file', Buffer.from(fileContents), 'test-doc.txt')
      .expect(201)

    const docId = uploadRes.body.data.id
    expect(uploadRes.body.data.docCategory).toBe('supporting')
    expect(uploadRes.body.data.filename).toBe('test-doc.txt')
    expect(uploadRes.body.data.sizeBytes).toBe(Buffer.byteLength(fileContents))

    const listRes = await req().get(`/v1/purchase-orders/${poId}/documents`).set('Cookie', adminCookies).expect(200)
    expect(listRes.body.data.some((d: { id: string }) => d.id === docId)).toBe(true)

    const downloadRes = await req()
      .get(`/v1/purchase-orders/${poId}/documents/${docId}/download`)
      .set('Cookie', adminCookies)
      .expect(200)
    expect(downloadRes.text).toBe(fileContents)

    await req()
      .delete(`/v1/purchase-orders/${poId}/documents/${docId}`)
      .set('Cookie', adminCookies)
      .expect(204)

    const afterDelete = await req().get(`/v1/purchase-orders/${poId}/documents`).set('Cookie', adminCookies).expect(200)
    expect(afterDelete.body.data.some((d: { id: string }) => d.id === docId)).toBe(false)

    const timelineRes = await req().get(`/v1/purchase-orders/${poId}/timeline`).set('Cookie', adminCookies).expect(200)
    const actions = (timelineRes.body.data as Array<{ action: string }>).map((row) => row.action)
    expect(actions).toContain('document_uploaded')
    expect(actions).toContain('document_deleted')
  })

  it('404s for a non-existent PO on the document routes', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await req()
      .post(`/v1/purchase-orders/${fakeId}/documents`)
      .set('Cookie', adminCookies)
      .field('docCategory', 'supporting')
      .attach('file', Buffer.from('x'), 'x.txt')
      .expect(404)
  })

  it('401/403 guards on document routes', async () => {
    await req().get(`/v1/purchase-orders/${poId}/documents`).expect(401)
    await req().get(`/v1/purchase-orders/${poId}/documents`).set('Cookie', raneCookies).expect(403)
  })
})

describe('Purchase order invoices — auth guards', () => {
  it('401/403 on invoice routes', async () => {
    const created = await req()
      .post('/v1/purchase-orders')
      .set('Cookie', adminCookies)
      .send(standardCreateBody())
      .expect(201)
    const poId = created.body.data.id

    await req().get(`/v1/purchase-orders/${poId}/invoices`).expect(401)
    await req().get(`/v1/purchase-orders/${poId}/invoices`).set('Cookie', raneCookies).expect(403)
  })
})
