import { eq, gte, lte, and, or, ilike, count, countDistinct, desc, sql, inArray, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { accessLog, companies } from '../../db/schema/index.js'
import { cacheGet, cacheSet } from '../../plugins/redis.js'

/** Document types that count as a customer "document open" in the access analytics. */
export const ACCESS_DOC_TYPES = ['tds', 'msds'] as const
type AccessDocType = typeof ACCESS_DOC_TYPES[number]

interface AccessLogQuery {
  companyKey?: string
  productKey?: string
  docType?: AccessDocType
  q?: string         // free-text: company key/name, product key, IP
  customerOnly?: boolean  // only TDS/MSDS opens by a company user (the Document access view)
  from?: string      // ISO date string
  to?: string        // ISO date string
  page?: number
  limit?: number
}

/** Escape LIKE wildcards so a user's `%` or `_` is matched literally. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function getAccessLog(query: AccessLogQuery) {
  const page  = query.page  ?? 1
  const limit = query.limit ?? 50
  const offset = (page - 1) * limit

  const conditions: SQL[] = []
  if (query.companyKey) conditions.push(eq(accessLog.companyKey, query.companyKey))
  if (query.productKey) conditions.push(eq(accessLog.productKey, query.productKey))
  if (query.docType)    conditions.push(eq(accessLog.docType, query.docType))
  if (query.customerOnly) {
    conditions.push(sql`${accessLog.companyKey} IS NOT NULL`, inArray(accessLog.docType, [...ACCESS_DOC_TYPES]))
  }
  if (query.from) conditions.push(gte(accessLog.at, new Date(query.from)))
  if (query.to)   conditions.push(lte(accessLog.at, new Date(query.to)))
  const q = query.q?.trim()
  if (q) {
    const pattern = `%${likeEscape(q)}%`
    const matchingCompanyKeys = db
      .select({ key: companies.key })
      .from(companies)
      .where(ilike(companies.displayName, pattern))
    conditions.push(or(
      ilike(accessLog.companyKey, pattern),
      ilike(accessLog.productKey, pattern),
      sql`host(${accessLog.ip}) ILIKE ${pattern}`,
      inArray(accessLog.companyKey, matchingCompanyKeys),
    )!)
  }

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

const SUMMARY_CACHE_KEY = 'analytics:summary'
const SUMMARY_TTL = 120

/** Aggregated access counts per company — last 30 days */
export async function getAccessSummary() {
  const cached = await cacheGet<ReturnType<typeof buildSummary>>(SUMMARY_CACHE_KEY)
  if (cached) return cached

  const result = await buildSummary()
  await cacheSet(SUMMARY_CACHE_KEY, result, SUMMARY_TTL)
  return result
}

async function buildSummary() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [byCompany, byProduct, daily] = await Promise.all([
    db
      .select({ companyKey: accessLog.companyKey, accesses: count() })
      .from(accessLog)
      .where(gte(accessLog.at, since))
      .groupBy(accessLog.companyKey)
      .orderBy(desc(count())),

    db
      .select({ productKey: accessLog.productKey, accesses: count() })
      .from(accessLog)
      .where(gte(accessLog.at, since))
      .groupBy(accessLog.productKey)
      .orderBy(desc(count())),

    db
      .select({
        day:      sql<string>`DATE(${accessLog.at})`.as('day'),
        accesses: count(),
      })
      .from(accessLog)
      .where(gte(accessLog.at, since))
      .groupBy(sql`DATE(${accessLog.at})`)
      .orderBy(sql`DATE(${accessLog.at})`),
  ])

  return {
    windowDays: 30,
    byCompany:  byCompany.map((r) => ({ companyKey: r.companyKey, accesses: r.accesses })),
    byProduct:  byProduct.map((r) => ({ productKey: r.productKey, accesses: r.accesses })),
    daily:      daily.map((r) => ({ day: r.day, accesses: r.accesses })),
  }
}

/* ── Access overview (Operations Center → Insights → Document access) ─────── */

const ACCESS_OVERVIEW_DAYS = [7, 30, 90] as const
type AccessOverviewDays = typeof ACCESS_OVERVIEW_DAYS[number]

interface AccessOverviewQuery {
  days: AccessOverviewDays
  companyKey?: string
  productKey?: string
  docType?: AccessDocType
}

/** Calendar day in the factory's timezone — a 23:30 IST open belongs to that IST day, not the UTC one. */
const istDay = sql<string>`to_char((${accessLog.at} AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD')`

const OVERVIEW_TTL = 120

/**
 * Aggregated document-open "cube" for the Document access view. Everything the
 * page shows (KPIs, per-day chart, heatmap, weekday split, by-company table,
 * period-over-period change) is derived client-side from these rows, so a
 * filter change on the page never needs a second round trip.
 *
 * - `cube` covers the current window AND the equal-length window before it
 *   (2 × days), unfiltered, so client-side filters and the "vs previous" deltas
 *   are consistent with each other. Cardinality is bounded by
 *   days × companies × products × 2, not by raw event volume.
 * - `uniqueIps` can't be derived from aggregated rows, so it is computed here
 *   for the current window with the requested filters applied.
 * - `lastOpenByCompany` is all-time (for the "gone quiet" list).
 *
 * Only TDS/MSDS opens by a company are counted — staff views carry no companyKey.
 */
export async function getAccessOverview(query: AccessOverviewQuery) {
  const key = `analytics:overview:${query.days}:${query.companyKey ?? ''}:${query.productKey ?? ''}:${query.docType ?? ''}`
  const cached = await cacheGet<Awaited<ReturnType<typeof buildOverview>>>(key)
  if (cached) return cached
  const result = await buildOverview(query)
  await cacheSet(key, result, OVERVIEW_TTL)
  return result
}

async function buildOverview(query: AccessOverviewQuery) {
  const now = Date.now()
  const currentFrom = new Date(now - query.days * 864e5)
  const cubeFrom    = new Date(now - query.days * 2 * 864e5)

  const companyOpen = and(
    sql`${accessLog.companyKey} IS NOT NULL`,
    inArray(accessLog.docType, [...ACCESS_DOC_TYPES]),
  )!

  const ipConditions: SQL[] = [companyOpen, gte(accessLog.at, currentFrom)]
  if (query.companyKey) ipConditions.push(eq(accessLog.companyKey, query.companyKey))
  if (query.productKey) ipConditions.push(eq(accessLog.productKey, query.productKey))
  if (query.docType)    ipConditions.push(eq(accessLog.docType, query.docType))

  const [cube, [{ uniqueIps }], lastOpen] = await Promise.all([
    db
      .select({
        day:        istDay.as('day'),
        companyKey: accessLog.companyKey,
        productKey: accessLog.productKey,
        docType:    accessLog.docType,
        opens:      count(),
      })
      .from(accessLog)
      .where(and(companyOpen, gte(accessLog.at, cubeFrom)))
      .groupBy(istDay, accessLog.companyKey, accessLog.productKey, accessLog.docType)
      .orderBy(istDay),

    db
      .select({ uniqueIps: countDistinct(accessLog.ip) })
      .from(accessLog)
      .where(and(...ipConditions)),

    db
      .selectDistinctOn([accessLog.companyKey], {
        companyKey: accessLog.companyKey,
        productKey: accessLog.productKey,
        docType:    accessLog.docType,
        at:         accessLog.at,
      })
      .from(accessLog)
      .where(companyOpen)
      .orderBy(accessLog.companyKey, desc(accessLog.at)),
  ])

  return {
    days:  query.days,
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(now)),
    cube: cube.map((r) => ({
      day:        r.day,
      companyKey: r.companyKey as string,
      productKey: r.productKey as string,
      docType:    r.docType as AccessDocType,
      opens:      Number(r.opens),
    })),
    uniqueIps: Number(uniqueIps),
    lastOpenByCompany: lastOpen.map((r) => ({
      companyKey: r.companyKey as string,
      productKey: r.productKey,
      docType:    r.docType,
      at:         r.at.toISOString(),
    })),
  }
}
