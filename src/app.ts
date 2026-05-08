import Fastify from 'fastify'
import { env } from './config/env.js'
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
import { AppErrors } from './types/errors.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level:     env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true,   // needed for accurate req.ip behind nginx/load balancer
  })

  // ── Core plugins ──────────────────────────────────────────────────────────
  await registerCors(app)
  await registerCookies(app)

  // Decode cookie on every request — sets request.authUser if token present
  app.addHook('onRequest', authenticate)

  // ── Health check ───────────────────��──────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

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
  await app.register(salaryRecordRoutes, { prefix: `${prefix}/salary-records` })

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
