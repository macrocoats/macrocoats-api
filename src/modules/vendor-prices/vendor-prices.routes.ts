import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createVendorPriceSchema, listVendorPricesQuerySchema, effectivePriceQuerySchema } from './vendor-prices.schema.js'
import {
  listVendorPrices, listActiveVendorPrices, createVendorPrice, getEffectivePrice, vendorExists,
} from './vendor-prices.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

/**
 * Nested under /vendors (registered with prefix `${prefix}/vendors` in
 * app.ts) — mirrors how company-pricing nests under /companies/:id.
 */
export async function vendorPriceRoutes(app: FastifyInstance) {
  // ── GET /vendors/:vendorId/prices ─────────────────────────────────────────
  app.get<{ Params: { vendorId: string } }>('/:vendorId/prices', { preHandler }, async (request, reply) => {
    const query = listVendorPricesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    if (!(await vendorExists(request.params.vendorId))) {
      return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })
    }

    const prices = await listVendorPrices(request.params.vendorId, query.data.inventoryItemId)
    return reply.send({ data: prices })
  })

  // ── GET /vendors/:vendorId/prices/active ──────────────────────────────────
  app.get<{ Params: { vendorId: string } }>('/:vendorId/prices/active', { preHandler }, async (request, reply) => {
    const query = listVendorPricesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    if (!(await vendorExists(request.params.vendorId))) {
      return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })
    }

    const prices = await listActiveVendorPrices(request.params.vendorId, query.data.inventoryItemId)
    return reply.send({ data: prices })
  })

  // ── GET /vendors/:vendorId/prices/effective ───────────────────────────────
  app.get<{ Params: { vendorId: string } }>('/:vendorId/prices/effective', { preHandler }, async (request, reply) => {
    const query = effectivePriceQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    if (!(await vendorExists(request.params.vendorId))) {
      return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })
    }

    const price = await getEffectivePrice(request.params.vendorId, query.data.inventoryItemId, query.data.date)
    return reply.send({ data: price })
  })

  // ── POST /vendors/:vendorId/prices ────────────────────────────────────────
  app.post<{ Params: { vendorId: string } }>('/:vendorId/prices', { preHandler }, async (request, reply) => {
    const body = createVendorPriceSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const result = await createVendorPrice(request.params.vendorId, body.data, request.authUser?.id ?? null)

    if ('code' in result && result.code === 'VENDOR_NOT_FOUND') {
      return reply.code(404).send({ error: AppErrors.VENDOR_NOT_FOUND })
    }
    if ('code' in result && result.code === 'ITEM_NOT_FOUND') {
      return reply.code(404).send({ error: AppErrors.ITEM_NOT_FOUND })
    }
    if ('code' in result && result.code === 'INVALID_EFFECTIVE_DATE') {
      return reply.code(400).send({
        error:                AppErrors.VENDOR_PRICE_INVALID_EFFECTIVE_DATE,
        currentEffectiveFrom: result.currentEffectiveFrom,
      })
    }

    return reply.code(201).send({ data: result })
  })
}
