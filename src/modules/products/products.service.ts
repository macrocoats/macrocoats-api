import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { productDocuments, products, documentAuditLog, users } from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
import type { UpdateDocumentBody } from './products.schema.js'

const CACHE_TTL = 300   // 5 minutes

const EXPIRED_AFTER_MS = 365 * 24 * 60 * 60 * 1000
const DUE_AFTER_MS     = 335 * 24 * 60 * 60 * 1000

/** Linear approval state machine — keys are valid "from" statuses, values are valid "to" statuses */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft:           ['pending_review'],
  pending_review:  ['qa_review', 'draft'],
  qa_review:       ['published', 'pending_review'],
  published:       ['archived'],
  archived:        ['draft'],
}

function cacheKey(productLine: string, docType: string) {
  return `doc:${productLine}:${docType}`
}

export async function getDocument(productLine: string, docType: string, role?: string) {
  // 1. Check Redis cache (only for the unrestricted/published view — role-gating happens after)
  const cacheable = role !== 'company'
  if (cacheable) {
    const cached = await cacheGet(cacheKey(productLine, docType))
    if (cached) return cached
  }

  // 2. Query DB
  const [row] = await db
    .select()
    .from(productDocuments)
    .where(
      and(
        eq(productDocuments.productKey, productLine),
        eq(productDocuments.docType, docType),
      ),
    )

  if (!row) return null

  // Company users must never see a document that hasn't been published yet
  if (role === 'company' && row.status !== 'published') return null

  // 3. Build response envelope (mirrors the existing MSW response shape)
  const [product] = await db.select().from(products).where(eq(products.key, productLine))

  const document = {
    productName: product?.displayName ?? '',
    subtitle:    product?.subtitle ?? '',
    accentColor: product?.accentColor ?? '',
    docNumber:   row.docNumber,
    revision:    row.revision,
    company:     'Macro Coats',
    location:    'SF.NO 224/11, Kalaimagal Nagar, Pazhanthandalam, Chennai - 600132, Tamil Nadu, India',
    contact:     'info@macrocoats.in',
    phone:       '+91 98840 80377',
    gstin:       '33AARCM7377G1ZY',
    ...row.body,
    footer:      row.footer,
    status:      row.status,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
    updatedBy:   row.updatedBy,
  }

  // 4. Cache and return (superadmin/full view only — avoids leaking draft state to a cached company response)
  if (cacheable) {
    await cacheSet(cacheKey(productLine, docType), document, CACHE_TTL)
  }
  return document
}

export async function updateDocument(
  productLine: string,
  docType: string,
  updates: UpdateDocumentBody,
  updatedBy: string,
) {
  const [existing] = await db
    .select({ id: productDocuments.id })
    .from(productDocuments)
    .where(
      and(
        eq(productDocuments.productKey, productLine),
        eq(productDocuments.docType, docType),
      ),
    )

  if (!existing) return null

  const patch: Partial<typeof productDocuments.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy,
  }
  if (updates.docNumber) patch.docNumber = updates.docNumber
  if (updates.revision)  patch.revision  = updates.revision
  if (updates.body)      patch.body      = updates.body
  if (updates.footer)    patch.footer    = updates.footer

  await db.transaction(async (tx) => {
    await tx
      .update(productDocuments)
      .set(patch)
      .where(eq(productDocuments.id, existing.id))

    await tx.insert(documentAuditLog).values({
      productDocumentId: existing.id,
      userId: updatedBy,
      action: 'updated',
    })
  })

  // Invalidate cache
  await cacheDel(cacheKey(productLine, docType))

  return getDocument(productLine, docType)
}

export async function transitionDocumentStatus(
  productLine: string,
  docType: string,
  newStatus: string,
  userId: string,
  notes?: string,
) {
  const [existing] = await db
    .select({ id: productDocuments.id, status: productDocuments.status })
    .from(productDocuments)
    .where(
      and(
        eq(productDocuments.productKey, productLine),
        eq(productDocuments.docType, docType),
      ),
    )

  if (!existing) return null

  const allowedNextStatuses = STATUS_TRANSITIONS[existing.status] ?? []
  if (!allowedNextStatuses.includes(newStatus)) {
    return 'invalid_transition' as const
  }

  await db.transaction(async (tx) => {
    await tx
      .update(productDocuments)
      .set({ status: newStatus as typeof productDocuments.$inferInsert.status })
      .where(eq(productDocuments.id, existing.id))

    await tx.insert(documentAuditLog).values({
      productDocumentId: existing.id,
      userId,
      action: 'status_changed',
      fromStatus: existing.status,
      toStatus: newStatus,
      notes,
    })
  })

  // Invalidate cache — the published/visible state for company users just changed
  await cacheDel(cacheKey(productLine, docType))

  return getDocument(productLine, docType)
}

export async function listAuditTrail(productLine: string, docType: string) {
  const [doc] = await db
    .select({ id: productDocuments.id })
    .from(productDocuments)
    .where(
      and(
        eq(productDocuments.productKey, productLine),
        eq(productDocuments.docType, docType),
      ),
    )

  if (!doc) return null

  return db
    .select({
      id:         documentAuditLog.id,
      action:     documentAuditLog.action,
      fromStatus: documentAuditLog.fromStatus,
      toStatus:   documentAuditLog.toStatus,
      notes:      documentAuditLog.notes,
      at:         documentAuditLog.at,
      userName:   users.name,
    })
    .from(documentAuditLog)
    .leftJoin(users, eq(documentAuditLog.userId, users.id))
    .where(eq(documentAuditLog.productDocumentId, doc.id))
    .orderBy(desc(documentAuditLog.at))
}

export async function listExpirySummary() {
  const rows = await db
    .select({
      productKey: productDocuments.productKey,
      docType:    productDocuments.docType,
      status:     productDocuments.status,
      updatedAt:  productDocuments.updatedAt,
    })
    .from(productDocuments)

  const now = Date.now()
  return rows.map((row) => {
    const ageMs = now - row.updatedAt.getTime()
    const reviewState = ageMs > EXPIRED_AFTER_MS ? 'expired' : ageMs > DUE_AFTER_MS ? 'due' : 'ok'
    return {
      productKey: row.productKey,
      docType:    row.docType,
      status:     row.status,
      updatedAt:  row.updatedAt,
      reviewState,
    }
  })
}

export async function listProducts() {
  return db
    .select({
      key:         products.key,
      displayName: products.displayName,
      code:        products.code,
      category:    products.category,
      subtitle:    products.subtitle,
      accentColor: products.accentColor,
    })
    .from(products)
    .where(eq(products.active, true))
}
