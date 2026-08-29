import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

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
    .send({ username: 'admin', password: 'mc2024Xp7NrK9L3vQeJbF2wTa' })
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
    createdCompanyIds.push(company.body.id)

    const updated = await req()
      .patch(`/v1/companies/${company.body.id}`)
      .set('Cookie', adminCookies)
      .send({ allowedProducts: [] })
      .expect(200)

    expect(updated.body.allowedProducts).toEqual([])
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
    createdCompanyIds.push(company.body.id)

    const updated = await req()
      .patch(`/v1/companies/${company.body.id}`)
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

    expect(updated.body.contactPerson).toBeNull()
    expect(updated.body.email).toBeNull()
    expect(updated.body.phone).toBeNull()
    expect(updated.body.gstNumber).toBeNull()
    expect(updated.body.address).toBeNull()
    expect(updated.body.city).toBeNull()
    expect(updated.body.state).toBeNull()
    expect(updated.body.pincode).toBeNull()
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
