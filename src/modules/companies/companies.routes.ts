import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createCompanySchema, updateCompanySchema, assignCompanyFormulaSchema, updateCompanyFormulaAssignmentSchema } from './companies.schema.js'
import {
  listCompanies, getCompanyById, createCompany,
  updateCompany, rotateCompanyToken, deleteCompany,
} from './companies.service.js'
import {
  assignFormulaToCompany,
  listCompanyFormulaAssignments,
  unassignFormulaFromCompany,
  updateCompanyFormulaAssignment,
} from '../formulation-variants/formulation-variants.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function companyRoutes(app: FastifyInstance) {
  // ── GET /companies ────────────────────────────────────────────────────────
  app.get('/', { preHandler }, async (_request, reply) => {
    const list = await listCompanies()
    return reply.send({ companies: list })
  })

  // ── GET /companies/:id/formulas ───────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/formulas', { preHandler }, async (request, reply) => {
    const company = await getCompanyById(request.params.id)
    if (!company) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })

    const formulas = await listCompanyFormulaAssignments(request.params.id)
    return reply.send({ data: formulas })
  })

  // ── POST /companies/:id/formulas ──────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/formulas', { preHandler }, async (request, reply) => {
    const body = assignCompanyFormulaSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await assignFormulaToCompany(
      request.params.id,
      body.data.variantId,
      body.data.isDefaultForCompany,
      request.authUser?.id,
    )

    if (!result) return reply.code(404).send({ error: AppErrors.NOT_FOUND })
    if (result === 'default_exists') {
      return reply.code(409).send({
        error: 'DEFAULT_FORMULA_EXISTS',
        message: 'This company already has a default formula for this product.',
      })
    }

    return reply.code(201).send({ data: result })
  })

  // ── PATCH /companies/:id/formulas/:assignmentId ───────────────────────────
  app.patch<{ Params: { id: string; assignmentId: string } }>('/:id/formulas/:assignmentId', { preHandler }, async (request, reply) => {
    const body = updateCompanyFormulaAssignmentSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await updateCompanyFormulaAssignment(request.params.assignmentId, body.data.isDefaultForCompany)
    if (!result || result.companyId !== request.params.id) return reply.code(404).send({ error: AppErrors.NOT_FOUND })
    return reply.send({ data: result })
  })

  // ── DELETE /companies/:id/formulas/:assignmentId ──────────────────────────
  app.delete<{ Params: { id: string; assignmentId: string } }>('/:id/formulas/:assignmentId', { preHandler }, async (request, reply) => {
    const result = await unassignFormulaFromCompany(request.params.id, request.params.assignmentId)
    if (!result) return reply.code(404).send({ error: AppErrors.NOT_FOUND })
    return reply.send({ data: result })
  })

  // ── GET /companies/:id ────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const company = await getCompanyById(request.params.id)
    if (!company) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })
    return reply.send(company)
  })

  // ── POST /companies ───────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createCompanySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    try {
      const company = await createCompany(body.data)
      return reply.code(201).send(company)
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.code(409).send({ error: AppErrors.COMPANY_KEY_EXISTS, message: `A company with key "${body.data.key}" already exists.` })
      }
      throw err
    }
  })

  // ── PATCH /companies/:id ──────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const body = updateCompanySchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const company = await updateCompany(request.params.id, body.data)
    if (!company) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })

    return reply.send(company)
  })

  // ── POST /companies/:id/rotate-token ──────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/rotate-token', { preHandler }, async (request, reply) => {
    const company = await getCompanyById(request.params.id)
    if (!company) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })

    const result = await rotateCompanyToken(request.params.id)
    return reply.send(result)
  })

  // ── DELETE /companies/:id ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteCompany(request.params.id)
    if (!deleted) return reply.code(404).send({ error: AppErrors.COMPANY_NOT_FOUND })
    return reply.code(204).send()
  })
}
