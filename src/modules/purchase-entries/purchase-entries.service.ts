import { eq, and, desc, lte, gte, count, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { purchaseEntries, vendors, inventoryItems } from '../../db/schema/index.js'
import { getEffectivePrice } from '../vendor-prices/vendor-prices.service.js'
import type { CreatePurchaseEntryBody, ListPurchaseEntriesQuery, PurchaseSummaryQuery } from './purchase-entries.schema.js'

const JOINED_COLUMNS = {
  id:                 purchaseEntries.id,
  vendorId:           purchaseEntries.vendorId,
  vendorName:         vendors.vendorName,
  inventoryItemId:    purchaseEntries.inventoryItemId,
  material:           inventoryItems.material,
  purchaseDate:       purchaseEntries.purchaseDate,
  quantity:           purchaseEntries.quantity,
  unit:               purchaseEntries.unit,
  unitPrice:          purchaseEntries.unitPrice,
  suggestedUnitPrice: purchaseEntries.suggestedUnitPrice,
  priceSource:        purchaseEntries.priceSource,
  vendorPriceId:      purchaseEntries.vendorPriceId,
  invoiceNumber:      purchaseEntries.invoiceNumber,
  remarks:            purchaseEntries.remarks,
  createdBy:          purchaseEntries.createdBy,
  createdAt:          purchaseEntries.createdAt,
  // Price paid on the purchase of the same material immediately before this one
  // (any vendor), ordered by receipt date then record time. Powers "vs last".
  previousUnitPrice:  sql<string | null>`(
    SELECT pp.unit_price FROM purchase_entries pp
    WHERE  pp.inventory_item_id = ${purchaseEntries.inventoryItemId}
      AND  (pp.purchase_date, pp.created_at) < (${purchaseEntries.purchaseDate}, ${purchaseEntries.createdAt})
    ORDER  BY pp.purchase_date DESC, pp.created_at DESC
    LIMIT  1
  )`,
  previousPurchaseDate: sql<string | null>`(
    SELECT to_char(pp.purchase_date, 'YYYY-MM-DD') FROM purchase_entries pp
    WHERE  pp.inventory_item_id = ${purchaseEntries.inventoryItemId}
      AND  (pp.purchase_date, pp.created_at) < (${purchaseEntries.purchaseDate}, ${purchaseEntries.createdAt})
    ORDER  BY pp.purchase_date DESC, pp.created_at DESC
    LIMIT  1
  )`,
}

interface JoinedRow {
  id:                 string
  vendorId:           string
  vendorName:         string
  inventoryItemId:    string
  material:           string
  purchaseDate:        string
  quantity:            string
  unit:                'Kg' | 'L'
  unitPrice:           string
  suggestedUnitPrice:  string | null
  priceSource:         'vendor_price_history' | 'manual'
  vendorPriceId:       string | null
  invoiceNumber:       string | null
  remarks:             string | null
  createdBy:           string | null
  createdAt:           Date
  previousUnitPrice?:   string | null
  previousPurchaseDate?: string | null
}

function toResponse(row: JoinedRow) {
  const quantity  = Number(row.quantity)
  const unitPrice = Number(row.unitPrice)
  return {
    id:                 row.id,
    vendorId:           row.vendorId,
    vendorName:         row.vendorName,
    inventoryItemId:    row.inventoryItemId,
    material:           row.material,
    purchaseDate:       row.purchaseDate,
    quantity,
    unit:               row.unit,
    unitPrice,
    // Computed at read time — purchase_entries has no totalAmount column by design.
    totalAmount:        Number((quantity * unitPrice).toFixed(2)),
    suggestedUnitPrice: row.suggestedUnitPrice !== null ? Number(row.suggestedUnitPrice) : null,
    priceSource:        row.priceSource,
    vendorPriceId:      row.vendorPriceId,
    invoiceNumber:      row.invoiceNumber,
    remarks:            row.remarks,
    createdBy:          row.createdBy,
    createdAt:          row.createdAt.toISOString(),
    previousUnitPrice:    row.previousUnitPrice != null ? Number(row.previousUnitPrice) : null,
    previousPurchaseDate: row.previousPurchaseDate ?? null,
  }
}

type PurchaseEntryRow = ReturnType<typeof toResponse>

function joinedQuery() {
  return db
    .select(JOINED_COLUMNS)
    .from(purchaseEntries)
    .innerJoin(vendors, eq(purchaseEntries.vendorId, vendors.id))
    .innerJoin(inventoryItems, eq(purchaseEntries.inventoryItemId, inventoryItems.id))
}

type EntryFilters = Pick<ListPurchaseEntriesQuery, 'vendorId' | 'inventoryItemId' | 'dateFrom' | 'dateTo'>

function filterConditions(query: EntryFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (query.vendorId)        conditions.push(eq(purchaseEntries.vendorId, query.vendorId))
  if (query.inventoryItemId) conditions.push(eq(purchaseEntries.inventoryItemId, query.inventoryItemId))
  if (query.dateFrom)        conditions.push(gte(purchaseEntries.purchaseDate, query.dateFrom))
  if (query.dateTo)          conditions.push(lte(purchaseEntries.purchaseDate, query.dateTo))
  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function listPurchaseEntries(query: ListPurchaseEntriesQuery) {
  const offset = (query.page - 1) * query.limit
  const where = filterConditions(query)
  const order = query.sort === 'purchaseDate'
    ? [desc(purchaseEntries.purchaseDate), desc(purchaseEntries.createdAt)]
    : [desc(purchaseEntries.createdAt)]

  const [{ total }] = await db.select({ total: count() }).from(purchaseEntries).where(where)

  const rows = await joinedQuery()
    .where(where)
    .orderBy(...order)
    .limit(query.limit)
    .offset(offset)

  return {
    purchaseEntries: rows.map((r) => toResponse(r as JoinedRow)),
    total,
    page:  query.page,
    limit: query.limit,
  }
}

export async function getPurchaseEntryById(id: string): Promise<PurchaseEntryRow | null> {
  const [row] = await joinedQuery().where(eq(purchaseEntries.id, id))
  return row ? toResponse(row as JoinedRow) : null
}

// ── Summary (Purchase entries page header + charts) ─────────────────────────
// Read-only aggregates over every entry; nothing stored. `monthly`/`byVendor`
// cover the trailing `months` window and ignore the filters; `filtered`
// describes exactly the rows the list shows for the same filters.

type MonthRow = { month: string; totalValue: string; entryCount: string }
type VendorRow = { vendorId: string; vendorName: string; totalValue: string; entryCount: string }
type FilteredRow = {
  entryCount: string; totalValue: string; vendorHistoryCount: string; manualCount: string; priceRiseCount: string
}

const PRICE_RISE_WINDOW_DAYS = 90

export async function getPurchaseSummary(query: PurchaseSummaryQuery) {
  const monthsBack = query.months - 1

  const monthly = await db.execute<MonthRow>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', current_date) - make_interval(months => ${monthsBack}::int),
        date_trunc('month', current_date),
        interval '1 month'
      )::date AS month_start
    )
    SELECT to_char(m.month_start, 'YYYY-MM') AS "month",
           COALESCE(SUM(pe.quantity * pe.unit_price), 0) AS "totalValue",
           COUNT(pe.id) AS "entryCount"
    FROM   months m
    LEFT   JOIN purchase_entries pe
           ON date_trunc('month', pe.purchase_date) = m.month_start
    GROUP  BY m.month_start
    ORDER  BY m.month_start
  `)

  const byVendor = await db.execute<VendorRow>(sql`
    SELECT v.id AS "vendorId", v.vendor_name AS "vendorName",
           SUM(pe.quantity * pe.unit_price) AS "totalValue",
           COUNT(pe.id) AS "entryCount"
    FROM   purchase_entries pe
    JOIN   vendors v ON v.id = pe.vendor_id
    WHERE  pe.purchase_date >= date_trunc('month', current_date) - make_interval(months => ${monthsBack}::int)
    GROUP  BY v.id, v.vendor_name
    ORDER  BY "totalValue" DESC
  `)

  const conditions: SQL[] = []
  if (query.vendorId)        conditions.push(sql`pe.vendor_id = ${query.vendorId}`)
  if (query.inventoryItemId) conditions.push(sql`pe.inventory_item_id = ${query.inventoryItemId}`)
  if (query.dateFrom)        conditions.push(sql`pe.purchase_date >= ${query.dateFrom}`)
  if (query.dateTo)          conditions.push(sql`pe.purchase_date <= ${query.dateTo}`)
  const whereClause = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``

  const [filtered] = await db.execute<FilteredRow>(sql`
    WITH scoped AS (
      SELECT pe.*,
             LAG(pe.unit_price) OVER (
               PARTITION BY pe.inventory_item_id ORDER BY pe.purchase_date, pe.created_at
             ) AS prev_price
      FROM   purchase_entries pe
    )
    SELECT COUNT(*) AS "entryCount",
           COALESCE(SUM(pe.quantity * pe.unit_price), 0) AS "totalValue",
           COUNT(*) FILTER (WHERE pe.price_source = 'vendor_price_history') AS "vendorHistoryCount",
           COUNT(*) FILTER (WHERE pe.price_source = 'manual') AS "manualCount",
           COUNT(*) FILTER (WHERE pe.prev_price IS NOT NULL AND pe.unit_price > pe.prev_price) AS "priceRiseCount"
    FROM   scoped pe
    ${whereClause}
  `)

  // Price rises over the trailing window, independent of filters — a header KPI.
  const [rises] = await db.execute<{ priceRiseCount: string }>(sql`
    WITH scoped AS (
      SELECT pe.purchase_date, pe.unit_price,
             LAG(pe.unit_price) OVER (
               PARTITION BY pe.inventory_item_id ORDER BY pe.purchase_date, pe.created_at
             ) AS prev_price
      FROM   purchase_entries pe
    )
    SELECT COUNT(*) FILTER (
             WHERE prev_price IS NOT NULL AND unit_price > prev_price
               AND purchase_date >= current_date - ${PRICE_RISE_WINDOW_DAYS}::int
           ) AS "priceRiseCount"
    FROM scoped
  `)

  const [manual] = await db.execute<{ manualCount: string }>(sql`
    SELECT COUNT(*) FILTER (WHERE price_source = 'manual') AS "manualCount" FROM purchase_entries
  `)

  return {
    monthly: monthly.map((r) => ({ month: r.month, totalValue: Number(r.totalValue), entryCount: Number(r.entryCount) })),
    byVendor: byVendor.map((r) => ({
      vendorId: r.vendorId, vendorName: r.vendorName, totalValue: Number(r.totalValue), entryCount: Number(r.entryCount),
    })),
    priceRises: { windowDays: PRICE_RISE_WINDOW_DAYS, count: Number(rises?.priceRiseCount ?? 0) },
    manualCount: Number(manual?.manualCount ?? 0),
    filtered: {
      entryCount:         Number(filtered?.entryCount ?? 0),
      totalValue:         Number(filtered?.totalValue ?? 0),
      vendorHistoryCount: Number(filtered?.vendorHistoryCount ?? 0),
      manualCount:        Number(filtered?.manualCount ?? 0),
      priceRiseCount:     Number(filtered?.priceRiseCount ?? 0),
    },
  }
}

// ── Recent purchase prices per material (Inventory sparkline + inspector) ────

type RecentRow = {
  inventoryItemId: string; purchaseDate: string; unitPrice: string; quantity: string
  unit: 'Kg' | 'L'; vendorName: string; purchaseCount: string
}

/** Last `limit` purchases per inventory item, oldest → newest, plus each item's total count. */
export async function getRecentPurchasesByItem(limit: number) {
  const rows = await db.execute<RecentRow>(sql`
    SELECT * FROM (
      SELECT pe.inventory_item_id AS "inventoryItemId",
             to_char(pe.purchase_date, 'YYYY-MM-DD') AS "purchaseDate",
             pe.unit_price AS "unitPrice", pe.quantity AS "quantity", pe.unit AS "unit",
             v.vendor_name AS "vendorName",
             COUNT(*)     OVER (PARTITION BY pe.inventory_item_id) AS "purchaseCount",
             ROW_NUMBER() OVER (PARTITION BY pe.inventory_item_id ORDER BY pe.purchase_date DESC, pe.created_at DESC) AS rn
      FROM   purchase_entries pe
      JOIN   vendors v ON v.id = pe.vendor_id
    ) ranked
    WHERE rn <= ${limit}
    ORDER BY "inventoryItemId", rn DESC
  `)

  const byItem: Record<string, {
    purchaseCount: number
    recent: Array<{ purchaseDate: string; unitPrice: number; quantity: number; unit: 'Kg' | 'L'; vendorName: string }>
  }> = {}
  for (const r of rows) {
    const entry = (byItem[r.inventoryItemId] ??= { purchaseCount: Number(r.purchaseCount), recent: [] })
    entry.recent.push({
      purchaseDate: r.purchaseDate, unitPrice: Number(r.unitPrice), quantity: Number(r.quantity), unit: r.unit, vendorName: r.vendorName,
    })
  }
  return byItem
}

type CreatePurchaseEntryResult =
  | PurchaseEntryRow
  | { code: 'PRICE_NOT_AVAILABLE' }

export async function createPurchaseEntry(
  data: CreatePurchaseEntryBody,
  createdBy: string | null,
): Promise<CreatePurchaseEntryResult> {
  const effective = await getEffectivePrice(data.vendorId, data.inventoryItemId, data.purchaseDate)

  let unitPrice: number
  let priceSource: 'vendor_price_history' | 'manual'
  let suggestedUnitPrice: number | null
  let vendorPriceId: string | null

  if (data.unitPrice !== undefined) {
    unitPrice          = data.unitPrice
    priceSource        = 'manual'
    suggestedUnitPrice = effective ? effective.unitPrice : null
    vendorPriceId      = effective ? effective.id : null
  } else {
    if (!effective) return { code: 'PRICE_NOT_AVAILABLE' }
    unitPrice          = effective.unitPrice
    priceSource        = 'vendor_price_history'
    suggestedUnitPrice = effective.unitPrice
    vendorPriceId      = effective.id
  }

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(purchaseEntries)
      .values({
        vendorId:           data.vendorId,
        inventoryItemId:    data.inventoryItemId,
        purchaseDate:       data.purchaseDate,
        quantity:           String(data.quantity),
        unit:               data.unit,
        unitPrice:          String(unitPrice),
        suggestedUnitPrice: suggestedUnitPrice !== null ? String(suggestedUnitPrice) : null,
        priceSource,
        vendorPriceId,
        invoiceNumber:      data.invoiceNumber ?? null,
        remarks:            data.remarks ?? null,
        createdBy:          createdBy ?? undefined,
      })
      .returning()

    // ── Atomic inventory stock increment ─────────────────────────────────────
    // Same parameterized `sql` tagged-template UPDATE idiom used in
    // batches.service.ts::createBatch for stock deduction — every value is
    // bound through the tag (no string interpolation), so this is not
    // vulnerable to SQL injection.
    await tx.execute(sql`
      UPDATE inventory_items
      SET    stock_qty  = COALESCE(stock_qty, 0) + ${data.quantity}::numeric,
             updated_at = now(),
             updated_by = ${createdBy}
      WHERE  id = ${data.inventoryItemId}
    `)

    const [vendor]   = await tx.select({ vendorName: vendors.vendorName }).from(vendors).where(eq(vendors.id, data.vendorId))
    const [material] = await tx.select({ material: inventoryItems.material }).from(inventoryItems).where(eq(inventoryItems.id, data.inventoryItemId))

    return toResponse({
      ...inserted,
      vendorName: vendor?.vendorName ?? '',
      material:   material?.material ?? '',
    } as JoinedRow)
  })
}

/**
 * Nearest purchase_entries row with purchaseDate <= date for this material,
 * across all vendors. Consumed by inventory.service.ts::getReceiptDatePrices
 * as the first (most authoritative) tier of receipt-date price resolution.
 */
export async function getLatestPurchaseEntryPrice(inventoryItemId: string, date: string): Promise<number | null> {
  const rows = await db
    .select({ unitPrice: purchaseEntries.unitPrice })
    .from(purchaseEntries)
    .where(and(
      eq(purchaseEntries.inventoryItemId, inventoryItemId),
      lte(purchaseEntries.purchaseDate, date),
    ))
    .orderBy(desc(purchaseEntries.purchaseDate))
    .limit(1)

  return rows[0] ? Number(rows[0].unitPrice) : null
}
