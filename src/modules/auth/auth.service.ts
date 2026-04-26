import { eq, and, gt, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  users, companies, companyProductAccess,
  refreshTokens,
} from '../../db/schema/index.js'
import {
  verifyPassword, hashToken, verifyTokenHash, generateToken, normalizeUsername,
} from '../../utils/crypto.js'
import {
  signAccessToken, signRefreshToken, verifyRefreshToken,
} from '../../utils/jwt.js'
import type { AuthUser } from '../../types/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildAuthUser(user: typeof users.$inferSelect): Promise<AuthUser> {
  let allowedProducts: string[] | null = null

  if (user.role === 'company' && user.companyId) {
    const rows = await db
      .select({ productKey: companyProductAccess.productKey })
      .from(companyProductAccess)
      .where(eq(companyProductAccess.companyId, user.companyId))

    allowedProducts = rows.map((r) => r.productKey)
  }

  let companyName: string | null = null
  if (user.companyId) {
    const [co] = await db.select({ key: companies.key }).from(companies).where(eq(companies.id, user.companyId))
    companyName = co?.key ?? null
  }

  return {
    id:              user.id,
    name:            user.name,
    role:            user.role as AuthUser['role'],
    companyName,
    allowedProducts,
  }
}

// ── Service functions ─────────────────────────────────────────────────────────

export async function loginWithCredentials(
  rawUsername: string,
  rawPassword: string,
): Promise<{ authUser: AuthUser; accessToken: string; refreshToken: string } | null> {
  const username = normalizeUsername(rawUsername)

  const [user] = await db.select().from(users).where(eq(users.username, username))
  if (!user) return null

  const valid = await verifyPassword(rawPassword, user.passwordHash)
  if (!valid) return null

  return issueTokens(user)
}

export async function loginWithToken(
  rawToken: string,
): Promise<{ authUser: AuthUser; accessToken: string; refreshToken: string; redirectTo: string } | null> {
  const [company] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.accessToken, rawToken),
        // Reject expired tokens (null = never expires)
        // We do the expiry check in application code
      ),
    )

  if (!company) return null

  // Check expiry
  if (company.tokenExpiresAt && company.tokenExpiresAt < new Date()) return null

  // Find the company user account
  const [user] = await db.select().from(users).where(eq(users.companyId, company.id))
  if (!user) return null

  const result = await issueTokens(user)

  // Determine redirect: first allowed product
  const [firstAccess] = await db
    .select({ productKey: companyProductAccess.productKey })
    .from(companyProductAccess)
    .where(eq(companyProductAccess.companyId, company.id))
    .limit(1)

  const redirectTo = firstAccess
    ? `/products/${firstAccess.productKey}/tds`
    : '/unauthorized'

  return { ...result, redirectTo }
}

async function issueTokens(user: typeof users.$inferSelect) {
  const authUser = await buildAuthUser(user)

  // Create a refresh token record
  const rawRefresh = generateToken(32)
  const tokenHash  = await hashToken(rawRefresh)
  const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [rtRow] = await db
    .insert(refreshTokens)
    .values({ userId: user.id, tokenHash, expiresAt })
    .returning({ id: refreshTokens.id })

  const accessToken  = signAccessToken(authUser)
  const refreshToken = signRefreshToken(user.id, rtRow.id)

  return { authUser, accessToken, refreshToken: rawRefresh }
}

export async function rotateRefreshToken(
  rawOldRefresh: string,
): Promise<{ authUser: AuthUser; accessToken: string; refreshToken: string } | null> {
  let payload: ReturnType<typeof verifyRefreshToken>
  try {
    payload = verifyRefreshToken(rawOldRefresh)
  } catch {
    return null
  }

  // Look up the refresh token row by id (jti)
  const [rtRow] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.id, payload.jti),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )

  if (!rtRow) return null

  // Verify the raw token against the stored hash
  const valid = await verifyTokenHash(rawOldRefresh, rtRow.tokenHash)
  if (!valid) return null

  // Revoke old token
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, rtRow.id))

  // Load user and issue new pair
  const [user] = await db.select().from(users).where(eq(users.id, rtRow.userId))
  if (!user) return null

  return issueTokens(user)
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  let payload: ReturnType<typeof verifyRefreshToken>
  try {
    payload = verifyRefreshToken(rawToken)
  } catch {
    return
  }
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, payload.jti))
}

export async function getMeById(userId: string): Promise<AuthUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return null
  return buildAuthUser(user)
}
