import { eq, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { staff } from '../../db/schema/index.js'
import type { CreateStaffInput, UpdateStaffInput } from './staff.schema.js'

function toResponse(row: typeof staff.$inferSelect) {
  return {
    id:             row.id,
    name:           row.name,
    designation:    row.designation,
    phone:          row.phone,
    email:          row.email ?? null,
    panNumber:      row.panNumber ?? null,
    aadharNumber:   row.aadharNumber ?? null,
    dateOfJoining:  row.dateOfJoining,
    salaryPerMonth: row.salaryPerMonth,
    createdAt:      row.createdAt.toISOString(),
    updatedAt:      row.updatedAt.toISOString(),
  }
}

export async function listStaff() {
  const rows = await db.select().from(staff).orderBy(asc(staff.createdAt))
  return rows.map(toResponse)
}

export async function getStaffById(id: string) {
  const [row] = await db.select().from(staff).where(eq(staff.id, id))
  return row ? toResponse(row) : null
}

export async function createStaff(data: CreateStaffInput) {
  const [row] = await db
    .insert(staff)
    .values({
      name:           data.name,
      designation:    data.designation,
      phone:          data.phone,
      email:          data.email || null,
      panNumber:      data.panNumber || null,
      aadharNumber:   data.aadharNumber || null,
      dateOfJoining:  data.dateOfJoining,
      salaryPerMonth: data.salaryPerMonth,
    })
    .returning()

  return toResponse(row)
}

export async function updateStaff(id: string, data: UpdateStaffInput) {
  const patch: Partial<typeof staff.$inferInsert> = {}

  if (data.name           !== undefined) patch.name           = data.name
  if (data.designation    !== undefined) patch.designation    = data.designation
  if (data.phone          !== undefined) patch.phone          = data.phone
  if (data.email          !== undefined) patch.email          = data.email || null
  if (data.panNumber      !== undefined) patch.panNumber      = data.panNumber || null
  if (data.aadharNumber   !== undefined) patch.aadharNumber   = data.aadharNumber || null
  if (data.dateOfJoining  !== undefined) patch.dateOfJoining  = data.dateOfJoining
  if (data.salaryPerMonth !== undefined) patch.salaryPerMonth = data.salaryPerMonth

  patch.updatedAt = new Date()

  const [row] = await db
    .update(staff)
    .set(patch)
    .where(eq(staff.id, id))
    .returning()

  return row ? toResponse(row) : null
}

export async function deleteStaff(id: string): Promise<boolean> {
  const result = await db
    .delete(staff)
    .where(eq(staff.id, id))
    .returning({ id: staff.id })

  return result.length > 0
}
