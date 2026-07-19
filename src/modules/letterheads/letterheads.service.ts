import { eq, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { letterheadTemplates, letterheadDocuments } from '../../db/schema/index.js'
import type { CreateTemplateBody, UpdateTemplateBody, CreateDocumentBody, UpdateDocumentBody, CreateVersionBody } from './letterheads.schema.js'

function toTemplateResponse(row: typeof letterheadTemplates.$inferSelect) {
  return {
    id:        row.id,
    name:      row.name,
    category:  row.category,
    bodyHtml:  row.bodyHtml,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toDocumentResponse(row: typeof letterheadDocuments.$inferSelect) {
  return {
    id:                   row.id,
    templateId:           row.templateId,
    referenceNo:          row.referenceNo,
    letterDate:           row.letterDate,
    customerName:         row.customerName,
    companyName:          row.companyName,
    subject:              row.subject,
    attention:            row.attention,
    preparedBy:           row.preparedBy,
    approvedBy:           row.approvedBy,
    designation:          row.designation,
    bodyHtml:             row.bodyHtml,
    status:               row.status,
    version:              row.version,
    supersedesDocumentId: row.supersedesDocumentId,
    createdBy:            row.createdBy,
    createdAt:            row.createdAt.toISOString(),
    updatedAt:            row.updatedAt.toISOString(),
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates() {
  const rows = await db.select().from(letterheadTemplates).orderBy(desc(letterheadTemplates.updatedAt))
  return rows.map(toTemplateResponse)
}

export async function getTemplateById(id: string) {
  const [row] = await db.select().from(letterheadTemplates).where(eq(letterheadTemplates.id, id))
  return row ? toTemplateResponse(row) : null
}

export async function createTemplate(data: CreateTemplateBody, createdBy: string) {
  const [row] = await db
    .insert(letterheadTemplates)
    .values({ name: data.name, category: data.category ?? null, bodyHtml: data.bodyHtml, createdBy })
    .returning()
  return toTemplateResponse(row)
}

export async function updateTemplate(id: string, data: UpdateTemplateBody) {
  const patch: Partial<typeof letterheadTemplates.$inferInsert> = { updatedAt: new Date() }
  if (data.name     !== undefined) patch.name     = data.name
  if (data.category !== undefined) patch.category = data.category
  if (data.bodyHtml !== undefined) patch.bodyHtml = data.bodyHtml

  const [row] = await db.update(letterheadTemplates).set(patch).where(eq(letterheadTemplates.id, id)).returning()
  return row ? toTemplateResponse(row) : null
}

export async function deleteTemplate(id: string) {
  const [row] = await db.delete(letterheadTemplates).where(eq(letterheadTemplates.id, id)).returning()
  return row ? toTemplateResponse(row) : null
}

export async function duplicateTemplate(id: string, createdBy: string) {
  const [source] = await db.select().from(letterheadTemplates).where(eq(letterheadTemplates.id, id))
  if (!source) return null

  const [row] = await db
    .insert(letterheadTemplates)
    .values({ name: `${source.name} (Copy)`, category: source.category, bodyHtml: source.bodyHtml, createdBy })
    .returning()
  return toTemplateResponse(row)
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function listDocuments() {
  const rows = await db.select().from(letterheadDocuments).orderBy(desc(letterheadDocuments.updatedAt))
  return rows.map(toDocumentResponse)
}

export async function getDocumentById(id: string) {
  const [row] = await db.select().from(letterheadDocuments).where(eq(letterheadDocuments.id, id))
  return row ? toDocumentResponse(row) : null
}

function documentValues(data: CreateDocumentBody | CreateVersionBody) {
  return {
    templateId:   data.templateId ?? null,
    referenceNo:  data.referenceNo ?? null,
    letterDate:   data.letterDate ?? null,
    customerName: data.customerName ?? null,
    companyName:  data.companyName ?? null,
    subject:      data.subject ?? null,
    attention:    data.attention ?? null,
    preparedBy:   data.preparedBy ?? null,
    approvedBy:   data.approvedBy ?? null,
    designation:  data.designation ?? null,
    bodyHtml:     data.bodyHtml,
    status:       data.status ?? 'draft',
  }
}

export async function createDocument(data: CreateDocumentBody, createdBy: string) {
  const [row] = await db
    .insert(letterheadDocuments)
    .values({ ...documentValues(data), createdBy })
    .returning()
  return toDocumentResponse(row)
}

export async function updateDocument(id: string, data: UpdateDocumentBody) {
  const patch: Partial<typeof letterheadDocuments.$inferInsert> = { updatedAt: new Date() }
  if (data.templateId   !== undefined) patch.templateId   = data.templateId
  if (data.referenceNo  !== undefined) patch.referenceNo  = data.referenceNo
  if (data.letterDate   !== undefined) patch.letterDate   = data.letterDate
  if (data.customerName !== undefined) patch.customerName = data.customerName
  if (data.companyName  !== undefined) patch.companyName  = data.companyName
  if (data.subject      !== undefined) patch.subject      = data.subject
  if (data.attention    !== undefined) patch.attention    = data.attention
  if (data.preparedBy   !== undefined) patch.preparedBy   = data.preparedBy
  if (data.approvedBy   !== undefined) patch.approvedBy   = data.approvedBy
  if (data.designation  !== undefined) patch.designation  = data.designation
  if (data.bodyHtml     !== undefined) patch.bodyHtml     = data.bodyHtml
  if (data.status       !== undefined) patch.status       = data.status

  const [row] = await db.update(letterheadDocuments).set(patch).where(eq(letterheadDocuments.id, id)).returning()
  return row ? toDocumentResponse(row) : null
}

/** Inserts a new row chained to `documentId` via supersedesDocumentId, version + 1. */
export async function createNewVersion(documentId: string, data: CreateVersionBody, createdBy: string) {
  const [current] = await db.select().from(letterheadDocuments).where(eq(letterheadDocuments.id, documentId))
  if (!current) return null

  const [row] = await db
    .insert(letterheadDocuments)
    .values({
      ...documentValues(data),
      version: current.version + 1,
      supersedesDocumentId: current.id,
      createdBy,
    })
    .returning()
  return toDocumentResponse(row)
}

/** Walks the supersedesDocumentId chain back to the root, newest first. */
export async function listVersionHistory(documentId: string) {
  const [start] = await db.select().from(letterheadDocuments).where(eq(letterheadDocuments.id, documentId))
  if (!start) return null

  const chain = [start]
  let cursor = start
  while (cursor.supersedesDocumentId) {
    const [prev] = await db.select().from(letterheadDocuments).where(eq(letterheadDocuments.id, cursor.supersedesDocumentId))
    if (!prev) break
    chain.push(prev)
    cursor = prev
  }

  return chain.map(toDocumentResponse)
}
