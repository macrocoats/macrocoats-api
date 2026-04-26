import { eq, and } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { productDocuments, products } from '../../db/schema/index.js'
import { cacheGet, cacheSet, cacheDel } from '../../plugins/redis.js'
import type { UpdateDocumentBody } from './products.schema.js'

const CACHE_TTL = 300   // 5 minutes

function cacheKey(productLine: string, docType: string) {
  return `doc:${productLine}:${docType}`
}

export async function getDocument(productLine: string, docType: string) {
  // 1. Check Redis cache
  const cached = await cacheGet(cacheKey(productLine, docType))
  if (cached) return cached

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

  // 3. Build response envelope (mirrors the existing MSW response shape)
  const [product] = await db.select().from(products).where(eq(products.key, productLine))

  const document = {
    productName: product?.displayName ?? '',
    subtitle:    product?.subtitle ?? '',
    accentColor: product?.accentColor ?? '',
    docNumber:   row.docNumber,
    revision:    row.revision,
    company:     'Macro Coats Pvt Ltd',
    location:    'Chennai · India',
    contact:     'info@macrocoats.in',
    phone:       '+91-9884080377',
    ...row.body,
    footer:      row.footer,
  }

  // 4. Cache and return
  await cacheSet(cacheKey(productLine, docType), document, CACHE_TTL)
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

  await db
    .update(productDocuments)
    .set(patch)
    .where(eq(productDocuments.id, existing.id))

  // Invalidate cache
  await cacheDel(cacheKey(productLine, docType))

  return getDocument(productLine, docType)
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
