import { eq, like, desc, count, sql, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { quotations, quotationLineItems } from '../../db/schema/index.js'
import { nextQuotNumber } from '../../utils/quotNumber.js'
import type { CreateQuotationBody, ListQuotationsQuery } from './quotations.schema.js'

function toQuotationResponse(
  q: typeof quotations.$inferSelect,
  items: typeof quotationLineItems.$inferSelect[],
) {
  return {
    id:           q.id,
    quotNumber:   q.quotNumber,
    customerName: q.customerName,
    quotDate:     q.quotDate,
    validDays:    q.validDays,
    validUntil:   q.validUntil,
    createdAt:    q.createdAt.toISOString(),
    lineItems:    items.map((li) => ({
      id:          li.id,
      sortOrder:   li.sortOrder,
      catalogId:   li.catalogId,
      description: li.description,
      code:        li.code,
      qty:         li.qty !== null ? Number(li.qty) : null,
      rate:        Number(li.rate),
    })),
  }
}

export async function createQuotation(data: CreateQuotationBody, createdBy: string) {
  return db.transaction(async (tx) => {
    const quotNumber = await nextQuotNumber(tx as typeof db)

    // Compute validUntil date
    const quotDateObj = new Date(data.quotDate)
    quotDateObj.setDate(quotDateObj.getDate() + data.validDays)
    const validUntil = quotDateObj.toISOString().slice(0, 10)

    const [quot] = await tx
      .insert(quotations)
      .values({
        quotNumber,
        customerName: data.customerName,
        quotDate:     data.quotDate,
        validDays:    data.validDays,
        validUntil,
        createdBy,
      })
      .returning()

    const lineItemRows = data.lineItems.map((li, i) => ({
      quotationId: quot.id,
      sortOrder:   i + 1,
      catalogId:   li.catalogId,
      description: li.description,
      code:        li.code,
      qty:         li.qty !== null ? String(li.qty) : null,
      rate:        String(li.rate),
    }))

    const items = await tx
      .insert(quotationLineItems)
      .values(lineItemRows)
      .returning()

    return toQuotationResponse(quot, items)
  })
}

export async function listQuotations(query: ListQuotationsQuery) {
  const offset = (query.page - 1) * query.limit

  const baseWhere = query.customerName
    ? like(quotations.customerName, `%${query.customerName}%`)
    : undefined

  const [{ total }] = await db
    .select({ total: count() })
    .from(quotations)
    .where(baseWhere)

  const rows = await db
    .select()
    .from(quotations)
    .where(baseWhere)
    .orderBy(desc(quotations.createdAt))
    .limit(query.limit)
    .offset(offset)

  const ids = rows.map((q) => q.id)
  const allItems = ids.length
    ? await db.select().from(quotationLineItems).where(inArray(quotationLineItems.quotationId, ids))
    : []

  const itemsById = new Map<string, typeof quotationLineItems.$inferSelect[]>()
  for (const item of allItems) {
    const list = itemsById.get(item.quotationId) ?? []
    list.push(item)
    itemsById.set(item.quotationId, list)
  }

  const results = rows.map((q) => toQuotationResponse(q, itemsById.get(q.id) ?? []))

  return { quotations: results, total, page: query.page, limit: query.limit }
}

export async function getQuotationById(id: string) {
  const [quot] = await db.select().from(quotations).where(eq(quotations.id, id))
  if (!quot) return null

  const items = await db
    .select()
    .from(quotationLineItems)
    .where(eq(quotationLineItems.quotationId, id))

  return toQuotationResponse(quot, items)
}
