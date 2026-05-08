import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { createSalaryRecordSchema } from './salaryRecords.schema.js'
import {
  saveSalaryRecord, listSalaryRecords, getSalaryRecordById,
} from './salaryRecords.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function salaryRecordRoutes(app: FastifyInstance) {
  // ── POST /salary-records ──────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createSalaryRecordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const record = await saveSalaryRecord(body.data)
    return reply.code(201).send({ salaryRecord: record })
  })

  // ── GET /salary-records ───────────────────────────────────────────────────
  app.get('/', { preHandler }, async (request, reply) => {
    const q = request.query as Record<string, string>
    const filters = {
      staffId: q.staffId   || undefined,
      month:   q.month     ? parseInt(q.month, 10)  : undefined,
      year:    q.year      ? parseInt(q.year, 10)   : undefined,
    }

    const records = await listSalaryRecords(filters)
    return reply.send({ salaryRecords: records })
  })

  // ── GET /salary-records/:id ───────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const record = await getSalaryRecordById(request.params.id)
    if (!record) return reply.code(404).send({ error: 'SALARY_RECORD_NOT_FOUND' })
    return reply.send({ salaryRecord: record })
  })
}
