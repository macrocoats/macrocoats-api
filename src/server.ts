import { buildApp } from './app.js'
import { env } from './config/env.js'
import { connectRedis, disconnectRedis } from './plugins/redis.js'

async function main() {
  const app = await buildApp()

  // Connect to Redis (optional — no-ops if REDIS_URL not set)
  await connectRedis()

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal} — shutting down gracefully`)
    await app.close()
    await disconnectRedis()
    process.exit(0)
  }

  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀 macrocoats-api listening on http://0.0.0.0:${env.PORT}/${env.API_VERSION}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
