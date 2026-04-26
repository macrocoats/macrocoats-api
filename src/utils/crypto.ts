import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const BCRYPT_COST = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function hashToken(raw: string): Promise<string> {
  // Cost 10 for token hashes — they're already high entropy, no need for cost 12
  return bcrypt.hash(raw, 10)
}

export async function verifyTokenHash(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash)
}

/** Generates a URL-safe random token of `bytes` entropy (default 24 bytes = 32 chars base64url) */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

/** Normalizes a username to its lookup key: lowercase, strip spaces */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}
