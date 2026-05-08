import { eq, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { companies, companyProductAccess, users } from '../../db/schema/index.js'
import { generateToken, hashPassword } from '../../utils/crypto.js'
import type { CreateCompanyBody, UpdateCompanyBody } from './companies.schema.js'

function toResponse(
  company: typeof companies.$inferSelect,
  allowedProducts: string[],
) {
  return {
    id:              company.id,
    key:             company.key,
    displayName:     company.displayName,
    allowedProducts,
    accessToken:     company.accessToken,
    tokenExpiresAt:  company.tokenExpiresAt?.toISOString() ?? null,
    contactPerson:   company.contactPerson ?? null,
    email:           company.email ?? null,
    phone:           company.phone ?? null,
    gstNumber:       company.gstNumber ?? null,
    address:         company.address ?? null,
    city:            company.city ?? null,
    state:           company.state ?? null,
    pincode:         company.pincode ?? null,
    createdAt:       company.createdAt.toISOString(),
  }
}

export async function listCompanies() {
  const rows = await db.select().from(companies)
  if (!rows.length) return []

  const accessRows = await db
    .select({ companyId: companyProductAccess.companyId, productKey: companyProductAccess.productKey })
    .from(companyProductAccess)
    .where(inArray(companyProductAccess.companyId, rows.map((r) => r.id)))

  const accessMap = new Map<string, string[]>()
  for (const r of accessRows) {
    const list = accessMap.get(r.companyId) ?? []
    list.push(r.productKey)
    accessMap.set(r.companyId, list)
  }

  return rows.map((c) => toResponse(c, accessMap.get(c.id) ?? []))
}

export async function getCompanyById(id: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id))
  if (!company) return null

  const accessRows = await db
    .select({ productKey: companyProductAccess.productKey })
    .from(companyProductAccess)
    .where(eq(companyProductAccess.companyId, id))

  return toResponse(company, accessRows.map((r) => r.productKey))
}

export async function createCompany(data: CreateCompanyBody) {
  return db.transaction(async (tx) => {
    const accessToken = generateToken(24)
    const expiresAt   = data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null

    const [company] = await tx
      .insert(companies)
      .values({
        key: data.key,
        displayName: data.displayName,
        accessToken,
        tokenExpiresAt: expiresAt,
        contactPerson: data.contactPerson ?? null,
        email:         data.email ?? null,
        phone:         data.phone ?? null,
        gstNumber:     data.gstNumber ?? null,
        address:       data.address ?? null,
        city:          data.city ?? null,
        state:         data.state ?? null,
        pincode:       data.pincode ?? null,
      })
      .returning()

    // Insert product access rows
    if (data.allowedProducts.length) {
      await tx.insert(companyProductAccess).values(
        data.allowedProducts.map((productKey) => ({ companyId: company.id, productKey })),
      )
    }

    // Create a companion user account for this company
    const pwHash = await hashPassword(accessToken)   // initial password = access token
    await tx.insert(users).values({
      name:         data.displayName,
      username:     data.key,
      passwordHash: pwHash,
      role:         'company',
      companyId:    company.id,
    })

    return toResponse(company, data.allowedProducts)
  })
}

export async function updateCompany(id: string, data: UpdateCompanyBody) {
  return db.transaction(async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, id))
    if (!company) return null

    const patch: Partial<typeof companies.$inferInsert> = {}
    if (data.displayName !== undefined)    patch.displayName   = data.displayName
    if (data.tokenExpiresAt !== undefined) patch.tokenExpiresAt = data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null
    if (data.contactPerson !== undefined)  patch.contactPerson = data.contactPerson
    if (data.email !== undefined)          patch.email         = data.email
    if (data.phone !== undefined)          patch.phone         = data.phone
    if (data.gstNumber !== undefined)      patch.gstNumber     = data.gstNumber
    if (data.address !== undefined)        patch.address       = data.address
    if (data.city !== undefined)           patch.city          = data.city
    if (data.state !== undefined)          patch.state         = data.state
    if (data.pincode !== undefined)        patch.pincode       = data.pincode

    if (Object.keys(patch).length) {
      await tx.update(companies).set(patch).where(eq(companies.id, id))
    }

    if (data.allowedProducts) {
      // Replace all access rows for this company
      await tx.delete(companyProductAccess).where(eq(companyProductAccess.companyId, id))
      await tx.insert(companyProductAccess).values(
        data.allowedProducts.map((productKey) => ({ companyId: id, productKey })),
      )
    }

    const [updated] = await tx.select().from(companies).where(eq(companies.id, id))
    const accessRows = await tx
      .select({ productKey: companyProductAccess.productKey })
      .from(companyProductAccess)
      .where(eq(companyProductAccess.companyId, id))
    return toResponse(updated, accessRows.map((r) => r.productKey))
  })
}

export async function rotateCompanyToken(id: string) {
  const newToken = generateToken(24)

  await db
    .update(companies)
    .set({ accessToken: newToken })
    .where(eq(companies.id, id))

  return { accessToken: newToken }
}

export async function deleteCompany(id: string): Promise<boolean> {
  const result = await db
    .delete(companies)
    .where(eq(companies.id, id))
    .returning({ id: companies.id })

  return result.length > 0
}
