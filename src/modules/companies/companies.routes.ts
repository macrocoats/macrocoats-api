import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { createCompanySchema, updateCompanySchema } from './companies.schema.js'
import {
  listCompanies, getCompanyById, createCompany,
  updateCompany, rotateCompanyToken, deleteCompany,
} from './companies.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function companyRoutes(app: FastifyInstance) {
  // ── GET /companies ────────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (_request, reply) => {
    const list = await listCompanies()
    return reply.send({ companies: list })
  })

  // ── GET /companies/:id ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const company = await getCompanyById(request.params.id)
    if (!company) return reply.code(404).send({ error: 'COMPANY_NOT_FOUND' })
    return reply.send(company)
  })

  // ── POST /companies ───────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createCompanySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const company = await createCompany(body.data)
    return reply.code(201).send(company)
  })

  // ── PATCH /companies/:id ──────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateCompanySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const company = await updateCompany(request.params.id, body.data)
    if (!company) return reply.code(404).send({ error: 'COMPANY_NOT_FOUND' })

    return reply.send(company)
  })

  // ── POST /companies/:id/rotate-token ──────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/rotate-token', { preHandler }, async (request, reply) => {
    const company = await getCompanyById(request.params.id)
    if (!company) return reply.code(404).send({ error: 'COMPANY_NOT_FOUND' })

    const result = await rotateCompanyToken(request.params.id)
    return reply.send(result)
  })

  // ── DELETE /companies/:id ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteCompany(request.params.id)
    if (!deleted) return reply.code(404).send({ error: 'COMPANY_NOT_FOUND' })
    return reply.code(204).send()
  })
}
