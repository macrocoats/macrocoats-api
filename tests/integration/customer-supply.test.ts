import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

let app: FastifyInstance
let adminCookies: string[]
let createdId: string | null = null

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await supertest(app.server)
    .post('/v1/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD })
  adminCookies = adminLogin.headers['set-cookie']
})

afterAll(async () => {
  if (createdId) {
    await supertest(app.server).delete(`/v1/customer-supply/pipeline/${createdId}`).set('Cookie', adminCookies)
  }
  await app.close()
})

describe('customer-supply', () => {
  it('requires a session', async () => {
    const res = await supertest(app.server).get('/v1/customer-supply/pipeline')
    expect(res.status).toBe(401)
  })

  it('rejects an inverted date window', async () => {
    const res = await supertest(app.server)
      .get('/v1/customer-supply/summary?from=2026-10-01&to=2026-09-01')
      .set('Cookie', adminCookies)
    expect(res.status).toBe(400)
  })

  it('creates, updates, archives and deletes a pipeline entry', async () => {
    const created = await supertest(app.server)
      .post('/v1/customer-supply/pipeline')
      .set('Cookie', adminCookies)
      .send({ companyName: 'Test Prospect (integration)', location: 'Chennai', trialStatus: 'completed', vendorRegistration: 'awaiting' })
    expect(created.status).toBe(201)
    createdId = created.body.data.id
    expect(created.body.data).toMatchObject({ trialStatus: 'completed', vendorRegistration: 'awaiting', archived: false })

    const invalid = await supertest(app.server)
      .patch(`/v1/customer-supply/pipeline/${createdId}`)
      .set('Cookie', adminCookies)
      .send({ trialStatus: 'shipped' })
    expect(invalid.status).toBe(400)

    const updated = await supertest(app.server)
      .patch(`/v1/customer-supply/pipeline/${createdId}`)
      .set('Cookie', adminCookies)
      .send({ vendorRegistration: 'registered', archived: true })
    expect(updated.status).toBe(200)
    expect(updated.body.data).toMatchObject({ vendorRegistration: 'registered', archived: true })

    const active = await supertest(app.server).get('/v1/customer-supply/pipeline').set('Cookie', adminCookies)
    expect(active.body.data.some((r: { id: string }) => r.id === createdId)).toBe(false)
    const withArchived = await supertest(app.server).get('/v1/customer-supply/pipeline?includeArchived=true').set('Cookie', adminCookies)
    expect(withArchived.body.data.some((r: { id: string }) => r.id === createdId)).toBe(true)

    const deleted = await supertest(app.server).delete(`/v1/customer-supply/pipeline/${createdId}`).set('Cookie', adminCookies)
    expect(deleted.status).toBe(204)
    createdId = null
  })
})
