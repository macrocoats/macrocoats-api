import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { ADMIN_PASSWORD } from '../helpers/credentials.js'

let app: FastifyInstance
let adminCookies: string[]
const createdCompanyIds: string[] = []

const req = () => supertest(app.server)
const uniqueKey = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  const adminLogin = await req()
    .post('/v1/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD })
    .expect(200)
  adminCookies = adminLogin.headers['set-cookie']
})

afterAll(async () => {
  for (const id of createdCompanyIds) {
    await req().delete(`/v1/companies/${id}`).set('Cookie', adminCookies).catch(() => {})
  }
  await app.close()
})

describe('companies CRUD', () => {
  it('updates product access to an empty list without failing', async () => {
    const company = await req()
      .post('/v1/companies')
      .set('Cookie', adminCookies)
      .send({
        key: uniqueKey('access'),
        displayName: 'Access Reset Industries',
        allowedProducts: ['uniklean-sp'],
      })
      .expect(201)
    createdCompanyIds.push(company.body.data.id)

    const updated = await req()
      .patch(`/v1/companies/${company.body.data.id}`)
      .set('Cookie', adminCookies)
      .send({ allowedProducts: [] })
      .expect(200)

    expect(updated.body.data.allowedProducts).toEqual([])
  })

  it('clears optional contact fields when patch values are null', async () => {
    const company = await req()
      .post('/v1/companies')
      .set('Cookie', adminCookies)
      .send({
        key: uniqueKey('clear'),
        displayName: 'Clearable Contact Industries',
        allowedProducts: [],
        contactPerson: 'Ravi Kumar',
        email: 'ravi@example.com',
        phone: '9876543210',
        gstNumber: '33AABCR1234F1Z5',
        address: 'Factory Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
      })
      .expect(201)
    createdCompanyIds.push(company.body.data.id)

    const updated = await req()
      .patch(`/v1/companies/${company.body.data.id}`)
      .set('Cookie', adminCookies)
      .send({
        contactPerson: null,
        email: null,
        phone: null,
        gstNumber: null,
        address: null,
        city: null,
        state: null,
        pincode: null,
      })
      .expect(200)

    expect(updated.body.data.contactPerson).toBeNull()
    expect(updated.body.data.email).toBeNull()
    expect(updated.body.data.phone).toBeNull()
    expect(updated.body.data.gstNumber).toBeNull()
    expect(updated.body.data.address).toBeNull()
    expect(updated.body.data.city).toBeNull()
    expect(updated.body.data.state).toBeNull()
    expect(updated.body.data.pincode).toBeNull()
  })

  it('preserves create validation for invalid company fields', async () => {
    const invalid = await req()
      .post('/v1/companies')
      .set('Cookie', adminCookies)
      .send({
        key: uniqueKey('bad'),
        displayName: 'Invalid Field Industries',
        allowedProducts: [],
        email: 'not-an-email',
        phone: '123',
        gstNumber: 'bad-gst',
        pincode: '123',
      })
      .expect(400)

    expect(invalid.body.error).toBe('VALIDATION_ERROR')
    expect(invalid.body.issues.fieldErrors.email).toBeTruthy()
    expect(invalid.body.issues.fieldErrors.phone).toBeTruthy()
    expect(invalid.body.issues.fieldErrors.gstNumber).toBeTruthy()
    expect(invalid.body.issues.fieldErrors.pincode).toBeTruthy()
  })
})

describe('customer login management', () => {
  it('lets an admin set the login password and reset the access link', async () => {
    const key = uniqueKey('login')
    const created = await req()
      .post('/v1/companies')
      .set('Cookie', adminCookies)
      .send({ key, displayName: 'Login Reset Industries', allowedProducts: ['uniklean-sp'] })
      .expect(201)
    const { id, accessToken } = created.body.data
    createdCompanyIds.push(id)

    const detail = await req().get(`/v1/companies/${id}`).set('Cookie', adminCookies).expect(200)
    expect(detail.body.data.loginUsername).toBe(key)

    // A customer session that the password change must end.
    const session = await req().post('/v1/auth/login').send({ username: key, password: accessToken }).expect(200)

    await req().post(`/v1/companies/${id}/password`).set('Cookie', adminCookies).send({ newPassword: 'short' }).expect(400)
    await req().post(`/v1/companies/00000000-0000-0000-0000-000000000000/password`).set('Cookie', adminCookies).send({ newPassword: 'a-long-enough-password' }).expect(404)
    await req().post(`/v1/companies/${id}/password`).set('Cookie', session.headers['set-cookie']).send({ newPassword: 'a-long-enough-password' }).expect(403)

    await req().post(`/v1/companies/${id}/password`).set('Cookie', adminCookies).send({ newPassword: 'a-long-enough-password' }).expect(200)
    await req().post('/v1/auth/login').send({ username: key, password: 'a-long-enough-password' }).expect(200)
    await req().post('/v1/auth/login').send({ username: key, password: accessToken }).expect(401)
    await req().post('/v1/auth/refresh').set('Cookie', session.headers['set-cookie']).expect(401)
    // The access link is separate from the password and still works until the token is rotated.
    await req().post('/v1/auth/token').send({ token: accessToken }).expect(200)

    const rotated = await req().post(`/v1/companies/${id}/rotate-token`).set('Cookie', adminCookies).expect(200)
    await req().post('/v1/auth/token').send({ token: accessToken }).expect(401)
    await req().post('/v1/auth/token').send({ token: rotated.body.data.accessToken }).expect(200)
  })
})
