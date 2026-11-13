import { createReadStream } from 'node:fs'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import {
  portalIdSchema,
  portalListQuerySchema,
  zohoInvoiceIdSchema,
} from './customer-portal.schema.js'
import {
  customerInvoicePdf,
  customerInvoices,
  getCertificatePdf,
  getCustomerAccount,
  getOrder,
  getOrderDocumentFile,
  listCertificates,
  listOrders,
  PortalInvoiceError,
  toProfile,
  type PortalCompany,
} from './customer-portal.service.js'

const isUuid = (v: string) => portalIdSchema.safeParse(v).success

const invoiceError = (reply: FastifyReply, err: unknown) =>
  reply
    .code(err instanceof PortalInvoiceError ? err.status : 502)
    .send({ error: err instanceof PortalInvoiceError ? err.code : 'INVOICES_UNAVAILABLE' })

export async function customerPortalRoutes(app: FastifyInstance) {
  const scopedCompanies = new WeakMap<FastifyRequest, PortalCompany>()
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireAuth)
  app.addHook('preHandler', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    if (request.authUser?.role !== 'company')
      return reply.code(403).send({ error: 'CUSTOMER_ACCESS_REQUIRED' })
    const company = await getCustomerAccount(request.authUser.id)
    if (!company || (company.tokenExpiresAt && company.tokenExpiresAt <= new Date())) {
      return reply.code(403).send({ error: 'CUSTOMER_ACCESS_EXPIRED' })
    }
    scopedCompanies.set(request, company)
  })
  const companyOf = (request: FastifyRequest) => scopedCompanies.get(request)!

  app.get('/company', async (request) => ({ data: toProfile(companyOf(request)) }))

  app.get('/orders', async (request, reply) => {
    const q = portalListQuerySchema.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
    return { data: await listOrders(companyOf(request).id, q.data.page, q.data.search) }
  })

  app.get<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
    if (!isUuid(request.params.id)) return reply.code(404).send({ error: 'NOT_FOUND' })
    const order = await getOrder(companyOf(request).id, request.params.id)
    if (!order) return reply.code(404).send({ error: 'NOT_FOUND' })
    return { data: order }
  })

  app.get<{ Params: { id: string; documentId: string } }>(
    '/orders/:id/documents/:documentId',
    async (request, reply) => {
      const { id, documentId } = request.params
      if (!isUuid(id) || !isUuid(documentId)) return reply.code(404).send({ error: 'NOT_FOUND' })
      const file = await getOrderDocumentFile(companyOf(request).id, id, documentId)
      if (!file) return reply.code(404).send({ error: 'NOT_FOUND' })
      return reply
        .type(file.mimeType)
        .header(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        )
        .send(createReadStream(file.path))
    },
  )

  app.get('/certificates', async (request, reply) => {
    const q = portalListQuerySchema.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
    return { data: await listCertificates(companyOf(request).id, q.data.page, q.data.search) }
  })

  app.get<{ Params: { id: string } }>('/certificates/:id/pdf', async (request, reply) => {
    if (!isUuid(request.params.id)) return reply.code(404).send({ error: 'NOT_FOUND' })
    const result = await getCertificatePdf(companyOf(request), request.params.id)
    if (result === 'not_found') return reply.code(404).send({ error: 'NOT_FOUND' })
    if (result === 'unavailable') return reply.code(409).send({ error: 'CERTIFICATE_UNAVAILABLE' })
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `attachment; filename="coa-${result.batchId}.pdf"`)
      .send(result.buffer)
  })

  app.get('/invoices', async (request, reply) => {
    const q = portalListQuerySchema.safeParse(request.query)
    if (!q.success) return reply.code(400).send({ error: 'VALIDATION_ERROR' })
    try {
      return {
        data: await customerInvoices(companyOf(request).zohoCustomerId, q.data.page, q.data.search),
      }
    } catch (err) {
      return invoiceError(reply, err)
    }
  })

  app.get<{ Params: { id: string } }>('/invoices/:id/pdf', async (request, reply) => {
    if (!zohoInvoiceIdSchema.safeParse(request.params.id).success)
      return reply.code(404).send({ error: 'NOT_FOUND' })
    try {
      const pdf = await customerInvoicePdf(companyOf(request).zohoCustomerId, request.params.id)
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="invoice-${request.params.id}.pdf"`)
        .send(pdf)
    } catch (err) {
      return invoiceError(reply, err)
    }
  })
}
