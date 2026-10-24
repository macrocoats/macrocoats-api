import { buildApp } from './app.js'
import { env } from './config/env.js'
import { connectRedis, disconnectRedis } from './plugins/redis.js'
import { pdfService } from './modules/pdf/pdf.service.js'
import { ensureProcurementStorageDir } from './utils/procurementStorage.js'
import { queryClient } from './db/index.js'

async function main() {
  const app = await buildApp()

  // Ensure the purchase-order document upload directory exists before we start accepting requests
  await ensureProcurementStorageDir()

  // Connect to Redis (optional — no-ops if REDIS_URL not set)
  await connectRedis()

  // Graceful shutdown — once only, with a hard deadline so a hung close can't block restarts
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info(`Received ${signal} — shutting down gracefully`)
    setTimeout(() => {
      app.log.error('Shutdown timed out — forcing exit')
      process.exit(1)
    }, 10_000).unref()

    let exitCode = 0
    try {
      await app.close()
      await disconnectRedis()
      await pdfService.shutdown()
      await queryClient.end({ timeout: 5 })
    } catch (err) {
      app.log.error(err, 'Error during shutdown')
      exitCode = 1
    }
    process.exit(exitCode)
  }

  process.on('SIGINT',  () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection')
  })

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 macrocoats-api listening on http://0.0.0.0:${env.PORT}/${env.API_VERSION}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('❌ Failed to start macrocoats-api:', err)
  process.exit(1)
})
