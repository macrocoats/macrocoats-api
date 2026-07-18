import { eq, asc } from 'drizzle-orm'
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
