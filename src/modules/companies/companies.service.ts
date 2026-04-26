import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { companies, companyProductAccess, users } from '../../db/schema/index.js'
import { generateToken, hashPassword } from '../../utils/crypto.js'
import type { CreateCompanyBody, UpdateCompanyBody } from './companies.schema.js'

async function buildResponse(company: typeof companies.$inferSelect) {
  const access = await db
    .select({ productKey: companyProductAccess.productKey })
    .from(companyProductAccess)
    .where(eq(companyProductAccess.companyId, company.id))

  return {
    id:             company.id,
    key:            company.key,
    displayName:    company.displayName,
    allowedProducts: access.map((r) => r.productKey),
    accessToken:    company.accessToken,
    tokenExpiresAt: company.tokenExpiresAt?.toISOString() ?? null,
    createdAt:      company.createdAt.toISOString(),
  }
}

export async function listCompanies() {
  const rows = await db.select().from(companies)
  return Promise.all(rows.map(buildResponse))
}

export async function getCompanyById(id: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id))
  return company ? buildResponse(company) : null
}

export async function createCompany(data: CreateCompanyBody) {
  return db.transaction(async (tx) => {
    const accessToken = generateToken(24)
    const expiresAt   = data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null

    const [company] = await tx
      .insert(companies)
      .values({ key: data.key, displayName: data.displayName, accessToken, tokenExpiresAt: expiresAt })
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

    return buildResponse(company)
  })
}

export async function updateCompany(id: string, data: UpdateCompanyBody) {
  return db.transaction(async (tx) => {
    const [company] = await tx.select().from(companies).where(eq(companies.id, id))
    if (!company) return null

    const patch: Partial<typeof companies.$inferInsert> = {}
    if (data.displayName !== undefined)   patch.displayName    = data.displayName
    if (data.tokenExpiresAt !== undefined) {
      patch.tokenExpiresAt = data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null
    }

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
    return buildResponse(updated)
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
