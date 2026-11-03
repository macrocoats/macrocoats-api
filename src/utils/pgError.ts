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

type QueryError = Error & { query: string; params: unknown }

// drizzle-orm's DrizzleQueryError: message is `Failed query: ${query}\nparams: ${params}`.
function isQueryError(value: unknown): value is QueryError {
  return value instanceof Error
    && typeof (value as { query?: unknown }).query === 'string'
    && 'params' in value
    && value.message.startsWith('Failed query:')
}

function redactError(error: Error, depth: number): Error {
  const cause = (error as { cause?: unknown }).cause
  const redactedCause = depth < 5 && cause instanceof Error ? redactError(cause, depth + 1) : cause
  const isQuery = isQueryError(error)
  if (!isQuery && redactedCause === cause) return error

  // Copy rather than mutate: the error handler still reads the original after logging.
  const copy = Object.assign(Object.create(Object.getPrototypeOf(error)) as Error, error)
  let message = error.message
  if (isQuery) {
    message = `Failed query: ${error.query}\nparams: [REDACTED]`
    ;(copy as QueryError).params = '[REDACTED]'
  }
  Object.defineProperty(copy, 'message', { value: message, writable: true, configurable: true })
  Object.defineProperty(copy, 'stack', {
    value: error.stack?.replace(error.message, () => message),
    writable: true,
    configurable: true,
  })
  if (redactedCause !== cause) {
    Object.defineProperty(copy, 'cause', { value: redactedCause, writable: true, configurable: true })
  }
  return copy
}

/**
 * Removes query parameter values from drizzle query errors (anywhere in a cause chain) before
 * they reach the logger. drizzle-orm >= 0.44 puts every bound value in the error message,
 * so a failed INSERT into users would otherwise log password hashes. The query text is kept;
 * it is parameterised and holds no values. Accepts an Error or a pino `{ err }` merge object.
 */
export function redactQueryParams<T>(value: T): T {
  if (value instanceof Error) return redactError(value, 0) as T
  if (value && typeof value === 'object' && (value as { err?: unknown }).err instanceof Error) {
    const err = (value as unknown as { err: Error }).err
    const redacted = redactError(err, 0)
    return (redacted === err ? value : { ...value, err: redacted }) as T
  }
  return value
}
