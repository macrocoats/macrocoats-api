import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]
let galvaCookies: string[]

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

  const galvaLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'galva', password: 'gL3mQ9xNvKpR7wYtA2bZeJ8F' })
  galvaCookies = galvaLogin.headers['set-cookie']
})

afterAll(async () => { await app.close() })

const req = () => supertest(app.server)

// ── GET /v1/products/:productLine/:docType ─────────────────────────────────────
describe('GET /v1/products/:productLine/:docType', () => {
  it('superadmin can fetch any TDS', async () => {
    const res = await req()
      .get('/v1/products/uniklean-sp/tds')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('TDS-USP-001')
    expect(res.body.sections).toBeDefined()
  })

  it('superadmin can fetch restricted formula doc', async () => {
    const res = await req()
      .get('/v1/products/uniklean-fe/formula')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('FRM-UFE-001')
    expect(res.body.classification).toContain('CONFIDENTIAL')
  })

  it('company user can fetch allowed product TDS', async () => {
    const res = await req()
      .get('/v1/products/uniklean-sp/tds')
      .set('Cookie', raneCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('TDS-USP-001')
  })

  it('company user cannot fetch formula (restricted doc type)', async () => {
    await req()
      .get('/v1/products/uniklean-sp/formula')
      .set('Cookie', raneCookies)
      .expect(403)
  })

  it('company user cannot fetch a product they are not assigned to', async () => {
    // galva is only assigned unicool-al
    await req()
      .get('/v1/products/uniklean-sp/tds')
      .set('Cookie', galvaCookies)
      .expect(403)
  })

  it('galva can access their assigned product', async () => {
    const res = await req()
      .get('/v1/products/unicool-al/tds')
      .set('Cookie', galvaCookies)
      .expect(200)

    expect(res.body.docNumber).toBe('TDS-UCL-001')
  })

  it('returns 401 with no auth', async () => {
    await req().get('/v1/products/uniklean-sp/tds').expect(401)
  })

  it('returns 404 for unknown product', async () => {
    await req()
      .get('/v1/products/nonexistent/tds')
      .set('Cookie', adminCookies)
      .expect(400)  // invalid productLine enum fails Zod validation
  })
})

// ── GET /v1/products (list) ───────────────────────────────────────────────────
describe('GET /v1/products', () => {
  it('superadmin can list all products', async () => {
    const res = await req()
      .get('/v1/products')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.products)).toBe(true)
    expect(res.body.products.length).toBeGreaterThanOrEqual(5)
  })

  it('company user cannot list products', async () => {
    await req()
      .get('/v1/products')
      .set('Cookie', raneCookies)
      .expect(403)
  })
})

// ── PATCH /v1/products/:productLine/:docType/status ───────────────────────────
// The state machine is a single forward cycle (draft -> pending_review -> qa_review ->
// published -> archived -> draft), plus two backward edges (pending_review -> draft,
// qa_review -> pending_review). Walking forward around the cycle reaches any state from any
// other state in at most 4 hops, so tests can self-heal regardless of leftover state from a
// previous run — the DB persists across test runs, there's no per-test reset.
const STATUS_CYCLE = ['draft', 'pending_review', 'qa_review', 'published', 'archived']

async function forceStatus(productLine: string, docType: string, target: string) {
  const getRes = await req().get(`/v1/products/${productLine}/${docType}`).set('Cookie', adminCookies)
  let current = getRes.body.status as string
  for (let i = 0; i < STATUS_CYCLE.length && current !== target; i++) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
    const res = await req()
      .patch(`/v1/products/${productLine}/${docType}/status`)
      .set('Cookie', adminCookies)
      .send({ status: next })
      .expect(200)
    current = res.body.status
  }
}

describe('PATCH /v1/products/:productLine/:docType/status', () => {
  // unisolve-h3/tds and uniklean-fe/tds are not asserted on elsewhere in this file, so they're safe targets.
  afterAll(async () => {
    await forceStatus('unisolve-h3', 'tds', 'published')
    await forceStatus('uniklean-fe', 'tds', 'published')
  })

  it('superadmin can advance draft -> pending_review -> qa_review -> published', async () => {
    await forceStatus('unisolve-h3', 'tds', 'draft')

    const res1 = await req()
      .patch('/v1/products/unisolve-h3/tds/status')
      .set('Cookie', adminCookies)
      .send({ status: 'pending_review' })
      .expect(200)
    expect(res1.body.status).toBe('pending_review')

    const res2 = await req()
      .patch('/v1/products/unisolve-h3/tds/status')
      .set('Cookie', adminCookies)
      .send({ status: 'qa_review' })
      .expect(200)
    expect(res2.body.status).toBe('qa_review')

    const res3 = await req()
      .patch('/v1/products/unisolve-h3/tds/status')
      .set('Cookie', adminCookies)
      .send({ status: 'published', notes: 'QA sign-off' })
      .expect(200)
    expect(res3.body.status).toBe('published')
  })

  it('rejects skipping a state (draft -> qa_review)', async () => {
    await forceStatus('unisolve-h3', 'tds', 'draft')

    await req()
      .patch('/v1/products/unisolve-h3/tds/status')
      .set('Cookie', adminCookies)
      .send({ status: 'qa_review' })
      .expect(409) // draft -> qa_review is not a valid direct transition
  })

  it('company user cannot transition status', async () => {
    await req()
      .patch('/v1/products/uniklean-sp/tds/status')
      .set('Cookie', raneCookies)
      .send({ status: 'archived' })
      .expect(403)
  })

  it('company user 404s on a non-published document, even one they are allowed to view', async () => {
    // rane is allowed uniklean-fe
    await forceStatus('uniklean-fe', 'tds', 'archived')

    await req()
      .get('/v1/products/uniklean-fe/tds')
      .set('Cookie', raneCookies)
      .expect(404)

    await req()
      .get('/v1/products/uniklean-fe/tds')
      .set('Cookie', adminCookies)
      .expect(200) // superadmin still sees it regardless of status
  })
})

// ── GET /v1/products/:productLine/:docType/audit ───────────────────────────────
describe('GET /v1/products/:productLine/:docType/audit', () => {
  it('superadmin sees audit entries created by prior status transitions', async () => {
    const res = await req()
      .get('/v1/products/unisolve-h3/tds/audit')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.entries)).toBe(true)
    expect(res.body.entries.length).toBeGreaterThan(0)
    expect(res.body.entries[0].action).toBe('status_changed')
  })

  it('company user cannot view audit trail', async () => {
    await req()
      .get('/v1/products/uniklean-sp/tds/audit')
      .set('Cookie', raneCookies)
      .expect(403)
  })
})

// ── GET /v1/products/expiry-summary ────────────────────────────────────────────
describe('GET /v1/products/expiry-summary', () => {
  it('superadmin gets a review-state summary for every document', async () => {
    const res = await req()
      .get('/v1/products/expiry-summary')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.summary)).toBe(true)
    expect(res.body.summary.length).toBeGreaterThanOrEqual(5)
    expect(res.body.summary[0]).toHaveProperty('reviewState')
  })

  it('company user cannot view the expiry summary', async () => {
    await req()
      .get('/v1/products/expiry-summary')
      .set('Cookie', raneCookies)
      .expect(403)
  })
})
