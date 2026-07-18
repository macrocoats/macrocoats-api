import { join, dirname } from 'node:path'
import { mkdir, unlink, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { companies, companyDocuments } from '../../db/schema/index.js'
import { env } from '../../config/env.js'
import type { DocumentMeta } from './company-documents.schema.js'

function toResponse(row: typeof companyDocuments.$inferSelect) {
  return {
    id:          row.id,
    companyId:   row.companyId,
    orderNumber: row.orderNumber,
    orderDate:   row.orderDate,
    orderAmount: row.orderAmount === null ? null : Number(row.orderAmount),
    filename:    row.filename,
    mimeType:    row.mimeType,
    sizeBytes:   row.sizeBytes,
    remarks:     row.remarks,
    uploadedBy:  row.uploadedBy,
    uploadedAt:  row.uploadedAt.toISOString(),
  }
}

export type CompanyDocumentRow = ReturnType<typeof toResponse>

/**
 * Plain existence check against `companies` — mirrors
 * purchase-order-documents.service.ts's purchaseOrderExists() idiom: this
 * module checks existence via a direct table read, never by reaching into
 * another module's service layer.
 */
export async function companyExists(companyId: string): Promise<boolean> {
  const [row] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId))
  return !!row
}

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
 * request (e.g. `data.fields.orderNumber`) — busboy (the parser underlying
 * @fastify/multipart) only guarantees a field is present once everything
 * before it in the request body has been consumed. If a text field is sent
 * after the file part (as this app's own upload code does — file appended
 * to FormData before the metadata fields), reading `.fields` before the file
 * stream is drained can silently see it as missing.
 */
export async function writeUploadedFile(companyId: string, file: UploadedFileInput): Promise<WriteUploadedFileResult> {
  const id           = randomUUID()
  const safeFilename = sanitizeFilename(file.filename)
  const fullPath     = join(env.PROCUREMENT_STORAGE_PATH, 'companies', companyId, `${id}-${safeFilename}`)

  await mkdir(dirname(fullPath), { recursive: true })

  try {
    await pipeline(file.fileStream, createWriteStream(fullPath))
  } catch (err) {
    console.error(`[company-documents] failed to write file to ${fullPath}:`, err)
    return { code: 'UPLOAD_FAILED' }
  }

  try {
    const sizeBytes = (await stat(fullPath)).size
    return { fullPath, sizeBytes, filename: file.filename, mimetype: file.mimetype }
  } catch (err) {
    console.error(`[company-documents] failed to stat written file ${fullPath}:`, err)
    return { code: 'UPLOAD_FAILED' }
  }
}

export type SaveDocumentRecordResult = CompanyDocumentRow | { code: 'UPLOAD_FAILED' }

export async function saveDocumentRecord(
  companyId: string,
  written: WrittenFile,
  meta: DocumentMeta,
  uploadedBy: string | null,
): Promise<SaveDocumentRecordResult> {
  try {
    const [row] = await db
      .insert(companyDocuments)
      .values({
        companyId,
        orderNumber: meta.orderNumber,
        orderDate:   meta.orderDate,
        orderAmount: meta.orderAmount === undefined ? undefined : String(meta.orderAmount),
        filename:    written.filename,
        storageKey:  written.fullPath,
        mimeType:    written.mimetype,
        sizeBytes:   written.sizeBytes,
        remarks:     meta.remarks,
        uploadedBy:  uploadedBy ?? undefined,
      })
      .returning()

    return toResponse(row)
  } catch (err) {
    // The DB write failed after the file was already persisted to disk —
    // best-effort delete it so we don't leak an orphaned file.
    console.error(`[company-documents] DB insert failed after writing ${written.fullPath}, cleaning up:`, err)
    try {
      await unlink(written.fullPath)
    } catch (cleanupErr) {
      console.error(`[company-documents] cleanup delete also failed for ${written.fullPath}:`, cleanupErr)
    }
    return { code: 'UPLOAD_FAILED' }
  }
}

export async function listDocuments(companyId: string): Promise<CompanyDocumentRow[]> {
  const rows = await db
    .select()
    .from(companyDocuments)
    .where(eq(companyDocuments.companyId, companyId))
    .orderBy(desc(companyDocuments.orderDate))

  return rows.map(toResponse)
}

/**
 * Returns the raw DB row (including storageKey) — consumed by the download
 * route, which needs the physical file path, not the sanitized response shape.
 */
export async function getDocumentById(companyId: string, docId: string): Promise<typeof companyDocuments.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(companyDocuments)
    .where(and(eq(companyDocuments.id, docId), eq(companyDocuments.companyId, companyId)))

  return row ?? null
}

export async function deleteDocument(companyId: string, docId: string): Promise<'deleted' | null> {
  const [existing] = await db
    .select()
    .from(companyDocuments)
    .where(and(eq(companyDocuments.id, docId), eq(companyDocuments.companyId, companyId)))

  if (!existing) return null

  await db.delete(companyDocuments).where(eq(companyDocuments.id, docId))

  // Best-effort physical file removal — the DB row is the source of truth;
  // a file that's already gone must never fail this request.
  try {
    await unlink(existing.storageKey)
  } catch (err) {
    console.error(`[company-documents] failed to delete file at ${existing.storageKey}:`, err)
  }

  return 'deleted'
}
