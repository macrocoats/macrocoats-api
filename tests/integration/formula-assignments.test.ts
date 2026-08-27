import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let companyId: string
let companyKey: string
let companyPassword: string
let formulaId: string
let secondFormulaId: string
let assignmentId: string

const req = () => supertest(app.server)

const createFormulaBody = (name: string) => ({
  productKey: 'uniklean-sp',
  variantName: name,
  isDefault: false,
  status: 'approved',
  components: [
    { materialName: `Formula Test Material ${Date.now()}`, percentage: 12, unit: 'Kg', sortOrder: 0 },
    { materialName: 'Water', percentage: null, unit: 'L', sortOrder: 1 },
  ],
})

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await req()
    .post('/v1/auth/login')
    .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
  adminCookies = adminLogin.headers['set-cookie']

  companyKey = `formula${Date.now()}`
  const company = await req()
    .post('/v1/companies')
    .set('Cookie', adminCookies)
    .send({
      key: companyKey,
      displayName: `Formula Test Company ${Date.now()}`,
      allowedProducts: [],
    })
    .expect(201)

  companyId = company.body.id
  companyPassword = company.body.accessToken
})

afterAll(async () => {
  if (assignmentId) {
    await req().delete(`/v1/companies/${companyId}/formulas/${assignmentId}`).set('Cookie', adminCookies).catch(() => {})
  }
  if (formulaId) {
    await req().delete(`/v1/formulation-variants/${formulaId}`).set('Cookie', adminCookies).catch(() => {})
  }
  if (secondFormulaId) {
    await req().delete(`/v1/formulation-variants/${secondFormulaId}`).set('Cookie', adminCookies).catch(() => {})
  }
  if (companyId) {
    await req().delete(`/v1/companies/${companyId}`).set('Cookie', adminCookies).catch(() => {})
  }
  await app.close()
})

describe('formula-first company assignments', () => {
  it('creates shared formulas, assigns one to a company, and scopes company reads', async () => {
    const formula = await req()
      .post('/v1/formulation-variants')
      .set('Cookie', adminCookies)
      .send(createFormulaBody(`Shared Formula ${Date.now()}`))
      .expect(201)
    formulaId = formula.body.data.id

    const second = await req()
      .post('/v1/formulation-variants')
      .set('Cookie', adminCookies)
      .send(createFormulaBody(`Conflict Formula ${Date.now()}`))
      .expect(201)
    secondFormulaId = second.body.data.id

    const library = await req()
      .get('/v1/formulation-variants')
      .query({ q: formula.body.data.variantName })
      .set('Cookie', adminCookies)
      .expect(200)
    expect(library.body.data.some((row: { id: string; assignedCompanyCount: number }) => row.id === formulaId && row.assignedCompanyCount === 0)).toBe(true)

    const assigned = await req()
      .post(`/v1/companies/${companyId}/formulas`)
      .set('Cookie', adminCookies)
      .send({ variantId: formulaId, isDefaultForCompany: true })
      .expect(201)
    assignmentId = assigned.body.data.assignmentId
    expect(assigned.body.data.isDefaultForCompany).toBe(true)

    await req()
      .post(`/v1/companies/${companyId}/formulas`)
      .set('Cookie', adminCookies)
      .send({ variantId: secondFormulaId, isDefaultForCompany: true })
      .expect(409)

    const formulas = await req()
      .get(`/v1/companies/${companyId}/formulas`)
      .set('Cookie', adminCookies)
      .expect(200)
    expect(formulas.body.data.map((row: { variantId: string }) => row.variantId)).toContain(formulaId)

    const companyLogin = await req()
      .post('/v1/auth/login')
      .send({ username: companyKey, password: companyPassword })
      .expect(200)
    const companyCookies = companyLogin.headers['set-cookie']

    const companyList = await req()
      .get('/v1/formulation-variants')
      .query({ productKey: 'uniklean-sp' })
      .set('Cookie', companyCookies)
      .expect(200)
    expect(companyList.body.data.some((row: { id: string; components?: unknown[] }) => row.id === formulaId && !row.components)).toBe(true)

    await req()
      .get(`/v1/formulation-variants/${secondFormulaId}`)
      .set('Cookie', companyCookies)
      .expect(404)

    await req()
      .get('/v1/products/uniklean-sp/tds')
      .query({ variantId: formulaId })
      .set('Cookie', companyCookies)
      .expect(200)

    const unassigned = await req()
      .delete(`/v1/companies/${companyId}/formulas/${assignmentId}`)
      .set('Cookie', adminCookies)
      .expect(200)
    expect(unassigned.body.data.removedProductAccess).toBe(true)
    assignmentId = ''

    const refreshedCompanyLogin = await req()
      .post('/v1/auth/login')
      .send({ username: companyKey, password: companyPassword })
      .expect(200)

    await req()
      .get('/v1/products/uniklean-sp/tds')
      .query({ variantId: formulaId })
      .set('Cookie', refreshedCompanyLogin.headers['set-cookie'])
      .expect(403)
  })
})
