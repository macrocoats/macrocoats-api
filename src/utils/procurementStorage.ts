import { mkdir } from 'node:fs/promises'
import { env } from '../config/env.js'

/**
 * Ensures the root directory for purchase-order document uploads exists.
 * Called once at server boot (src/server.ts), before the server starts
 * listening — individual per-PO subdirectories are created lazily on first
 * upload by purchase-order-documents.service.ts::saveUploadedFile.
 */
export async function ensureProcurementStorageDir(): Promise<void> {
  await mkdir(env.PROCUREMENT_STORAGE_PATH, { recursive: true })
}
