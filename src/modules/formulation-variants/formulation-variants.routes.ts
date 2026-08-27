import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { resolveCompanyId } from '../../utils/resolveCompanyId.js'
import {
  createVariantSchema,
  updateVariantSchema,
  replaceComponentsSchema,
  transitionStatusSchema,
  listVariantsQuerySchema,
} from './formulation-variants.schema.js'
import {
  listVariantsForProduct,
  listFormulaLibrary,
  getVariantById,
  createVariant,
  updateVariant,
  replaceComponents,
  deleteVariant,
  transitionVariantStatus,
  isFormulaAssignedToCompany,
} from './formulation-variants.service.js'
import type { VariantStatus } from '../optimizer/optimizer.types.js'

const adminHandler = [authenticate, requireAuth, requireSuperAdmin]
const readHandler  = [authenticate, requireAuth]

export async function formulationVariantRoutes(app: FastifyInstance) {
  // ── GET /formulation-variants?productKey=X ────────────────────────────────
  app.get('/', { preHandler: readHandler }, async (request, reply) => {
    const query = listVariantsQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const role = request.authUser?.role
    if (role !== 'superadmin' && query.data.productKey) {
      const allowed = request.authUser?.allowedProducts ?? []
      if (!allowed.includes(query.data.productKey)) {
        return reply.code(403).send({ error: AppErrors.PRODUCT_ACCESS_DENIED })
      }
    }

    const companyId = role !== 'superadmin' ? await resolveCompanyId(request.authUser?.companyName) : null
    const variants = query.data.productKey && !query.data.companyId && !query.data.status && !query.data.q
      ? await listVariantsForProduct(query.data.productKey, { role, companyId })
      : await listFormulaLibrary(query.data, { role, companyId })
    return reply.send({ data: variants })
  })

  // ── GET /formulation-variants/:variantId ──────────────────────────────────
  app.get<{ Params: { variantId: string } }>('/:variantId', { preHandler: readHandler }, async (request, reply) => {
    const role = request.authUser?.role
    const includeInternal = role === 'superadmin'

    // Always fetch first (existing 404-if-missing check stays first, per plan) —
    // the trimmed/full shape is decided by includeInternal below, but companyId
    // survives trimming so the ownership check afterward still works.
    const variant = await getVariantById(request.params.variantId, includeInternal)
    if (!variant) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })

    if (role !== 'superadmin') {
      const allowed = request.authUser?.allowedProducts ?? []
      if (!allowed.includes(variant.productKey)) {
        return reply.code(403).send({ error: AppErrors.PRODUCT_ACCESS_DENIED })
      }

      if (variant.companyId) {
        const companyId = await resolveCompanyId(request.authUser?.companyName)
        if (variant.companyId !== companyId) {
          // 404, not 403 — avoids confirming to a company user that another
          // tenant's variant exists for this product.
          return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
        }
      } else {
        const companyId = await resolveCompanyId(request.authUser?.companyName)
        if (!companyId || !(await isFormulaAssignedToCompany(variant.id, companyId))) {
          return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
        }
      }
    }

    return reply.send({ data: variant })
  })

  // ── POST /formulation-variants ────────────────────────────────────────────
  app.post('/', { preHandler: adminHandler }, async (request, reply) => {
    const body = createVariantSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    try {
      const variant = await createVariant(body.data)
      return reply.code(201).send({ data: variant })
    } catch (err: any) {
      if (err?.code === '23505') {
        // Only the partial unique index on (productKey, companyId) WHERE is_default
        // can fire now — multiple non-default variants per product+company are allowed.
        return reply.code(409).send({
          error: 'VARIANT_EXISTS',
          message: 'A default variant for this product+company already exists. Only one default variant is allowed per product+company.',
        })
      }
      throw err
    }
  })

  // ── PUT /formulation-variants/:variantId ──────────────────────────────────
  app.put<{ Params: { variantId: string } }>('/:variantId', { preHandler: adminHandler }, async (request, reply) => {
    const body = updateVariantSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const variant = await updateVariant(request.params.variantId, body.data)
    if (!variant) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    return reply.send({ data: variant })
  })

  // ── PUT /formulation-variants/:variantId/components ───────────────────────
  app.put<{ Params: { variantId: string } }>('/:variantId/components', { preHandler: adminHandler }, async (request, reply) => {
    const body = replaceComponentsSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const existing = await getVariantById(request.params.variantId)
    if (!existing) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })

    const components = await replaceComponents(request.params.variantId, body.data.components)
    return reply.send({ data: components })
  })

  // ── PATCH /formulation-variants/:variantId/status ──────────────────────────
  app.patch<{ Params: { variantId: string } }>('/:variantId/status', { preHandler: adminHandler }, async (request, reply) => {
    const body = transitionStatusSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await transitionVariantStatus(request.params.variantId, body.data.status as VariantStatus)

    if (result === null) {
      return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    }
    if (result === 'invalid_transition') {
      return reply.code(409).send({
        error: AppErrors.INVALID_STATUS_TRANSITION,
        message: `Cannot transition variant to status '${body.data.status}' from its current status.`,
      })
    }

    return reply.send({ data: result })
  })

  // ── DELETE /formulation-variants/:variantId ───────────────────────────────
  app.delete<{ Params: { variantId: string } }>('/:variantId', { preHandler: adminHandler }, async (request, reply) => {
    const deleted = await deleteVariant(request.params.variantId)
    if (!deleted) return reply.code(404).send({ error: 'VARIANT_NOT_FOUND' })
    if (deleted === 'assigned') {
      return reply.code(409).send({
        error: 'FORMULA_ASSIGNED',
        message: 'This formula is assigned to one or more companies. Unassign it before deleting.',
      })
    }
    if (deleted === 'protected_status') {
      return reply.code(409).send({
        error: 'FORMULA_PROTECTED_STATUS',
        message: 'Production formulas cannot be deleted.',
      })
    }
    return reply.code(204).send()
  })
}
