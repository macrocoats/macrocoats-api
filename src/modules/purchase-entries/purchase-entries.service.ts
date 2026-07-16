import { eq, and, desc, lte, gte, count, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { purchaseEntries, vendors, inventoryItems } from '../../db/schema/index.js'
import { getEffectivePrice } from '../vendor-prices/vendor-prices.service.js'
import type { CreatePurchaseEntryBody, ListPurchaseEntriesQuery } from './purchase-entries.schema.js'

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
  }
}

export type PurchaseEntryRow = ReturnType<typeof toResponse>

function joinedQuery() {
  return db
    .select(JOINED_COLUMNS)
    .from(purchaseEntries)
    .innerJoin(vendors, eq(purchaseEntries.vendorId, vendors.id))
    .innerJoin(inventoryItems, eq(purchaseEntries.inventoryItemId, inventoryItems.id))
}

export async function listPurchaseEntries(query: ListPurchaseEntriesQuery) {
  const offset = (query.page - 1) * query.limit

  const conditions: SQL[] = []
  if (query.vendorId)        conditions.push(eq(purchaseEntries.vendorId, query.vendorId))
  if (query.inventoryItemId) conditions.push(eq(purchaseEntries.inventoryItemId, query.inventoryItemId))
  if (query.dateFrom)        conditions.push(gte(purchaseEntries.purchaseDate, query.dateFrom))
  if (query.dateTo)          conditions.push(lte(purchaseEntries.purchaseDate, query.dateTo))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(purchaseEntries).where(where)

  const rows = await joinedQuery()
    .where(where)
    .orderBy(desc(purchaseEntries.createdAt))
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

export type CreatePurchaseEntryResult =
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
