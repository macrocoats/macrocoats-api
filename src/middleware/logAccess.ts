import type { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index.js'
import { accessLog } from '../db/schema/index.js'

interface ProductParams {
  productLine: string
  docType:     string
}

/**
 * Appends an entry to `access_log` after the request completes.
 * Runs via `onSend` hook — does not block the response.
 */
export async function logAccess(
  request: FastifyRequest<{ Params: ProductParams }>,
  _reply: FastifyReply,
): Promise<void> {
  const user = request.authUser

  // Fire-and-forget — errors here should never affect the client
  setImmediate(async () => {
    try {
      await db.insert(accessLog).values({
        userId:     user?.id ?? null,
        companyKey: user?.companyName ?? null,
        productKey: request.params?.productLine ?? null,
        docType:    request.params?.docType ?? null,
        ip:         request.ip,
        userAgent:  request.headers['user-agent'] ?? null,
      })
    } catch (err) {
      request.log.warn({ err }, 'Failed to write access log entry')
    }
  })
}
