import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

// Revenue figures come from Zoho invoices; order-flow figures from customer
// POs. These tests pin the response contract either way: when Zoho isn't
// connected (CI, most dev machines) the endpoints still answer 200 with
// revenueBasis.available = false and zero sales, never a 500.
let app: FastifyInstance
let cookies: string[]

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const login = await supertest(app.server).post('/v1/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD })
  cookies = login.headers['set-cookie']
})

afterAll(async () => { await app.close() })

const get = (path: string) => supertest(app.server).get(`/v1/investor-dashboard${path}`).set('Cookie', cookies)

describe('investor dashboard on invoiced sales', () => {
  it('executive-kpis returns invoiced and order figures side by side', async () => {
    const res = await get('/executive-kpis?range=quarter')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.revenueBasis).toMatchObject({ source: 'zoho_invoices', valuation: 'before_gst' })
    expect(typeof d.revenueBasis.available).toBe('boolean')
    for (const k of ['currentMonthSales', 'quarterlySales', 'ytdSales', 'invoicedValue', 'invoiceCount', 'pendingOrderValue', 'ordersReceived']) {
      expect(typeof d[k]).toBe('number')
    }
    expect(typeof d.prior.invoicedValue).toBe('number')
    if (!d.revenueBasis.available) expect(d.ytdSales).toBe(0)
  })

  it('sales-analytics returns 12/8/5 trailing periods with prior-year values', async () => {
    const res = await get('/sales-analytics?range=year')
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.monthlyTrend).toHaveLength(12)
    expect(d.quarterlyTrend).toHaveLength(8)
    expect(d.yearlyTrend).toHaveLength(5)
    expect(d.monthlyTrend[0]).toEqual(expect.objectContaining({ period: expect.any(String), totalValue: expect.any(Number), priorTotalValue: expect.any(Number), invoiceCount: expect.any(Number) }))
    expect(Array.isArray(d.salesByRegion)).toBe(true)
  })

  it('projections and insights carry the revenue basis', async () => {
    const [p, i] = await Promise.all([get('/projections?conversionRate=0.3'), get('/insights?range=month')])
    expect(p.status).toBe(200)
    expect(i.status).toBe(200)
    expect(p.body.data.revenueBasis.source).toBe('zoho_invoices')
    expect(typeof p.body.data.pipelineValue).toBe('number')
    expect(i.body.data.revenueBasis.source).toBe('zoho_invoices')
    expect(typeof i.body.data.windowRevenue).toBe('number')
  })
})
