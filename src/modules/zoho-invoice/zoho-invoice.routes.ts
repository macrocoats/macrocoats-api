import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import { zohoInvoiceParamsSchema, listZohoInvoicesQuerySchema } from './zoho-invoice.schema.js'
import { getSyncStatus, syncDispatchInvoice, listZohoInvoices } from './zoho-invoice.service.js'

const preHandler = [authenticate, requireAuth, requireSuperAdmin]

/** Registered with prefix `${prefix}/zoho-invoices` in app.ts. */
export async function zohoInvoiceRoutes(app: FastifyInstance) {
  // ── GET /zoho-invoices ──────────────────────────────────────────────────────
  // Live list straight from Zoho (not the local sync table) — status/date/search
  // filters are best-effort pass-through to Zoho's own query params.
  app.get('/', { preHandler }, async (request, reply) => {
    const query = listZohoInvoicesQuerySchema.safeParse(request.query)
    if (!query.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: query.error.flatten() })
    }

    const result = await listZohoInvoices(query.data)
    if ('code' in result) {
      if (result.code === 'ZOHO_NOT_CONFIGURED') return reply.code(400).send({ error: AppErrors.ZOHO_NOT_CONFIGURED })
      return reply.code(502).send({ error: AppErrors.ZOHO_SYNC_FAILED, message: result.message })
    }

    return reply.send({ data: result })
  })

  // ── GET /zoho-invoices/:dispatchId ─────────────────────────────────────────
  // Stored status only — never calls Zoho.
  app.get<{ Params: { dispatchId: string } }>('/:dispatchId', { preHandler }, async (request, reply) => {
    const params = zohoInvoiceParamsSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
    }

    const row = await getSyncStatus(params.data.dispatchId)
    return reply.send({ data: row })
  })

  // ── POST /zoho-invoices/:dispatchId/sync ──────────────────────────────────
  // Live pull from Zoho, upserts the stored row.
  app.post<{ Params: { dispatchId: string } }>('/:dispatchId/sync', { preHandler }, async (request, reply) => {
    const params = zohoInvoiceParamsSchema.safeParse(request.params)
    if (!params.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: params.error.flatten() })
    }

    const result = await syncDispatchInvoice(params.data.dispatchId)

    if ('code' in result) {
      switch (result.code) {
        case 'DISPATCH_NOT_FOUND':
          return reply.code(404).send({ error: AppErrors.DISPATCH_NOT_FOUND })
        case 'DISPATCH_INVOICE_NUMBER_MISSING':
          return reply.code(400).send({ error: AppErrors.DISPATCH_INVOICE_NUMBER_MISSING })
        case 'ZOHO_NOT_CONFIGURED':
          return reply.code(400).send({ error: AppErrors.ZOHO_NOT_CONFIGURED })
        case 'ZOHO_INVOICE_NOT_FOUND':
          return reply.code(404).send({ error: AppErrors.ZOHO_INVOICE_NOT_FOUND })
        case 'ZOHO_SYNC_FAILED':
          return reply.code(502).send({ error: AppErrors.ZOHO_SYNC_FAILED, message: result.message })
      }
    }

    return reply.send({ data: result })
  })
}
