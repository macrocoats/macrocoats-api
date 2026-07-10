import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { companies } from '../db/schema/index.js'

/**
 * Resolves a requester's `companies.id` from the JWT's `companyName` field.
 *
 * NOTE: despite the name, the JWT's `authUser.companyName` is actually
 * `companies.key` (the slug), not `companies.displayName` — see
 * `auth.service.ts` (`companyName = co?.key ?? null`).
 *
 * Returns `null` for superadmins (no companyName on the token) or if no
 * matching company row is found.
 */
export async function resolveCompanyId(companyKey: string | null | undefined): Promise<string | null> {
  if (!companyKey) return null
  const [co] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.key, companyKey))
  return co?.id ?? null
}
