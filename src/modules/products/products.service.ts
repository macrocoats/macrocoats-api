import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { productDocuments, products, documentAuditLog, users } from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
import { resolveCompanyId } from '../../utils/resolveCompanyId.js'
import { getVariantById } from '../formulation-variants/formulation-variants.service.js'
import { getHazardProfileMap } from '../hazard-profiles/hazard-profiles.service.js'
import {
  buildSanitizedTdsComposition,
  buildMsdsIngredientDisclosure,
  deriveHazardAggregate,
  buildInternalComposition,
  buildInternalHazardBreakdown,
} from '../document-sanitization/document-sanitization.service.js'
import type { RawComponent, HazardAggregate } from '../document-sanitization/document-sanitization.types.js'
import type { AuthUser, DocumentViewMode } from '../../types/index.js'
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

/**
 * Applies formulation-variant-aware sanitized/internal composition + hazards
 * onto an already-built document envelope, in place. Only meaningful for
 * tds/msds — callers must gate on docType before calling this.
 *
 * Every failure mode here (variant not found, cross-tenant mismatch) is a
 * silent no-op — falls back to the baseline `row.body` — rather than an
 * error, per the plan: a stale variantId or a variant belonging to another
 * company must never surface as a 403/404 on the whole document read (the
 * latter would leak that another tenant's variant exists).
 */
async function applyVariantOverride(
  document: Record<string, unknown>,
  docType: 'tds' | 'msds',
  authUser: AuthUser | null,
  variantId: string,
  requestedView: DocumentViewMode | undefined,
): Promise<void> {
  const role = authUser?.role

  // 1. Resolve requester's companyId (small table; not aggressively cached).
  const companyId = role !== 'superadmin' ? await resolveCompanyId(authUser?.companyName) : null

  // 2. Fetch the variant + its components — internal reuse (not an HTTP round-trip).
  //    Always includeInternal=true: this derivation needs raw components regardless
  //    of the outer requester's role — sanitization happens here, not by withholding
  //    data from the variant fetch itself. Cast to the full shape explicitly rather
  //    than relying on TS to narrow getVariantById's includeInternal-conditional
  //    return type — the literal `true` argument guarantees it at runtime.
  const raw = await getVariantById(variantId, true)
  if (!raw || !('components' in raw)) return   // stale/deleted variantId → proceed without it
  const variant = raw as unknown as {
    companyId:     string | null
    tdsOverrides:  Record<string, unknown> | null
    msdsOverrides: Record<string, unknown> | null
    components:    RawComponent[]
  }

  // 3. Cross-tenant isolation.
  if (role !== 'superadmin' && variant.companyId && variant.companyId !== companyId) return

  // 4. Effective view — non-superadmin is always forced to 'customer'.
  const view: DocumentViewMode = role === 'superadmin' ? (requestedView ?? 'customer') : 'customer'

  const components = (variant.components ?? []) as RawComponent[]
  const sections = { ...((document.sections as Record<string, unknown>) ?? {}) }

  if (docType === 'tds') {
    const overrides = variant.tdsOverrides as Record<string, unknown> | null

    if (overrides && overrides.composition !== undefined) {
      sections.composition = overrides.composition
    } else if (view === 'internal') {
      sections.composition = buildInternalComposition(components)
    } else {
      const profileMap = await getHazardProfileMap()
      sections.composition = buildSanitizedTdsComposition(components, profileMap)
    }

    document.sections = sections
    return
  }

  // ── msds ──────────────────────────────────────────────────────────────────
  const overrides = variant.msdsOverrides as Record<string, unknown> | null
  const hazardOverride = overrides?.hazardOverride as HazardAggregate | undefined
  const profileMap = await getHazardProfileMap()

  if (overrides && overrides.composition !== undefined) {
    sections.composition = overrides.composition
  } else if (view === 'internal') {
    sections.composition = buildInternalComposition(components)
  } else {
    sections.composition = buildMsdsIngredientDisclosure(components, profileMap)
  }

  if (hazardOverride) {
    sections.hazards = {
      pictograms:      hazardOverride.pictograms,
      classifications: hazardOverride.classifications,
      hStatements:     hazardOverride.hStatements,
      pStatements:     hazardOverride.pStatements,
    }
    document.signalWord = hazardOverride.signalWord
  } else {
    const aggregate = deriveHazardAggregate(components, profileMap)
    sections.hazards = {
      pictograms:      aggregate.pictograms,
      classifications: aggregate.classifications,
      hStatements:     aggregate.hStatements,
      pStatements:     aggregate.pStatements,
    }
    document.signalWord = aggregate.signalWord
  }

  document.sections = sections

  // Attach QA breakdown only in internal view — omit the key entirely otherwise.
  if (view === 'internal') {
    document.internalHazardBreakdown = buildInternalHazardBreakdown(components, profileMap)
  }
}

export async function getDocument(
  productLine: string,
  docType: string,
  authUser: AuthUser | null = null,
  opts?: { variantId?: string; view?: DocumentViewMode },
) {
  const role = authUser?.role

  // 1. Check Redis cache (only for the unrestricted/published view — role-gating happens after).
  //    Never cache a variant-derived response — cheap to compute fresh each time, and avoids
  //    needing a variantId × view × role cache-key matrix.
  const cacheable = role !== 'company' && !opts?.variantId
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

  const document: Record<string, unknown> = {
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

  // 3b. Variant-aware sanitized/internal composition+hazards — only meaningful for tds/msds,
  //     and only when a variantId was actually supplied. No variantId → byte-for-byte identical
  //     behavior to before this feature existed (the majority code path).
  if (opts?.variantId && (docType === 'tds' || docType === 'msds')) {
    await applyVariantOverride(document, docType, authUser, opts.variantId, opts.view)
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
