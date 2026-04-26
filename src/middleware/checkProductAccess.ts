import type { FastifyRequest, FastifyReply } from 'fastify'
import { RESTRICTED_DOC_TYPES } from '../types/index.js'
import type { DocType } from '../types/index.js'

interface ProductParams {
  productLine: string
  docType:     string
}

/**
 * Checks that the authenticated user can access:
 *   1. The requested productLine (company users have an allowedProducts list)
 *   2. The requested docType (formula/label/coa are superadmin-only)
 *
 * Always chain after `requireAuth`.
 */
export async function checkProductAccess(
  request: FastifyRequest<{ Params: ProductParams }>,
  reply: FastifyReply,
): Promise<void> {
  const user       = request.authUser!
  const { productLine, docType } = request.params

  // Superadmin bypasses all product / docType checks
  if (user.role === 'superadmin') return

  // Restricted doc types (formula, label, coa) are superadmin-only
  if (RESTRICTED_DOC_TYPES.includes(docType as DocType)) {
    return reply.code(403).send({ error: 'DOC_TYPE_RESTRICTED' })
  }

  // Company users: check allowedProducts list
  const allowed = user.allowedProducts ?? []
  if (!allowed.includes(productLine)) {
    return reply.code(403).send({ error: 'PRODUCT_ACCESS_DENIED' })
  }
}
