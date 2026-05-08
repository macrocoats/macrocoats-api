import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createSalaryRecordSchema, listSalaryRecordsQuerySchema } from './salaryRecords.schema.js'
import {
  saveSalaryRecord, listSalaryRecords, getSalaryRecordById,
} from './salaryRecords.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function salaryRecordRoutes(app: FastifyInstance) {
  // ── POST /salary-records ──────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createSalaryRecordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const record = await saveSalaryRecord(body.data)
    return reply.code(201).send({ salaryRecord: record })
  })

  // ── GET /salary-records ───────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listSalaryRecordsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const records = await listSalaryRecords(query.data)
    return reply.send({ salaryRecords: records })
  })

  // ── GET /salary-records/:id ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const record = await getSalaryRecordById(request.params.id)
    if (!record) return reply.code(404).send({ error: AppErrors.SALARY_RECORD_NOT_FOUND })
    return reply.send({ salaryRecord: record })
  })
}
