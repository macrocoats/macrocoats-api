/**
 * Returns the Postgres SQLSTATE code (e.g. '23505') carried by a thrown error, or undefined.
 *
 * drizzle-orm >= 0.44 wraps driver errors in a DrizzleQueryError and keeps the original
 * postgres error on `.cause`; older versions threw the driver error directly. This walks the
 * cause chain so callers work with either shape. Only 5-character SQLSTATE strings count,
 * so application error codes (e.g. 'NOT_FOUND') never match.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}
