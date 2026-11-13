import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { companies, companyFormulaAssignments, companyProductAccess, customerPurchaseOrders, refreshTokens, users } from '../../db/schema/index.js'
import { generateToken, hashPassword } from '../../utils/crypto.js'
import type { CreateCompanyBody, UpdateCompanyBody } from './companies.schema.js'
import { createWriteStream } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'

// Company formula assignments live in the formulation-variants module; re-exported
// here so companies.routes.ts only ever imports from its own service.
export {
  assignFormulaToCompany,
  listCompanyFormulaAssignments,
  unassignFormulaFromCompany,
  updateCompanyFormulaAssignment,
} from '../formulation-variants/formulation-variants.service.js'

function toResponse(
  company: typeof companies.$inferSelect,
  allowedProducts: string[],
  formulaSummary: { formulaCount: number; formulaProductKeys: string[] } = { formulaCount: 0, formulaProductKeys: [] },
) {
  return {
    id:              company.id,
    key:             company.key,
    displayName:     company.displayName,
    allowedProducts,
    formulaCount:      formulaSummary.formulaCount,
    formulaProductKeys: formulaSummary.formulaProductKeys,
    accessToken:     company.accessToken,
    tokenExpiresAt:  company.tokenExpiresAt?.toISOString() ?? null,
    zohoCustomerId:  company.zohoCustomerId ?? null,
    contactPerson:   company.contactPerson ?? null,
    email:           company.email ?? null,
    phone:           company.phone ?? null,
    gstNumber:       company.gstNumber ?? null,
    address:         company.address ?? null,
    city:            company.city ?? null,
    state:           company.state ?? null,
    pincode:         company.pincode ?? null,
    hasLogo:         Boolean(company.logoStorageKey),
    logoUpdatedAt:   company.logoUpdatedAt?.toISOString() ?? null,
    createdAt:       company.createdAt.toISOString(),
  }
}

const COMPANY_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_COMPANY_LOGO_BYTES = 2 * 1024 * 1024

type SaveCompanyLogoResult =
  | { company: ReturnType<typeof toResponse> }
  | { code: 'INVALID_TYPE' | 'TOO_LARGE' | 'UPLOAD_FAILED' | 'NOT_FOUND' }

export async function saveCompanyLogo(
  companyId: string,
  file: { mimetype: string; fileStream: NodeJS.ReadableStream },
): Promise<SaveCompanyLogoResult> {
  const extension = COMPANY_LOGO_TYPES[file.mimetype]
  if (!extension) return { code: 'INVALID_TYPE' }

  const [existing] = await db.select().from(companies).where(eq(companies.id, companyId))
  if (!existing) return { code: 'NOT_FOUND' }

  const fullPath = join(env.PROCUREMENT_STORAGE_PATH, 'company-logos', companyId, `${randomUUID()}.${extension}`)
  await mkdir(dirname(fullPath), { recursive: true })

  try {
    await pipeline(file.fileStream, createWriteStream(fullPath))
    const sizeBytes = (await stat(fullPath)).size
    const wasTruncated = Boolean((file.fileStream as NodeJS.ReadableStream & { truncated?: boolean }).truncated)
    if (wasTruncated || sizeBytes > MAX_COMPANY_LOGO_BYTES) {
      await unlink(fullPath).catch(() => {})
      return { code: 'TOO_LARGE' }
    }

    const [updated] = await db
      .update(companies)
      .set({ logoStorageKey: fullPath, logoMimeType: file.mimetype, logoUpdatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning()

    if (!updated) {
      await unlink(fullPath).catch(() => {})
      return { code: 'NOT_FOUND' }
    }

    if (existing.logoStorageKey && existing.logoStorageKey !== fullPath) {
      await unlink(existing.logoStorageKey).catch((err) => {
        console.error(`[companies] failed to remove replaced logo ${existing.logoStorageKey}:`, err)
      })
    }

    const accessRows = await db
      .select({ productKey: companyProductAccess.productKey })
      .from(companyProductAccess)
      .where(eq(companyProductAccess.companyId, companyId))

    return { company: toResponse(updated, accessRows.map((row) => row.productKey)) }
  } catch (err) {
    console.error(`[companies] failed to store logo for ${companyId}:`, err)
    await unlink(fullPath).catch(() => {})
    return { code: 'UPLOAD_FAILED' }
  }
}

export async function getCompanyLogo(companyId: string) {
  const [company] = await db
    .select({ storageKey: companies.logoStorageKey, mimeType: companies.logoMimeType, updatedAt: companies.logoUpdatedAt })
    .from(companies)
    .where(eq(companies.id, companyId))

  if (!company?.storageKey || !company.mimeType) return null
  return {
    storageKey: company.storageKey,
    mimeType: company.mimeType,
    updatedAt: company.updatedAt,
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

  const assignmentRows = await db
    .select({
      companyId: companyFormulaAssignments.companyId,
      productKey: companyFormulaAssignments.productKey,
      variantId: companyFormulaAssignments.variantId,
    })
    .from(companyFormulaAssignments)
    .where(inArray(companyFormulaAssignments.companyId, rows.map((r) => r.id)))

  const formulaMap = new Map<string, { formulaIds: Set<string>; productKeys: Set<string> }>()
  for (const row of assignmentRows) {
    const summary = formulaMap.get(row.companyId) ?? { formulaIds: new Set<string>(), productKeys: new Set<string>() }
    summary.formulaIds.add(row.variantId)
    summary.productKeys.add(row.productKey)
    formulaMap.set(row.companyId, summary)
  }

  // Last PO ignores drafts/cancellations; open value is everything confirmed but
  // not yet completed (draft, completed, cancelled excluded).
  const poRows = await db
    .select({
      companyId:   customerPurchaseOrders.customerId,
      lastPoDate:  sql<string | null>`max(${customerPurchaseOrders.customerPoDate}) filter (where ${customerPurchaseOrders.status} not in ('draft', 'cancelled'))::text`,
      openPoValue: sql<string>`coalesce(sum(${customerPurchaseOrders.totalValue}) filter (where ${customerPurchaseOrders.status} not in ('draft', 'completed', 'cancelled')), 0)`,
    })
    .from(customerPurchaseOrders)
    .where(and(
      inArray(customerPurchaseOrders.customerId, rows.map((r) => r.id)),
      isNull(customerPurchaseOrders.deletedAt),
    ))
    .groupBy(customerPurchaseOrders.customerId)

  const poMap = new Map(poRows.map((r) => [r.companyId, r]))

  return rows.map((c) => {
    const formulaSummary = formulaMap.get(c.id)
    const po = poMap.get(c.id)
    return {
      ...toResponse(c, accessMap.get(c.id) ?? [], formulaSummary
        ? { formulaCount: formulaSummary.formulaIds.size, formulaProductKeys: Array.from(formulaSummary.productKeys) }
        : undefined),
      lastPoDate:  po?.lastPoDate ?? null,
      openPoValue: Number(po?.openPoValue ?? 0),
    }
  })
}

export async function getCompanyById(id: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id))
  if (!company) return null

  const accessRows = await db
    .select({ productKey: companyProductAccess.productKey })
    .from(companyProductAccess)
    .where(eq(companyProductAccess.companyId, id))

  const assignmentRows = await db
    .select({ productKey: companyFormulaAssignments.productKey, variantId: companyFormulaAssignments.variantId })
    .from(companyFormulaAssignments)
    .where(eq(companyFormulaAssignments.companyId, id))

  return toResponse(company, accessRows.map((r) => r.productKey), {
    formulaCount: new Set(assignmentRows.map((r) => r.variantId)).size,
    formulaProductKeys: Array.from(new Set(assignmentRows.map((r) => r.productKey))),
  })
}

export async function createCompany(data: CreateCompanyBody) {
  return db.transaction(async (tx) => {
    const accessToken = generateToken(24)
    const expiresAt   = data.tokenExpiresAt ? new Date(data.tokenExpiresAt) : null

    const [company] = await tx
      .insert(companies)
      .values({
        zohoCustomerId: data.zohoCustomerId ?? null,
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
    if (data.zohoCustomerId !== undefined) patch.zohoCustomerId = data.zohoCustomerId
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

    if (data.allowedProducts !== undefined) {
      // Replace all access rows for this company
      await tx.delete(companyProductAccess).where(eq(companyProductAccess.companyId, id))
      if (data.allowedProducts.length) {
        await tx.insert(companyProductAccess).values(
          data.allowedProducts.map((productKey) => ({ companyId: id, productKey })),
        )
      }
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
  // The company user's password is the access token (see createCompany), so rotate it
  // too and end existing sessions — otherwise the old token keeps working as a password
  // and open sessions keep refreshing.
  const passwordHash = await hashPassword(newToken)

  return db.transaction(async (tx) => {
    const [company] = await tx
      .update(companies)
      .set({ accessToken: newToken })
      .where(eq(companies.id, id))
      .returning({ id: companies.id })
    if (!company) return null

    const companyUsers = await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.companyId, id))
      .returning({ id: users.id })

    if (companyUsers.length) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(inArray(refreshTokens.userId, companyUsers.map((u) => u.id)), isNull(refreshTokens.revokedAt)))
    }

    return { accessToken: newToken }
  })
}

export async function deleteCompany(id: string): Promise<boolean> {
  const result = await db
    .delete(companies)
    .where(eq(companies.id, id))
    .returning({ id: companies.id })

  return result.length > 0
}
