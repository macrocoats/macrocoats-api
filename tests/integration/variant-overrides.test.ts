import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

let app: FastifyInstance
let adminCookies: string[]
let variantId: string

const req = () => supertest(app.server)

const hazardOverride = {
  signalWord: 'DANGER',
  pictograms: ['flammable', 'healthhazard'],
  classifications: [{ class: 'Aspiration Hazard', category: 'Category 1', tagType: 'danger' }],
  hStatements: 'H304 — May be fatal if swallowed and enters airways.',
  pStatements: 'P301 + P310 — IF SWALLOWED: Immediately call a POISON CENTER or doctor/physician.',
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await req()
    .post('/v1/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = adminLogin.headers['set-cookie']

  // Draft status so the variant never becomes a "usable" default on live pages mid-test.
  const variant = await req()
    .post('/v1/formulation-variants')
    .set('Cookie', adminCookies)
    .send({
      productKey: 'uniklean-sp',
      variantName: `Override Test Variant ${Date.now()}`,
      isDefault: false,
      status: 'draft',
      components: [{ materialName: 'Water', percentage: null, unit: 'L', sortOrder: 0 }],
    })
    .expect(201)
  variantId = variant.body.data.id
})

afterAll(async () => {
  if (variantId) {
    await req().delete(`/v1/formulation-variants/${variantId}`).set('Cookie', adminCookies).catch(() => {})
  }
  await app.close()
})

describe('formulation-variant TDS/MSDS overrides', () => {
  it('persists and returns an internal formula preparation override', async () => {
    const formulaOverrides = {
      preparationStatus: 'draft_review_required',
      preparation: [{
        step: 1,
        title: 'Charge carrier',
        detail: 'Charge under controlled agitation.',
        materialNames: ['Water'],
      }],
    }

    const updated = await req()
      .put(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .send({ formulaOverrides })
      .expect(200)

    expect(updated.body.data.formulaOverrides).toEqual(formulaOverrides)

    const fetched = await req()
      .get(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .expect(200)

    expect(fetched.body.data.formulaOverrides).toEqual(formulaOverrides)
  })

  it('rejects an unknown override key', async () => {
    await req()
      .put(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .send({ tdsOverrides: { flashPoint: '> 35 °C' } })
      .expect(400)
  })

  it('rejects a malformed override section', async () => {
    await req()
      .put(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .send({ msdsOverrides: { physical: 'Flash point > 35 °C' } })
      .expect(400)
  })

  it('merges set TDS keys and keeps base values for unset keys', async () => {
    const base = await req().get('/v1/products/uniklean-sp/tds').set('Cookie', adminCookies).expect(200)

    await req()
      .put(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .send({
        tdsOverrides: {
          description: 'Variant description',
          physicalProperties: [{ property: 'Flash Point', value: '40', unit: '°C', method: 'ASTM D93' }],
        },
      })
      .expect(200)

    const res = await req()
      .get('/v1/products/uniklean-sp/tds')
      .query({ variantId })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data.description).toBe('Variant description')
    expect(res.body.data.sections.physicalProperties).toEqual([
      { property: 'Flash Point', value: '40', unit: '°C', method: 'ASTM D93' },
    ])
    expect(res.body.data.grade).toBe(base.body.data.grade)
    expect(res.body.data.sections.features).toEqual(base.body.data.sections.features)
  })

  it('merges MSDS sections and applies hazardOverride', async () => {
    const base = await req().get('/v1/products/uniklean-sp/msds').set('Cookie', adminCookies).expect(200)

    await req()
      .put(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .send({
        msdsOverrides: {
          physical: [{ key: 'Flash Point', val: '40 °C (ASTM D93)' }],
          transport: 'UN 1300, Class 3, PG III',
          hazardOverride,
        },
      })
      .expect(200)

    const res = await req()
      .get('/v1/products/uniklean-sp/msds')
      .query({ variantId })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data.sections.physical).toEqual([{ key: 'Flash Point', val: '40 °C (ASTM D93)' }])
    expect(res.body.data.sections.transport).toBe('UN 1300, Class 3, PG III')
    expect(res.body.data.signalWord).toBe('DANGER')
    expect(res.body.data.sections.hazards.pictograms).toEqual(['flammable', 'healthhazard'])
    expect(res.body.data.sections.firstAid).toEqual(base.body.data.sections.firstAid)
  })

  it('reads legacy hazards + signalWord as a hazardOverride alias', async () => {
    const { signalWord, ...hazards } = hazardOverride
    await req()
      .put(`/v1/formulation-variants/${variantId}`)
      .set('Cookie', adminCookies)
      .send({ msdsOverrides: { hazards, signalWord: 'Warning' } })
      .expect(200)

    const res = await req()
      .get('/v1/products/uniklean-sp/msds')
      .query({ variantId })
      .set('Cookie', adminCookies)
      .expect(200)

    expect(res.body.data.signalWord).toBe('Warning')
    expect(res.body.data.sections.hazards.hStatements).toBe(hazards.hStatements)
    void signalWord
  })

  it('serves the base document unchanged without a variantId', async () => {
    const res = await req().get('/v1/products/uniklean-sp/tds').set('Cookie', adminCookies).expect(200)
    expect(res.body.data.description).not.toBe('Variant description')
  })
})
