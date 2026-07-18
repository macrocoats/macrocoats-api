import { join, dirname } from 'node:path'
import { mkdir, unlink, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { purchaseOrders, purchaseOrderDocuments, purchaseOrderTimeline } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import type { DocCategory, ListDocumentsQuery } from './purchase-order-documents.schema.js'

function toResponse(row: typeof purchaseOrderDocuments.$inferSelect) {
  return {
    id:              row.id,
    purchaseOrderId: row.purchaseOrderId,
    docCategory:     row.docCategory,
    filename:        row.filename,
    mimeType:        row.mimeType,
    sizeBytes:       row.sizeBytes,
    uploadedBy:      row.uploadedBy,
    uploadedAt:      row.uploadedAt.toISOString(),
  }
}

export type PurchaseOrderDocumentRow = ReturnType<typeof toResponse>

/**
 * Plain existence check against `purchase_orders` — deliberately does NOT
 * import purchase-orders.service.ts. Mirrors vendor-prices.service.ts's
 * vendorExists() idiom: this module checks existence via a direct table
 * read, never by reaching into another module's service layer.
 */
export async function purchaseOrderExists(poId: string): Promise<boolean> {
  const [row] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, poId))
  return !!row
}

/** Strips path separators from the original filename before it's folded into the storage path. */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\]/g, '_')
}

export interface UploadedFileInput {
  filename:   string
  mimetype:   string
  fileStream: NodeJS.ReadableStream
}

export interface WrittenFile {
  fullPath:  string
  sizeBytes: number
  filename:  string
  mimetype:  string
}

export type WriteUploadedFileResult = WrittenFile | { code: 'UPLOAD_FAILED' }

/**
 * Streams the multipart file part to disk and returns the written path.
 *
 * Must be awaited BEFORE reading any other multipart fields off the same
 * request (e.g. `data.fields.docCategory`) — busboy (the parser underlying
 * @fastify/multipart) only guarantees a field is present once everything
 * before it in the request body has been consumed. This app's own upload
 * code appends the file to FormData before the docCategory field, so reading
 * `.fields` before the file stream is drained can race and see it as missing.
 */
export async function writeUploadedFile(poId: string, file: UploadedFileInput): Promise<WriteUploadedFileResult> {
  const id           = randomUUID()
  const safeFilename = sanitizeFilename(file.filename)
  const fullPath     = join(env.PROCUREMENT_STORAGE_PATH, 'purchase-orders', poId, `${id}-${safeFilename}`)

  await mkdir(dirname(fullPath), { recursive: true })

  try {
    await pipeline(file.fileStream, createWriteStream(fullPath))
  } catch (err) {
    console.error(`[purchase-order-documents] failed to write file to ${fullPath}:`, err)
    return { code: 'UPLOAD_FAILED' }
  }

  try {
    const sizeBytes = (await stat(fullPath)).size
    return { fullPath, sizeBytes, filename: file.filename, mimetype: file.mimetype }
  } catch (err) {
    console.error(`[purchase-order-documents] failed to stat written file ${fullPath}:`, err)
    return { code: 'UPLOAD_FAILED' }
  }
}

export type SaveDocumentRecordResult = PurchaseOrderDocumentRow | { code: 'UPLOAD_FAILED' }

export async function saveDocumentRecord(
  poId: string,
  written: WrittenFile,
  docCategory: DocCategory,
  uploadedBy: string | null,
): Promise<SaveDocumentRecordResult> {
  try {
    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(purchaseOrderDocuments)
        .values({
          purchaseOrderId: poId,
          docCategory,
          filename:        written.filename,
          storageKey:      written.fullPath,
          mimeType:        written.mimetype,
          sizeBytes:       written.sizeBytes,
          uploadedBy:      uploadedBy ?? undefined,
        })
        .returning()

      await tx.insert(purchaseOrderTimeline).values({
        purchaseOrderId: poId,
        userId:          uploadedBy,
        action:          'document_uploaded',
        notes:           written.filename,
      })

      return row
    })

    return toResponse(inserted)
  } catch (err) {
    // The DB write failed after the file was already persisted to disk —
    // best-effort delete it so we don't leak an orphaned file. Logged, not
    // thrown: the caller already has a clear UPLOAD_FAILED result to report.
    console.error(`[purchase-order-documents] DB insert failed after writing ${written.fullPath}, cleaning up:`, err)
    try {
      await unlink(written.fullPath)
    } catch (cleanupErr) {
      console.error(`[purchase-order-documents] cleanup delete also failed for ${written.fullPath}:`, cleanupErr)
    }
    return { code: 'UPLOAD_FAILED' }
  }
}

export async function listDocuments(poId: string, filters: ListDocumentsQuery): Promise<PurchaseOrderDocumentRow[]> {
  const conditions = [eq(purchaseOrderDocuments.purchaseOrderId, poId)]
  if (filters.docCategory) conditions.push(eq(purchaseOrderDocuments.docCategory, filters.docCategory))

  const rows = await db
    .select()
    .from(purchaseOrderDocuments)
    .where(and(...conditions))
    .orderBy(desc(purchaseOrderDocuments.uploadedAt))

  return rows.map(toResponse)
}

/**
 * Returns the raw DB row (including storageKey) — consumed by the download
 * route, which needs the physical file path, not the sanitized response shape.
 */
export async function getDocumentById(poId: string, docId: string): Promise<typeof purchaseOrderDocuments.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(purchaseOrderDocuments)
    .where(and(eq(purchaseOrderDocuments.id, docId), eq(purchaseOrderDocuments.purchaseOrderId, poId)))

  return row ?? null
}

export async function deleteDocument(poId: string, docId: string, userId: string): Promise<'deleted' | null> {
  const deleted = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(purchaseOrderDocuments)
      .where(and(eq(purchaseOrderDocuments.id, docId), eq(purchaseOrderDocuments.purchaseOrderId, poId)))

    if (!existing) return null

    await tx.delete(purchaseOrderDocuments).where(eq(purchaseOrderDocuments.id, docId))

    await tx.insert(purchaseOrderTimeline).values({
      purchaseOrderId: poId,
      userId,
      action:          'document_deleted',
      notes:           existing.filename,
    })

    return existing
  })

  if (!deleted) return null

  // Best-effort physical file removal — the DB row is the source of truth;
  // a file that's already gone must never fail this request.
  try {
    await unlink(deleted.storageKey)
  } catch (err) {
    console.error(`[purchase-order-documents] failed to delete file at ${deleted.storageKey}:`, err)
  }

  return 'deleted'
}
