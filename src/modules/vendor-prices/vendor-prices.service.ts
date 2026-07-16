import { eq, and, desc, asc, isNull, lte, gte, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { vendorMaterialPrices, vendors, inventoryItems } from '../../db/schema/index.js'
import type { CreateVendorPriceBody } from './vendor-prices.schema.js'

// Explicit select object (rather than nested-table joins) so callers get flat
// camelCase rows directly — same idea as the SELECT_COLUMNS sql templates in
// dispatch.service.ts / finished-goods.service.ts, but expressed as a
// type-safe Drizzle query-builder select since this join is simple (one
// inner join, no aggregates).
const JOINED_COLUMNS = {
  id:              vendorMaterialPrices.id,
  vendorId:        vendorMaterialPrices.vendorId,
  inventoryItemId: vendorMaterialPrices.inventoryItemId,
  material:        inventoryItems.material,
  effectiveFrom:   vendorMaterialPrices.effectiveFrom,
  effectiveTo:     vendorMaterialPrices.effectiveTo,
  unitPrice:       vendorMaterialPrices.unitPrice,
  currency:        vendorMaterialPrices.currency,
  unit:            vendorMaterialPrices.unit,
  minimumOrderQty: vendorMaterialPrices.minimumOrderQty,
  leadTimeDays:    vendorMaterialPrices.leadTimeDays,
  remarks:         vendorMaterialPrices.remarks,
  createdBy:       vendorMaterialPrices.createdBy,
  createdAt:       vendorMaterialPrices.createdAt,
  updatedAt:       vendorMaterialPrices.updatedAt,
}

interface JoinedRow {
  id:              string
  vendorId:        string
  inventoryItemId: string
  material:        string
  effectiveFrom:   string
  effectiveTo:     string | null
  unitPrice:       string
  currency:        string
  unit:            'Kg' | 'L'
  minimumOrderQty: string | null
  leadTimeDays:    number | null
  remarks:         string | null
  createdBy:       string | null
  createdAt:       Date
  updatedAt:       Date
}

function toResponse(row: JoinedRow) {
  return {
    id:              row.id,
    vendorId:        row.vendorId,
    inventoryItemId: row.inventoryItemId,
    material:        row.material,
    effectiveFrom:   row.effectiveFrom,
    effectiveTo:     row.effectiveTo,
    unitPrice:       Number(row.unitPrice),
    currency:        row.currency,
    unit:            row.unit,
    minimumOrderQty: row.minimumOrderQty !== null ? Number(row.minimumOrderQty) : null,
    leadTimeDays:    row.leadTimeDays ?? null,
    remarks:         row.remarks ?? null,
    createdBy:       row.createdBy ?? null,
    createdAt:       row.createdAt.toISOString(),
    updatedAt:       row.updatedAt.toISOString(),
  }
}

export type VendorPriceRow = ReturnType<typeof toResponse>

/**
 * Plain existence check against `vendors` — deliberately does NOT import
 * vendors.service.ts's getVendorById. This module's only sanctioned outward
 * coupling is `getEffectivePrice`, consumed by purchase-entries.service.ts;
 * it must not reach inward into another module's service layer.
 */
export async function vendorExists(vendorId: string): Promise<boolean> {
  const [row] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId))
  return !!row
}

export async function inventoryItemExists(inventoryItemId: string): Promise<boolean> {
  const [row] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId))
  return !!row
}

function joinedQuery() {
  return db
    .select(JOINED_COLUMNS)
    .from(vendorMaterialPrices)
    .innerJoin(inventoryItems, eq(vendorMaterialPrices.inventoryItemId, inventoryItems.id))
}

export async function listVendorPrices(vendorId: string, inventoryItemId?: string): Promise<VendorPriceRow[]> {
  const conditions = [eq(vendorMaterialPrices.vendorId, vendorId)]
  if (inventoryItemId) conditions.push(eq(vendorMaterialPrices.inventoryItemId, inventoryItemId))

  const rows = await joinedQuery()
    .where(and(...conditions))
    .orderBy(desc(vendorMaterialPrices.effectiveFrom))

  return rows.map((r) => toResponse(r as JoinedRow))
}

export async function listActiveVendorPrices(vendorId: string, inventoryItemId?: string): Promise<VendorPriceRow[]> {
  const conditions = [eq(vendorMaterialPrices.vendorId, vendorId), isNull(vendorMaterialPrices.effectiveTo)]
  if (inventoryItemId) conditions.push(eq(vendorMaterialPrices.inventoryItemId, inventoryItemId))

  const rows = await joinedQuery()
    .where(and(...conditions))
    .orderBy(desc(vendorMaterialPrices.effectiveFrom))

  return rows.map((r) => toResponse(r as JoinedRow))
}

/** `YYYY-MM-DD` minus one calendar day, computed in UTC to avoid tz drift. */
function subtractOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export type CreateVendorPriceResult =
  | VendorPriceRow
  | { code: 'VENDOR_NOT_FOUND' }
  | { code: 'ITEM_NOT_FOUND' }
  | { code: 'INVALID_EFFECTIVE_DATE'; currentEffectiveFrom: string }

export async function createVendorPrice(
  vendorId: string,
  data: CreateVendorPriceBody,
  createdBy: string | null,
): Promise<CreateVendorPriceResult> {
  if (!(await vendorExists(vendorId))) return { code: 'VENDOR_NOT_FOUND' }
  if (!(await inventoryItemExists(data.inventoryItemId))) return { code: 'ITEM_NOT_FOUND' }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(vendorMaterialPrices)
      .where(and(
        eq(vendorMaterialPrices.vendorId, vendorId),
        eq(vendorMaterialPrices.inventoryItemId, data.inventoryItemId),
        isNull(vendorMaterialPrices.effectiveTo),
      ))

    if (current && data.effectiveFrom <= current.effectiveFrom) {
      return { code: 'INVALID_EFFECTIVE_DATE' as const, currentEffectiveFrom: current.effectiveFrom }
    }

    if (current) {
      // Close the previous active row — never touch its unitPrice, only
      // effectiveTo/updatedAt, preserving full price history.
      await tx
        .update(vendorMaterialPrices)
        .set({ effectiveTo: subtractOneDay(data.effectiveFrom), updatedAt: new Date() })
        .where(eq(vendorMaterialPrices.id, current.id))
    }

    const [inserted] = await tx
      .insert(vendorMaterialPrices)
      .values({
        vendorId,
        inventoryItemId: data.inventoryItemId,
        effectiveFrom:   data.effectiveFrom,
        effectiveTo:     null,
        unitPrice:       String(data.unitPrice),
        currency:        data.currency,
        unit:            data.unit,
        minimumOrderQty: data.minimumOrderQty != null ? String(data.minimumOrderQty) : null,
        leadTimeDays:    data.leadTimeDays ?? null,
        remarks:         data.remarks ?? null,
        createdBy:       createdBy ?? undefined,
      })
      .returning()

    const [material] = await tx
      .select({ material: inventoryItems.material })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, data.inventoryItemId))

    return toResponse({ ...inserted, material: material?.material ?? '' } as JoinedRow)
  })
}

/**
 * Sanctioned outward export — the one function purchase-entries.service.ts
 * (and inventory.service.ts, via getBestEffectiveVendorPrice below) may import
 * from this module. Returns the raw joined row (unitPrice as a number) or
 * null if no vendor price is active for the given vendor+material on `date`.
 */
export async function getEffectivePrice(
  vendorId: string,
  inventoryItemId: string,
  date: string,
): Promise<VendorPriceRow | null> {
  const rows = await joinedQuery()
    .where(and(
      eq(vendorMaterialPrices.vendorId, vendorId),
      eq(vendorMaterialPrices.inventoryItemId, inventoryItemId),
      lte(vendorMaterialPrices.effectiveFrom, date),
      or(isNull(vendorMaterialPrices.effectiveTo), gte(vendorMaterialPrices.effectiveTo, date)),
    ))
    .orderBy(desc(vendorMaterialPrices.effectiveFrom))
    .limit(1)

  const row = rows[0]
  return row ? toResponse(row as JoinedRow) : null
}

/**
 * Across ALL vendors, the lowest unitPrice among rows effective on `date` for
 * `inventoryItemId`. Phase 1 simplification: ties/near-ties are not weighted
 * by lead time, MOQ, or vendor reliability — true multi-vendor comparison is
 * a deferred feature. Returns the number or null if no vendor price applies.
 */
export async function getBestEffectiveVendorPrice(inventoryItemId: string, date: string): Promise<number | null> {
  const rows = await db
    .select({ unitPrice: vendorMaterialPrices.unitPrice })
    .from(vendorMaterialPrices)
    .where(and(
      eq(vendorMaterialPrices.inventoryItemId, inventoryItemId),
      lte(vendorMaterialPrices.effectiveFrom, date),
      or(isNull(vendorMaterialPrices.effectiveTo), gte(vendorMaterialPrices.effectiveTo, date)),
    ))
    .orderBy(asc(vendorMaterialPrices.unitPrice))
    .limit(1)

  return rows[0] ? Number(rows[0].unitPrice) : null
}
