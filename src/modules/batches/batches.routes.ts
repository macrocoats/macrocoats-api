import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { requireRole } from '../../middleware/requireRole.js'
import { AppErrors } from '../../types/errors.js'
import { createBatchSchema, listBatchesQuerySchema, saveCoaSnapshotSchema, setPaymentStatusSchema, releaseBatchSchema, releaseBatchesSchema, setBatchLifecycleSchema } from './batches.schema.js'
import { createBatch, listBatches, getBatchByNumber, deleteBatch, saveCoaSnapshot, clearCoaSnapshot, setPaymentStatus, releaseBatch, releaseBatches, setBatchLifecycle } from './batches.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]
// Operators may VIEW batches (with formula/cost stripped — see toOperatorBatchResponse
// in batches.service.ts) and record CoA results; create from a work order lives in
// production-work-orders. Release, payment, delete stay superadmin — see RBAC notes.
const viewPreHandler = [authenticate, requireAuth, requireRole('superadmin', 'operator')]

export async function batchRoutes(app: FastifyInstance) {
  // ── POST /batches ─────────────────────────────────────────────────────────
  app.post('/', { preHandler }, async (request, reply) => {
    const body = createBatchSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await createBatch(body.data, request.authUser?.id ?? null)

    if ('code' in result && result.code === 'VARIANT_NOT_FOUND') {
      return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    }
    if ('code' in result && result.code === 'VARIANT_NOT_USABLE') {
      return reply.code(409).send({
        error: 'VARIANT_NOT_USABLE',
        message: `Variant '${result.variantName}' is not approved for production use (status: ${result.status})`,
      })
    }
    if ('code' in result && result.code === 'MATERIAL_NOT_FOUND') {
      return reply.code(409).send({ error: result.code, message: `No usable inventory balance exists for ${result.materialName}.` })
    }
    if ('code' in result && result.code === 'INSUFFICIENT_MATERIAL') {
      return reply.code(409).send({ error: result.code, message: `Insufficient ${result.materialName}.`, available: result.available, required: result.required })
    }

    return reply.code(201).send({ data: result })
  })

  // ── GET /batches ──────────────────────────────────────────────────────────
  app.get('/', { preHandler: viewPreHandler }, async (request, reply) => {
    const query = listBatchesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const role = request.authUser!.role === 'operator' ? 'operator' : 'superadmin'
    const result = await listBatches(query.data, role)
    return reply.send(result)
  })

  // ── GET /batches/:batchNumber ─────────────────────────────────────────────
  app.get<{ Params: { batchNumber: string } }>('/:batchNumber', { preHandler: viewPreHandler }, async (request, reply) => {
    const role = request.authUser!.role === 'operator' ? 'operator' : 'superadmin'
    const batch = await getBatchByNumber(request.params.batchNumber, role)
    if (!batch) return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
    return reply.send(batch)
  })

  // ── PATCH /batches/:batchNumber/coa ──────────────────────────────────────
  // Operators record QC results from the production hub; release stays superadmin.
  app.patch<{ Params: { batchNumber: string } }>('/:batchNumber/coa', { preHandler: viewPreHandler }, async (request, reply) => {
    const body = saveCoaSnapshotSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const role = request.authUser!.role === 'operator' ? 'operator' : 'superadmin'
    const batch = await saveCoaSnapshot(request.params.batchNumber, body.data, { id: request.authUser!.id, role })
    if (!batch) return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
    if ('code' in batch) return reply.code(409).send({ error: batch.code, message: 'Released batch QC evidence is immutable.' })
    return reply.send({ data: batch })
  })

  // ── POST /batches/release — bulk QC release, per-batch results ───────────
  app.post('/release', { preHandler }, async (request, reply) => {
    const body = releaseBatchesSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    const results = await releaseBatches(body.data.batchNumbers, request.authUser!.id, body.data.notes)
    return reply.send({ data: { results } })
  })

  app.post<{ Params: { batchNumber: string } }>('/:batchNumber/release', { preHandler }, async (request, reply) => {
    const body = releaseBatchSchema.safeParse(request.body ?? {})
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    const result = await releaseBatch(request.params.batchNumber, request.authUser!.id, body.data.notes, body.data.version)
    if ('code' in result) {
      const status = result.code === 'BATCH_NOT_FOUND' ? 404 : 409
      return reply.code(status).send({ error: result.code, blockingReasons: result.blockingReasons })
    }
    return reply.send({ data: result })
  })

  app.post<{ Params: { batchNumber: string } }>('/:batchNumber/lifecycle', { preHandler }, async (request, reply) => {
    const body = setBatchLifecycleSchema.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    const result = await setBatchLifecycle(request.params.batchNumber, body.data.status, body.data.reason, body.data.version)
    if ('code' in result) {
      const status = result.code === 'BATCH_NOT_FOUND' ? 404 : 409
      return reply.code(status).send({ error: result.code, blockingReasons: result.blockingReasons })
    }
    return reply.send({ data: result })
  })

  // ── PATCH /batches/:batchNumber/payment ──────────────────────────────────
  app.patch<{ Params: { batchNumber: string } }>('/:batchNumber/payment', { preHandler }, async (request, reply) => {
    const body = setPaymentStatusSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const batch = await setPaymentStatus(request.params.batchNumber, body.data.paid)
    if (!batch) return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
    return reply.send({ data: batch })
  })

  // ── DELETE /batches/:batchNumber/coa ─────────────────────────────────────
  app.delete<{ Params: { batchNumber: string } }>('/:batchNumber/coa', { preHandler }, async (request, reply) => {
    const cleared = await clearCoaSnapshot(request.params.batchNumber)
    if (!cleared) return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
    return reply.code(204).send()
  })

  // ── DELETE /batches/:id ───────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/:id', { preHandler }, async (request, reply) => {
    const deleted = await deleteBatch(request.params.id)
    if (!deleted) return reply.code(404).send({ error: AppErrors.BATCH_NOT_FOUND })
    return reply.code(204).send()
  })
}
