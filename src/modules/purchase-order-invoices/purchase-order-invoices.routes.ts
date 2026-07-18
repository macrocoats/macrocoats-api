import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { createInvoiceSchema, updateInvoiceSchema } from './purchase-order-invoices.schema.js'
import {
  purchaseOrderExists, listInvoices, createInvoice, updateInvoice, deleteInvoice,
} from './purchase-order-invoices.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

/**
 * Nested under /purchase-orders (registered with prefix `${prefix}/purchase-orders`
 * in app.ts) — mirrors how vendor-prices nests under /vendors.
 */
export async function purchaseOrderInvoiceRoutes(app: FastifyInstance) {
  // ── GET /purchase-orders/:id/invoices ─────────────────────────────────────
  app.get<{ Params: { id: string } }>('/:id/invoices', { preHandler }, async (request, reply) => {
    if (!(await purchaseOrderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    }

    const invoices = await listInvoices(request.params.id)
    return reply.send({ data: invoices })
  })

  // ── POST /purchase-orders/:id/invoices ────────────────────────────────────
  app.post<{ Params: { id: string } }>('/:id/invoices', { preHandler }, async (request, reply) => {
    const body = createInvoiceSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    const invoice = await createInvoice(request.params.id, body.data, request.authUser!.id)
    if (invoice === null) return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })

    return reply.code(201).send({ data: invoice })
  })

  // ── PATCH /purchase-orders/:id/invoices/:invoiceId ────────────────────────
  app.patch<{ Params: { id: string; invoiceId: string } }>('/:id/invoices/:invoiceId', { preHandler }, async (request, reply) => {
    const body = updateInvoiceSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }

    if (!(await purchaseOrderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    }

    const invoice = await updateInvoice(request.params.id, request.params.invoiceId, body.data, request.authUser!.id)
    if (invoice === null) return reply.code(404).send({ error: AppErrors.PO_INVOICE_NOT_FOUND })

    return reply.send({ data: invoice })
  })

  // ── DELETE /purchase-orders/:id/invoices/:invoiceId ───────────────────────
  app.delete<{ Params: { id: string; invoiceId: string } }>('/:id/invoices/:invoiceId', { preHandler }, async (request, reply) => {
    if (!(await purchaseOrderExists(request.params.id))) {
      return reply.code(404).send({ error: AppErrors.PURCHASE_ORDER_NOT_FOUND })
    }

    const result = await deleteInvoice(request.params.id, request.params.invoiceId, request.authUser!.id)
    if (result === null) return reply.code(404).send({ error: AppErrors.PO_INVOICE_NOT_FOUND })

    return reply.code(204).send()
  })
}
