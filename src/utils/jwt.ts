import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { AuthUser } from '../types/index.js'

// Decode base64 keypair from env once at startup
const PRIVATE_KEY = Buffer.from(env.JWT_PRIVATE_KEY_B64, 'base64').toString('utf-8')
const PUBLIC_KEY  = Buffer.from(env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8')

export interface AccessTokenPayload {
  sub:             string     // user id
  name:            string
  role:            AuthUser['role']
  companyName:     string | null
  allowedProducts: string[] | null
}

export interface RefreshTokenPayload {
  sub: string   // user id
  jti: string   // unique token id (matches refresh_tokens.id in DB)
  // Opaque random secret (short — see auth.service.ts's issueTokens), bcrypt-hashed
  // and stored in refresh_tokens.tokenHash. Verified on rotation as a second factor
  // alongside the RS256 signature. Deliberately NOT the JWT itself: bcrypt silently
  // truncates inputs over 72 bytes, so hashing the (much longer) full JWT string
  // would produce a check that only ever compared its first 72 bytes.
  sec: string
}

export function signAccessToken(user: AuthUser): string {
  const payload: AccessTokenPayload = {
    sub:             user.id,
    name:            user.name,
    role:            user.role,
    companyName:     user.companyName,
    allowedProducts: user.allowedProducts,
  }
  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions['expiresIn'],
  })
}

export function signRefreshToken(userId: string, tokenId: string, secret: string): string {
  const payload: RefreshTokenPayload = { sub: userId, jti: tokenId, sec: secret }
  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: env.JWT_REFRESH_EXPIRES as SignOptions['expiresIn'],
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }) as AccessTokenPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }) as RefreshTokenPayload
}

/** Returns payload or null — does NOT throw on invalid token */
export function tryVerifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return verifyAccessToken(token)
  } catch {
    return null
  }
}
