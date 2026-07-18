import { eq, ne, and, asc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { vendors, purchaseOrders, purchaseOrderItems } from '../../db/schema/index.js'
import { z } from 'zod'
import { phoneNumbersSchema, bankDetailsSchema } from './vendors.schema.js'
import type { CreateVendorInput, UpdateVendorInput } from './vendors.schema.js'

// `chemicals` was removed from the create/update API surface (vendors.schema.ts)
// but the DB column and existing rows remain — this local schema is only for
// parsing/validating legacy data on read, never accepted as input anymore.
const chemicalSchema = z.object({
  chemicalName: z.string().min(1),
  rate:         z.number().min(0),
  unit:         z.enum(['L', 'kg']),
})

function toResponse(row: typeof vendors.$inferSelect) {
  return {
    id:            row.id,
    vendorName:    row.vendorName,
    gstNumber:     row.gstNumber,
    address:       row.address ?? null,
    email:         row.email ?? null,
    contactPerson: row.contactPerson ?? null,
    phoneNumbers:  phoneNumbersSchema.catch([]).parse(row.phoneNumbers),
    bankDetails:   bankDetailsSchema.catch(undefined).parse(row.bankDetails) ?? null,
    chemicals:     z.array(chemicalSchema).catch([]).parse(row.chemicals),
    createdAt:     row.createdAt.toISOString(),
  }
}

export async function listVendors() {
  const rows = await db
    .select()
    .from(vendors)
    .orderBy(asc(vendors.vendorName))

  return rows.map(toResponse)
}

export async function getVendorById(id: string) {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id))
  return row ? toResponse(row) : null
}

export async function createVendor(data: CreateVendorInput) {
  const [row] = await db
    .insert(vendors)
    .values({
      vendorName:    data.vendorName,
      gstNumber:     data.gstNumber,
      address:       data.address ?? null,
      email:         data.email || null,
      contactPerson: data.contactPerson ?? null,
      phoneNumbers:  data.phoneNumbers ?? [],
      bankDetails:   data.bankDetails ?? null,
      // `chemicals` is no longer part of the create API — new vendors always
      // start with an empty array; existing rows keep their historical data.
      chemicals:     [],
    })
    .returning()

  return toResponse(row)
}

export async function updateVendor(id: string, data: UpdateVendorInput) {
  const patch: Partial<typeof vendors.$inferInsert> = {}

  if (data.vendorName    !== undefined) patch.vendorName    = data.vendorName
  if (data.gstNumber     !== undefined) patch.gstNumber     = data.gstNumber
  if (data.address       !== undefined) patch.address       = data.address ?? null
  if (data.email         !== undefined) patch.email         = data.email || null
  if (data.contactPerson !== undefined) patch.contactPerson = data.contactPerson ?? null
  if (data.phoneNumbers  !== undefined) patch.phoneNumbers  = data.phoneNumbers
  if (data.bankDetails   !== undefined) patch.bankDetails   = data.bankDetails ?? null
  // `chemicals` is no longer accepted via the update API — never patched here;
  // existing values are left untouched on the row.

  const [row] = await db
    .update(vendors)
    .set(patch)
    .where(eq(vendors.id, id))
    .returning()

  return row ? toResponse(row) : null
}

export async function deleteVendor(id: string): Promise<boolean> {
  const result = await db
    .delete(vendors)
    .where(eq(vendors.id, id))
    .returning({ id: vendors.id })

  return result.length > 0
}

/**
 * Purchase-order rollup for a vendor's detail view. Reads purchase_orders /
 * purchase_order_items directly (not through purchase-orders.service.ts) —
 * the same "read another module's schema tables directly" norm already used
 * by purchase-entries.service.ts for `vendors`/`inventoryItems`.
 *
 * `status = 'cancelled'` orders are excluded entirely from both the order
 * count and the value total. No GROUP BY here — a single-row aggregate, so
 * a vendor with zero (non-cancelled) orders still gets one row back with
 * totalOrders=0 rather than no rows at all.
 */
export async function getVendorPurchaseSummary(vendorId: string) {
  const [row] = await db
    .select({
      totalOrders:      sql<string>`count(distinct ${purchaseOrders.id})`,
      totalValue:       sql<string>`coalesce(sum(${purchaseOrderItems.quantity} * ${purchaseOrderItems.unitPrice} * (1 + ${purchaseOrderItems.gstPercent} / 100)), 0)`,
      lastPurchaseDate: sql<string | null>`max(${purchaseOrders.poDate})`,
    })
    .from(purchaseOrders)
    .innerJoin(purchaseOrderItems, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
    .where(and(eq(purchaseOrders.vendorId, vendorId), ne(purchaseOrders.status, 'cancelled')))

  return {
    totalOrders:      Number(row?.totalOrders ?? 0),
    totalValue:       Number(row?.totalValue ?? 0),
    lastPurchaseDate: row?.lastPurchaseDate ?? null,
  }
}
