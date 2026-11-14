import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { buildApp } from '../../src/app.js'
import { db } from '../../src/db/index.js'
import {
  companies,
  users,
  customerPurchaseOrders,
  customerPurchaseOrderItems,
  customerPurchaseOrderDocuments,
  batches,
  dispatches,
} from '../../src/db/schema/index.js'
import { signAccessToken } from '../../src/utils/jwt.js'
import { env } from '../../src/config/env.js'
import {
  zohoGet,
  fetchZohoInvoicePdf,
} from '../../src/modules/zoho-invoice/zoho-invoice.service.js'
import { pdfService } from '../../src/modules/pdf/pdf.service.js'

vi.mock(
  '../../src/modules/zoho-invoice/zoho-invoice.service.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../src/modules/zoho-invoice/zoho-invoice.service.js')
    >()),
    isZohoConfigured: () => true,
    zohoGet: vi.fn(),
    fetchZohoInvoicePdf: vi.fn(),
  }),
)
const companyIds = [randomUUID(), randomUUID()]
const userIds = [randomUUID(), randomUUID()]
const orderIds = [randomUUID(), randomUUID()]
const batchIds: string[] = []
const stamp = Date.now()
let app: Awaited<ReturnType<typeof buildApp>>
const authorization = (i = 0) =>
  `Bearer ${signAccessToken({ id: userIds[i], name: 'Customer', role: 'company', companyName: 'untrusted-jwt-name', allowedProducts: ['uniklean-sp'] })}`
const get = (path: string, i = 0) =>
  app.inject({
    method: 'GET',
    url: `/v1/customer-portal/${path}`,
    headers: { authorization: authorization(i) },
  })
const storage = join(env.PROCUREMENT_STORAGE_PATH, `portal-test-${stamp}`)
let documentId: string
let internalId: string

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  for (let i = 0; i < 2; i++) {
    await db.insert(companies).values({
      id: companyIds[i],
      key: `portal${stamp}${i}`,
      displayName: `Portal customer ${i}`,
      accessToken: randomUUID(),
      zohoCustomerId: `${stamp}${i}`,
      email: `customer${i}@example.com`,
    })
    await db.insert(users).values({
      id: userIds[i],
      name: 'Customer',
      username: `portal${stamp}${i}`,
      role: 'company',
      companyId: companyIds[i],
      passwordHash: 'not-used',
    })
    await db.insert(customerPurchaseOrders).values({
      id: orderIds[i],
      poNumber: `PORTAL-${stamp}-${i}`,
      customerId: companyIds[i],
      customerPoNumber: `CUSTOMER-${i}`,
      customerPoDate: '2026-11-01',
      status: 'confirmed',
      remarks: 'PRIVATE INTERNAL NOTE',
    })
  }
  await db.insert(customerPurchaseOrderItems).values({
    orderId: orderIds[0],
    sortOrder: 0,
    productKey: 'uniklean-sp',
    quantityOrdered: '10',
    unit: 'L',
    unitPrice: '100',
    amount: '1000',
    remarks: 'INTERNAL LINE NOTE',
  })
  await mkdir(storage, { recursive: true })
  await writeFile(join(storage, 'order.pdf'), '%PDF-1.4 portal fixture')
  const docs = await db
    .insert(customerPurchaseOrderDocuments)
    .values([
      {
        orderId: orderIds[0],
        category: 'po_pdf',
        filename: 'order.pdf',
        storageKey: join(storage, 'order.pdf'),
        mimeType: 'application/pdf',
        sizeBytes: 24,
      },
      {
        orderId: orderIds[0],
        category: 'supporting',
        filename: 'internal.pdf',
        storageKey: join(storage, 'order.pdf'),
        mimeType: 'application/pdf',
        sizeBytes: 24,
      },
    ])
    .returning()
  documentId = docs[0].id
  internalId = docs[1].id
  for (let i = 0; i < 6; i++) {
    const [batch] = await db
      .insert(batches)
      .values({
        batchNumber: `PORTAL-${stamp}-${i}`,
        productCode: 'uniklean-sp',
        companyName: 'INTERNAL BATCH CUSTOMER',
        batchSize: '100',
        productionDate: '2026-11-01',
        formulationSnapshot: { secret: 'FORMULA' },
        labelSnapshot: {},
        costSummary: { secret: 'MARGIN' },
        lifecycleStatus: i === 3 ? 'awaiting_qc' : 'released',
        coaSnapshot:
          i === 4
            ? null
            : {
                customerName: 'OTHER CUSTOMER IN SNAPSHOT',
                tests: [
                  {
                    parameter: 'pH',
                    specification: '7–9',
                    result: '8',
                    status: i === 2 ? 'Fail' : 'Pass',
                  },
                ],
              },
      })
      .returning()
    batchIds.push(batch.id)
    await db.insert(dispatches).values({
      dispatchNumber: `PORTAL-${stamp}-${i}`,
      batchId: batch.id,
      companyId: i === 1 ? companyIds[1] : companyIds[0],
      quantity: '10',
      dispatchDate: '2026-11-02',
      voidedAt: i === 5 ? new Date() : null,
    })
  }
  // A batch supplied to both companies is independently accessible by both.
  await db.insert(dispatches).values({
    dispatchNumber: `PORTAL-${stamp}-shared`,
    batchId: batchIds[0],
    companyId: companyIds[1],
    quantity: '5',
    dispatchDate: '2026-11-03',
  })
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.delete(dispatches).where(inArray(dispatches.batchId, batchIds))
  await db.delete(batches).where(inArray(batches.id, batchIds))
  await db
    .delete(customerPurchaseOrders)
    .where(inArray(customerPurchaseOrders.id, orderIds))
  await db.delete(users).where(inArray(users.id, userIds))
  await db.delete(companies).where(inArray(companies.id, companyIds))
  await rm(storage, { recursive: true, force: true })
  await pdfService.shutdown()
  await app.close()
})

describe('customer portal ownership', () => {
  it('requires authentication and a live company account', async () => {
    expect((await app.inject('/v1/customer-portal/company')).statusCode).toBe(
      401,
    )
    const admin = signAccessToken({
      id: userIds[0],
      name: 'Admin',
      role: 'superadmin',
      companyName: null,
      allowedProducts: null,
    })
    expect(
      (
        await app.inject({
          url: '/v1/customer-portal/company',
          headers: { authorization: `Bearer ${admin}` },
        })
      ).statusCode,
    ).toBe(403)
  })
  it('returns only safe profile fields and ignores a supplied company id', async () => {
    const response = await get(`company?companyId=${companyIds[1]}`)
    expect(response.statusCode).toBe(200)
    expect(response.json().data.id).toBe(companyIds[0])
    expect(Object.keys(response.json().data)).not.toContain('accessToken')
    expect(Object.keys(response.json().data)).not.toContain('zohoCustomerId')
    expect(response.headers['cache-control']).toBe('private, no-store')
  })
  it('scopes order lists and detail and excludes internal fields', async () => {
    const list = (await get('orders')).json().data.items
    expect(list.map((o: { id: string }) => o.id)).toEqual([orderIds[0]])
    expect((await get(`orders/${orderIds[1]}`)).statusCode).toBe(404)
    const detail = await get(`orders/${orderIds[0]}`)
    expect(detail.json().data.items).toHaveLength(1)
    expect(detail.json().data.documents).toHaveLength(1)
    expect(detail.body).not.toMatch(
      /PRIVATE INTERNAL|INTERNAL LINE|storageKey|variantId/,
    )
  })
  it('protects every attachment and keeps supporting documents private', async () => {
    expect(
      (await get(`orders/${orderIds[0]}/documents/${documentId}`)).statusCode,
    ).toBe(200)
    expect(
      (await get(`orders/${orderIds[0]}/documents/${documentId}`, 1))
        .statusCode,
    ).toBe(404)
    expect(
      (await get(`orders/${orderIds[0]}/documents/${internalId}`)).statusCode,
    ).toBe(404)
  })
  it('rejects unsafe attachment types and paths', async () => {
    await db
      .update(customerPurchaseOrderDocuments)
      .set({ mimeType: 'text/html' })
      .where(eq(customerPurchaseOrderDocuments.id, documentId))
    expect(
      (await get(`orders/${orderIds[0]}/documents/${documentId}`)).statusCode,
    ).toBe(404)
    expect(
      (await get(`orders/${orderIds[0]}`)).json().data.documents,
    ).toHaveLength(0)
    await db
      .update(customerPurchaseOrderDocuments)
      .set({ mimeType: 'application/pdf', storageKey: '/etc/hosts' })
      .where(eq(customerPurchaseOrderDocuments.id, documentId))
    expect(
      (await get(`orders/${orderIds[0]}/documents/${documentId}`)).statusCode,
    ).toBe(404)
    await db
      .update(customerPurchaseOrderDocuments)
      .set({ storageKey: join(storage, 'order.pdf') })
      .where(eq(customerPurchaseOrderDocuments.id, documentId))
  })
  it('shows only eligible supplied certificates with safe metadata', async () => {
    const response = await get('certificates')
    expect(response.statusCode).toBe(200)
    expect(response.json().data.items.map((r: { id: string }) => r.id)).toEqual(
      [batchIds[0]],
    )
    expect(response.body).not.toMatch(/FORMULA|MARGIN|snapshot|OTHER CUSTOMER/)
    expect(
      (await get('certificates', 1))
        .json()
        .data.items.map((r: { id: string }) => r.id),
    ).toEqual(expect.arrayContaining([batchIds[0], batchIds[1]]))
  })
  it('summarises open orders, eligible certificates and Zoho outstanding', async () => {
    const own = `${stamp}0`
    const byStatus: Record<string, unknown[]> = {
      unpaid: [{ invoice_id: 'a', customer_id: own, balance: 1000, currency_code: 'INR' }],
      // 'a' again (overlapping filters), a foreign row and a settled row must not count.
      overdue: [
        { invoice_id: 'a', customer_id: own, balance: 1000 },
        { invoice_id: 'b', customer_id: own, balance: 234.5 },
        { invoice_id: 'x', customer_id: 'someone-else', balance: 9999 },
      ],
      partially_paid: [{ invoice_id: 'c', customer_id: own, balance: 0 }],
    }
    vi.mocked(zohoGet).mockImplementation(async (_path, params) => ({
      invoices: byStatus[params?.status ?? ''] ?? [],
    }))
    const response = await get('summary')
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual({
      openOrders: 1,
      certificates: 1,
      outstanding: { amount: 1234.5, currencyCode: 'INR' },
    })
    expect(zohoGet).toHaveBeenCalledWith(
      '/invoice/v3/invoices',
      expect.objectContaining({ customer_id: own, status: 'overdue' }),
    )
    vi.mocked(zohoGet).mockReset()
    // A Zoho outage never breaks the summary.
    vi.mocked(zohoGet).mockRejectedValue(new Error('outage'))
    const outage = await get('summary')
    expect(outage.statusCode).toBe(200)
    expect(outage.json().data.outstanding).toBeNull()
    vi.mocked(zohoGet).mockReset()
  })
  it('serves only the caller\'s own logo from safe storage', async () => {
    const profile = (await get('company')).json().data
    expect(profile.hasLogo).toBe(false)
    expect(JSON.stringify(profile)).not.toMatch(/storage|logoStorageKey|logoMimeType/i)
    expect((await get('company/logo')).statusCode).toBe(404)
    await writeFile(join(storage, 'logo.png'), 'png fixture')
    await db
      .update(companies)
      .set({ logoStorageKey: join(storage, 'logo.png'), logoMimeType: 'image/png', logoUpdatedAt: new Date() })
      .where(eq(companies.id, companyIds[0]))
    const logo = await get('company/logo')
    expect(logo.statusCode).toBe(200)
    expect(logo.headers['content-type']).toContain('image/png')
    expect((await get('company')).json().data.hasLogo).toBe(true)
    expect((await get('company/logo', 1)).statusCode).toBe(404)
    await db.update(companies).set({ logoStorageKey: '/etc/hosts' }).where(eq(companies.id, companyIds[0]))
    expect((await get('company/logo')).statusCode).toBe(404)
    await db
      .update(companies)
      .set({ logoStorageKey: null, logoMimeType: null, logoUpdatedAt: null })
      .where(eq(companies.id, companyIds[0]))
  })
  it('renders a certificate from safe saved test results, with the actual recipient', async () => {
    const render = vi.spyOn(pdfService, 'generatePDF').mockResolvedValueOnce({
      buffer: Buffer.from('%PDF-1.4'),
      generatedAt: new Date().toISOString(),
    })
    expect((await get(`certificates/${batchIds[0]}/pdf`)).statusCode).toBe(200)
    const payload = render.mock.calls[0][1]
    expect(JSON.stringify(payload)).not.toMatch(
      /FORMULA|MARGIN|OTHER CUSTOMER|INTERNAL BATCH/,
    )
    expect(payload.customer).toEqual({ companyName: 'Portal customer 0' })
    render.mockRestore()
    for (const id of batchIds.slice(1))
      expect((await get(`certificates/${id}/pdf`)).statusCode).toBe(404)
  })
  it('produces a valid PDF using the supplied-batch endpoint', async () => {
    const response = await get(`certificates/${batchIds[0]}/pdf`)
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/pdf')
    const pdf = await PDFDocument.load(response.rawPayload)
    expect(pdf.getPageCount()).toBeGreaterThan(0)
  }, 30000)
  it('filters Zoho rows by exact customer id and excludes draft invoices', async () => {
    vi.mocked(zohoGet).mockResolvedValueOnce({
      invoices: [
        {
          invoice_id: '101',
          customer_id: `${stamp}0`,
          invoice_number: 'INV-1',
          status: 'sent',
          total: 100,
          balance: 10,
        },
        {
          invoice_id: '102',
          customer_id: `${stamp}1`,
          invoice_number: 'FOREIGN',
          status: 'sent',
        },
        {
          invoice_id: '103',
          customer_id: `${stamp}0`,
          invoice_number: 'DRAFT',
          status: 'draft',
        },
      ],
      page_context: { has_more_page: true },
    })
    const response = await get('invoices?page=2&search=INV')
    expect(response.json().data.items.map((r: { id: string }) => r.id)).toEqual(
      ['101'],
    )
    expect(response.json().data.hasMore).toBe(true)
    expect(zohoGet).toHaveBeenLastCalledWith(
      '/invoice/v3/invoices',
      expect.objectContaining({
        customer_id: `${stamp}0`,
        page: '2',
        search_text: 'INV',
      }),
    )
  })
  it('checks invoice ownership again before obtaining its PDF', async () => {
    vi.mocked(zohoGet).mockResolvedValueOnce({
      invoice: { customer_id: `${stamp}1`, status: 'sent' },
    })
    expect((await get('invoices/102/pdf')).statusCode).toBe(404)
    expect(fetchZohoInvoicePdf).not.toHaveBeenCalled()
    vi.mocked(zohoGet).mockResolvedValueOnce({
      invoice: { customer_id: `${stamp}0`, status: 'sent' },
    })
    vi.mocked(fetchZohoInvoicePdf).mockResolvedValueOnce({
      pdf: Buffer.from('%PDF-1.4'),
    })
    expect((await get('invoices/101/pdf')).statusCode).toBe(200)
  })
  it('fails safely on upstream outage and invalid input', async () => {
    vi.mocked(zohoGet).mockRejectedValueOnce(
      new Error('upstream private details'),
    )
    const result = await get('invoices')
    expect(result.statusCode).toBe(502)
    expect(result.body).not.toContain('private details')
    expect((await get('orders?page=-1')).statusCode).toBe(400)
    expect((await get('orders/not-an-id')).statusCode).toBe(404)
  })
  it('keeps missing mappings and administrative mutations unavailable', async () => {
    await db
      .update(companies)
      .set({ zohoCustomerId: null })
      .where(eq(companies.id, companyIds[0]))
    expect((await get('invoices')).json().error).toBe('CUSTOMER_NOT_MAPPED')
    await db
      .update(companies)
      .set({ zohoCustomerId: `${stamp}0` })
      .where(eq(companies.id, companyIds[0]))
    const result = await app.inject({
      method: 'POST',
      url: '/v1/customer-purchase-orders',
      headers: { authorization: authorization() },
      payload: {},
    })
    expect(result.statusCode).toBe(403)
  })
  it('hides draft and deleted orders and their attachments', async () => {
    await db
      .update(customerPurchaseOrders)
      .set({ status: 'draft' })
      .where(eq(customerPurchaseOrders.id, orderIds[0]))
    expect((await get('orders')).json().data.items).toHaveLength(0)
    expect(
      (await get(`orders/${orderIds[0]}/documents/${documentId}`)).statusCode,
    ).toBe(404)
    await db
      .update(customerPurchaseOrders)
      .set({ status: 'confirmed', deletedAt: new Date() })
      .where(eq(customerPurchaseOrders.id, orderIds[0]))
    expect((await get(`orders/${orderIds[0]}`)).statusCode).toBe(404)
    await db
      .update(customerPurchaseOrders)
      .set({ deletedAt: null })
      .where(eq(customerPurchaseOrders.id, orderIds[0]))
  })
  it('rejects duplicate Zoho mappings on the administrative edit endpoint', async () => {
    const admin = signAccessToken({
      id: userIds[0],
      name: 'Admin',
      role: 'superadmin',
      companyName: null,
      allowedProducts: null,
    })
    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/companies/${companyIds[0]}`,
      headers: { authorization: `Bearer ${admin}` },
      payload: { zohoCustomerId: `${stamp}1` },
    })
    expect(response.statusCode).toBe(409)
    const [unchanged] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyIds[0]))
    expect(unchanged.zohoCustomerId).toBe(`${stamp}0`)
  })
  it('revokes access for expired companies and missing bindings', async () => {
    await db
      .update(companies)
      .set({ tokenExpiresAt: new Date(0) })
      .where(eq(companies.id, companyIds[0]))
    expect((await get('orders')).statusCode).toBe(403)
    await db
      .update(companies)
      .set({ tokenExpiresAt: null })
      .where(eq(companies.id, companyIds[0]))
    await db
      .update(users)
      .set({ companyId: null })
      .where(eq(users.id, userIds[0]))
    expect((await get('company')).statusCode).toBe(403)
    await db
      .update(users)
      .set({ companyId: companyIds[0] })
      .where(eq(users.id, userIds[0]))
  })
})
