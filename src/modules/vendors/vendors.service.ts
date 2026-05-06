import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { vendors } from '../../db/schema/index.js'
import type { CreateVendorInput, UpdateVendorInput } from './vendors.schema.js'

function toResponse(row: typeof vendors.$inferSelect) {
  return {
    id:            row.id,
    vendorName:    row.vendorName,
    gstNumber:     row.gstNumber,
    address:       row.address ?? null,
    email:         row.email ?? null,
    contactPerson: row.contactPerson ?? null,
    phoneNumbers:  (row.phoneNumbers as string[]) ?? [],
    bankDetails:   row.bankDetails ?? null,
    chemicals:     (row.chemicals as Array<{ chemicalName: string; rate: number; unit: string }>) ?? [],
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
      chemicals:     data.chemicals ?? [],
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
  if (data.chemicals     !== undefined) patch.chemicals     = data.chemicals

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
