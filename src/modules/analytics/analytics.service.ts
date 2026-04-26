import { eq, gte, lte, and, count, desc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { accessLog } from '../../db/schema/index.js'

export interface AccessLogQuery {
  companyKey?: string
  productKey?: string
  from?: string      // ISO date string
  to?: string        // ISO date string
  page?: number
  limit?: number
}

export async function getAccessLog(query: AccessLogQuery) {
  const page  = query.page  ?? 1
  const limit = query.limit ?? 50
  const offset = (page - 1) * limit

  const conditions = []
  if (query.companyKey) conditions.push(eq(accessLog.companyKey, query.companyKey))
  if (query.productKey) conditions.push(eq(accessLog.productKey, query.productKey))
  if (query.from) conditions.push(gte(accessLog.at, new Date(query.from)))
  if (query.to)   conditions.push(lte(accessLog.at, new Date(query.to)))

  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(accessLog).where(where)

  const events = await db
    .select()
    .from(accessLog)
    .where(where)
    .orderBy(desc(accessLog.at))
    .limit(limit)
    .offset(offset)

  return {
    events: events.map((e) => ({
      id:         e.id,
      companyKey: e.companyKey,
      productKey: e.productKey,
      docType:    e.docType,
      ip:         e.ip,
      userAgent:  e.userAgent,
      at:         e.at.toISOString(),
    })),
    total,
    page,
    limit,
  }
}

/** Aggregated access counts per company — last 30 days */
export async function getAccessSummary() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const byCompany = await db
    .select({
      companyKey: accessLog.companyKey,
      accesses:   count(),
    })
    .from(accessLog)
    .where(gte(accessLog.at, since))
    .groupBy(accessLog.companyKey)
    .orderBy(desc(count()))

  const byProduct = await db
    .select({
      productKey: accessLog.productKey,
      accesses:   count(),
    })
    .from(accessLog)
    .where(gte(accessLog.at, since))
    .groupBy(accessLog.productKey)
    .orderBy(desc(count()))

  // Daily access counts (last 30 days)
  const daily = await db
    .select({
      day:      sql<string>`DATE(${accessLog.at})`.as('day'),
      accesses: count(),
    })
    .from(accessLog)
    .where(gte(accessLog.at, since))
    .groupBy(sql`DATE(${accessLog.at})`)
    .orderBy(sql`DATE(${accessLog.at})`)

  return {
    windowDays:  30,
    byCompany:   byCompany.map((r) => ({ companyKey: r.companyKey, accesses: r.accesses })),
    byProduct:   byProduct.map((r) => ({ productKey: r.productKey, accesses: r.accesses })),
    daily:       daily.map((r) => ({ day: r.day, accesses: r.accesses })),
  }
}
