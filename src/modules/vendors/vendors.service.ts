import { eq, asc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { vendors } from '../../db/schema/index.js'
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

// ── Insights (Vendors ledger list + vendor detail page) ──────────────────────
// Read-only aggregates over purchase_entries and vendor_material_prices; nothing
// stored. Spend = quantity × unit price by receipt date over the trailing
// `INSIGHT_MONTHS` calendar months (current month included, month to date).

const INSIGHT_MONTHS = 6

type MonthKeyRow = { month: string }
type VendorMonthRow = { vendorId: string; month: string; totalValue: string }
type LastReceiptRow = { vendorId: string; lastReceipt: string }
type ActiveRateRow = {
  vendorId: string; inventoryItemId: string; material: string; unitPrice: string; unit: 'Kg' | 'L'
  effectiveFrom: string; previousPrice: string | null
}

async function insightMonths(): Promise<string[]> {
  const rows = await db.execute<MonthKeyRow>(sql`
    SELECT to_char(gs, 'YYYY-MM') AS "month"
    FROM   generate_series(
             date_trunc('month', current_date) - make_interval(months => ${INSIGHT_MONTHS - 1}::int),
             date_trunc('month', current_date),
             interval '1 month'
           ) AS gs
    ORDER  BY gs
  `)
  return rows.map((r) => r.month)
}

/** Current price of every active vendor rate, with the price it replaced (null = first rate). */
async function activeRatesWithPrevious(vendorId?: string): Promise<ActiveRateRow[]> {
  const scope = vendorId ? sql`WHERE vmp.vendor_id = ${vendorId}` : sql``
  return db.execute<ActiveRateRow>(sql`
    WITH ranked AS (
      SELECT vmp.vendor_id, vmp.inventory_item_id, ii.material, vmp.unit_price, vmp.unit,
             to_char(vmp.effective_from, 'YYYY-MM-DD') AS effective_from, vmp.effective_to,
             LAG(vmp.unit_price) OVER (
               PARTITION BY vmp.vendor_id, vmp.inventory_item_id ORDER BY vmp.effective_from
             ) AS previous_price
      FROM   vendor_material_prices vmp
      JOIN   inventory_items ii ON ii.id = vmp.inventory_item_id
      ${scope}
    )
    SELECT vendor_id AS "vendorId", inventory_item_id AS "inventoryItemId", material,
           unit_price AS "unitPrice", unit, effective_from AS "effectiveFrom",
           previous_price AS "previousPrice"
    FROM   ranked
    WHERE  effective_to IS NULL
    ORDER  BY effective_from DESC
  `) as unknown as Promise<ActiveRateRow[]>
}

const pctChange = (previous: number | null, current: number) =>
  previous && previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(2)) : null

/** GET /vendors/insights — per-vendor spend, monthly series, last receipt and rate movement. */
export async function getVendorsInsights() {
  const months = await insightMonths()
  const monthly = await db.execute<VendorMonthRow>(sql`
    SELECT pe.vendor_id AS "vendorId", to_char(date_trunc('month', pe.purchase_date), 'YYYY-MM') AS "month",
           SUM(pe.quantity * pe.unit_price) AS "totalValue"
    FROM   purchase_entries pe
    WHERE  pe.purchase_date >= date_trunc('month', current_date) - make_interval(months => ${INSIGHT_MONTHS - 1}::int)
    GROUP  BY 1, 2
  `)
  const lastReceipts = await db.execute<LastReceiptRow>(sql`
    SELECT vendor_id AS "vendorId", to_char(MAX(purchase_date), 'YYYY-MM-DD') AS "lastReceipt"
    FROM   purchase_entries GROUP BY vendor_id
  `)
  const rates = await activeRatesWithPrevious()

  const byVendor = new Map<string, {
    vendorId: string; spend: number; monthly: number[]; lastReceipt: string | null
    ratesUp: number; ratesDown: number; activeRateCount: number
    rates: { inventoryItemId: string; material: string; unitPrice: number; unit: 'Kg' | 'L'; effectiveFrom: string; changePct: number | null }[]
  }>()
  const entry = (vendorId: string) => {
    let v = byVendor.get(vendorId)
    if (!v) {
      v = { vendorId, spend: 0, monthly: months.map(() => 0), lastReceipt: null, ratesUp: 0, ratesDown: 0, activeRateCount: 0, rates: [] }
      byVendor.set(vendorId, v)
    }
    return v
  }
  for (const r of monthly) {
    const v = entry(r.vendorId)
    const i = months.indexOf(r.month)
    const value = Number(r.totalValue)
    if (i >= 0) v.monthly[i] = Number(value.toFixed(2))
    v.spend = Number((v.spend + value).toFixed(2))
  }
  for (const r of lastReceipts) entry(r.vendorId).lastReceipt = r.lastReceipt
  for (const r of rates) {
    const v = entry(r.vendorId)
    const unitPrice = Number(r.unitPrice)
    const changePct = pctChange(r.previousPrice !== null ? Number(r.previousPrice) : null, unitPrice)
    v.activeRateCount += 1
    if (changePct !== null && changePct > 0) v.ratesUp += 1
    if (changePct !== null && changePct < 0) v.ratesDown += 1
    v.rates.push({ inventoryItemId: r.inventoryItemId, material: r.material, unitPrice, unit: r.unit, effectiveFrom: r.effectiveFrom, changePct })
  }

  return { months, vendors: [...byVendor.values()] }
}

type MaterialSpendRow = { inventoryItemId: string; material: string; totalValue: string }

/** GET /vendors/:id/insights — monthly spend, spend by material and last receipt for one vendor. */
export async function getVendorInsights(vendorId: string) {
  const [exists] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId))
  if (!exists) return null

  const months = await insightMonths()
  const monthlyRows = await db.execute<{ month: string; totalValue: string }>(sql`
    SELECT to_char(date_trunc('month', purchase_date), 'YYYY-MM') AS "month", SUM(quantity * unit_price) AS "totalValue"
    FROM   purchase_entries
    WHERE  vendor_id = ${vendorId}
      AND  purchase_date >= date_trunc('month', current_date) - make_interval(months => ${INSIGHT_MONTHS - 1}::int)
    GROUP  BY 1
  `)
  const byMaterial = await db.execute<MaterialSpendRow>(sql`
    SELECT pe.inventory_item_id AS "inventoryItemId", ii.material, SUM(pe.quantity * pe.unit_price) AS "totalValue"
    FROM   purchase_entries pe
    JOIN   inventory_items ii ON ii.id = pe.inventory_item_id
    WHERE  pe.vendor_id = ${vendorId}
      AND  pe.purchase_date >= date_trunc('month', current_date) - make_interval(months => ${INSIGHT_MONTHS - 1}::int)
    GROUP  BY 1, 2
    ORDER  BY "totalValue" DESC
  `)
  const [last] = await db.execute<{ lastReceipt: string | null }>(sql`
    SELECT to_char(MAX(purchase_date), 'YYYY-MM-DD') AS "lastReceipt" FROM purchase_entries WHERE vendor_id = ${vendorId}
  `)

  const valueByMonth = new Map(monthlyRows.map((r) => [r.month, Number(r.totalValue)]))
  const monthly = months.map((month) => ({ month, totalValue: Number((valueByMonth.get(month) ?? 0).toFixed(2)) }))
  return {
    months,
    monthly,
    spend: Number(monthly.reduce((sum, m) => sum + m.totalValue, 0).toFixed(2)),
    byMaterial: byMaterial.map((r) => ({ inventoryItemId: r.inventoryItemId, material: r.material, totalValue: Number(Number(r.totalValue).toFixed(2)) })),
    lastReceipt: last?.lastReceipt ?? null,
  }
}
