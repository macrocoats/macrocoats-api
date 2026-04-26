import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

let app: FastifyInstance
let adminCookies: string[]
let raneCookies: string[]

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
})

afterAll(async () => { await app.close() })

const req = () => supertest(app.server)

describe('GET /v1/inventory', () => {
  it('superadmin can list inventory items', async () => {
    const res = await req()
      .get('/v1/inventory')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items.length).toBeGreaterThanOrEqual(23)

    const item = res.body.items[0]
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('material')
    expect(item).toHaveProperty('unit')
    expect(item).toHaveProperty('price')
  })

  it('company user cannot access inventory', async () => {
    await req()
      .get('/v1/inventory')
      .set('Cookie', raneCookies)
      .expect(403)
  })

  it('returns 401 with no auth', async () => {
    await req().get('/v1/inventory').expect(401)
  })
})

describe('POST /v1/inventory', () => {
  it('superadmin can create an inventory item', async () => {
    const res = await req()
      .post('/v1/inventory')
      .set('Cookie', adminCookies)
      .send({ material: 'Test Chemical X', unit: 'Kg', price: 99.5, stock: '10kg', supplier: 'Test Co' })
      .expect(201)

    expect(res.body.material).toBe('Test Chemical X')
    expect(res.body.price).toBe(99.5)
    expect(res.body.id).toBeDefined()

    // Cleanup
    await req()
      .delete(`/v1/inventory/${res.body.id}`)
      .set('Cookie', adminCookies)
      .expect(204)
  })

  it('rejects invalid unit', async () => {
    await req()
      .post('/v1/inventory')
      .set('Cookie', adminCookies)
      .send({ material: 'Bad Item', unit: 'mL', price: 10 })
      .expect(400)
  })
})

describe('PATCH /v1/inventory/:id', () => {
  it('superadmin can update an inventory item', async () => {
    // Create first
    const created = await req()
      .post('/v1/inventory')
      .set('Cookie', adminCookies)
      .send({ material: 'Patch Test', unit: 'L', price: 50 })

    const id = created.body.id

    const res = await req()
      .patch(`/v1/inventory/${id}`)
      .set('Cookie', adminCookies)
      .send({ price: 75, supplier: 'New Supplier' })
      .expect(200)

    expect(res.body.price).toBe(75)
    expect(res.body.supplier).toBe('New Supplier')

    // Cleanup
    await req().delete(`/v1/inventory/${id}`).set('Cookie', adminCookies)
  })

  it('returns 404 for unknown id', async () => {
    await req()
      .patch('/v1/inventory/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies)
      .send({ price: 10 })
      .expect(404)
  })
})

describe('POST /v1/inventory/reset', () => {
  it('superadmin can reset inventory to defaults', async () => {
    const res = await req()
      .post('/v1/inventory/reset')
      .set('Cookie', adminCookies)
      .expect(200)

    expect(Array.isArray(res.body.items)).toBe(true)
    // Default materials should include "Sodium Nitrite"
    const hasNitrite = res.body.items.some((i: { material: string }) =>
      i.material.includes('Sodium Nitrite'),
    )
    expect(hasNitrite).toBe(true)
  })
})
