import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { sql } from 'drizzle-orm'
import { env } from './config/env.js'
import { db } from './db/index.js'
import { getRedis } from './plugins/redis.js'
import { registerCors } from './plugins/cors.js'
import { registerCookies } from './plugins/cookie.js'
import { authenticate } from './middleware/authenticate.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { productRoutes } from './modules/products/products.routes.js'
import { inventoryRoutes } from './modules/inventory/inventory.routes.js'
import { quotationRoutes } from './modules/quotations/quotations.routes.js'
import { companyRoutes } from './modules/companies/companies.routes.js'
import { analyticsRoutes } from './modules/analytics/analytics.routes.js'
import { batchRoutes } from './modules/batches/batches.routes.js'
import { vendorRoutes } from './modules/vendors/vendors.routes.js'
import { staffRoutes } from './modules/staff/staff.routes.js'
import { salaryRecordRoutes } from './modules/salaryRecords/salaryRecords.routes.js'
import { formulationVariantRoutes } from './modules/formulation-variants/formulation-variants.routes.js'
import { hazardProfileRoutes } from './modules/hazard-profiles/hazard-profiles.routes.js'
import { companyPricingRoutes } from './modules/company-pricing/company-pricing.routes.js'
import { pdfRoutes } from './modules/pdf/pdf.routes.js'
import { optimizerRoutes } from './modules/optimizer/optimizer.routes.js'
import { costIntelligenceRoutes } from './modules/cost-intelligence/cost-intelligence.routes.js'
import { finishedGoodsRoutes } from './modules/finished-goods/finished-goods.routes.js'
import { dispatchRoutes } from './modules/dispatch/dispatch.routes.js'
import { vendorPriceRoutes } from './modules/vendor-prices/vendor-prices.routes.js'
import { purchaseEntryRoutes } from './modules/purchase-entries/purchase-entries.routes.js'
import { companyDocumentRoutes } from './modules/company-documents/company-documents.routes.js'
import { customerPurchaseOrderRoutes } from './modules/customer-purchase-orders/customer-purchase-orders.routes.js'
import { investorDashboardRoutes } from './modules/investor-dashboard/investor-dashboard.routes.js'
import { productionPlanningRoutes } from './modules/production-planning/production-planning.routes.js'
import { letterheadRoutes } from './modules/letterheads/letterheads.routes.js'
import { zohoInvoiceRoutes } from './modules/zoho-invoice/zoho-invoice.routes.js'
import { AppErrors } from './types/errors.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level:     env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
      // Enforce "never log JWTs, passwords, cookies, or PII" rather than relying on discipline
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.panNumber',
          '*.aadharNumber',
        ],
        censor: '[REDACTED]',
      },
    },
    trustProxy: true,   // needed for accurate req.ip behind nginx/load balancer
    bodyLimit:  1_048_576,   // 1 MB — prevent oversized JSONB payloads
  })

  // ── Core plugins ──────────────────────────────────────────────────────────
  await registerCors(app)
  await registerCookies(app)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
  // API is consumed cross-origin by the Vercel SPA, so allow cross-origin resource loads
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } })
  // Opt-in only — limits are set per-route via `config.rateLimit` (see auth.routes.ts)
  await app.register(rateLimit, { global: false })

  // Decode cookie on every request — sets request.authUser if token present
  app.addHook('onRequest', authenticate)

  // ── Health check ──────────────────────────────────────────────────────────
  // Pings Postgres (and Redis when configured) so probes detect a real outage
  app.get('/health', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'down' | 'disabled'> = { db: 'ok', redis: 'disabled' }

    try {
      await db.execute(sql`select 1`)
    } catch {
      checks.db = 'down'
    }

    const redis = getRedis()
    if (redis) {
      try {
        await redis.ping()
        checks.redis = 'ok'
      } catch {
        checks.redis = 'down'
      }
    }

    const healthy = checks.db === 'ok' && checks.redis !== 'down'
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      checks,
      ts: new Date().toISOString(),
    })
  })

  // ── API routes ───────────────────────���────────────────────────────────────
  const prefix = `/${env.API_VERSION}`

  await app.register(authRoutes,      { prefix: `${prefix}/auth` })
  await app.register(productRoutes,   { prefix: `${prefix}/products` })
  await app.register(inventoryRoutes, { prefix: `${prefix}/inventory` })
  await app.register(quotationRoutes, { prefix: `${prefix}/quotations` })
  await app.register(companyRoutes,   { prefix: `${prefix}/companies` })
  await app.register(analyticsRoutes, { prefix: `${prefix}/analytics` })
  await app.register(batchRoutes,     { prefix: `${prefix}/batches` })
  await app.register(vendorRoutes,    { prefix: `${prefix}/vendors` })
  await app.register(staffRoutes,        { prefix: `${prefix}/staff` })
  await app.register(salaryRecordRoutes,          { prefix: `${prefix}/salary-records` })
  await app.register(formulationVariantRoutes,    { prefix: `${prefix}/formulation-variants` })
  await app.register(hazardProfileRoutes,         { prefix: `${prefix}/hazard-profiles` })
  await app.register(companyPricingRoutes,        { prefix: `${prefix}/companies` })
  await app.register(pdfRoutes,                   { prefix: `${prefix}/pdf` })
  await app.register(optimizerRoutes,             { prefix: `${prefix}/optimizer` })
  await app.register(costIntelligenceRoutes,      { prefix: `${prefix}/cost-intelligence` })
  await app.register(finishedGoodsRoutes,         { prefix: `${prefix}/finished-goods` })
  await app.register(dispatchRoutes,              { prefix: `${prefix}/dispatches` })
  await app.register(vendorPriceRoutes,           { prefix: `${prefix}/vendors` })
  await app.register(purchaseEntryRoutes,         { prefix: `${prefix}/purchase-entries` })
  await app.register(companyDocumentRoutes,       { prefix: `${prefix}/companies` })
  await app.register(customerPurchaseOrderRoutes, { prefix: `${prefix}/customer-purchase-orders` })
  await app.register(investorDashboardRoutes,     { prefix: `${prefix}/investor-dashboard` })
  await app.register(productionPlanningRoutes,    { prefix: `${prefix}/production-planning` })
  await app.register(letterheadRoutes,            { prefix: `${prefix}/letterheads` })
  await app.register(zohoInvoiceRoutes,           { prefix: `${prefix}/zoho-invoices` })

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)

    if (error.validation) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, message: error.message })
    }

    const statusCode = error.statusCode ?? 500
    const message    = statusCode < 500 ? error.message : 'Internal Server Error'

    return reply.code(statusCode).send({ error: message })
  })

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: AppErrors.NOT_FOUND })
  })

  return app
}
