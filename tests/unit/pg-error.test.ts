import { describe, expect, it } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { pgErrorCode, redactQueryParams } from '../../src/utils/pgError.js'

function pgError(code: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), { code })
}

describe('pgErrorCode', () => {
  it('reads a bare driver error (drizzle < 0.44)', () => {
    expect(pgErrorCode(pgError('23505'))).toBe('23505')
  })

  it('reads the code from a DrizzleQueryError cause (drizzle >= 0.44)', () => {
    const wrapped = new DrizzleQueryError('insert into "companies" ("key") values ($1)', ['acme'], pgError('23505'))
    expect(pgErrorCode(wrapped)).toBe('23505')
  })

  it('ignores application error codes and non-errors', () => {
    expect(pgErrorCode(Object.assign(new Error('x'), { code: 'NOT_FOUND' }))).toBeUndefined()
    expect(pgErrorCode(undefined)).toBeUndefined()
    expect(pgErrorCode('23505')).toBeUndefined()
  })
})

describe('redactQueryParams', () => {
  const secret = '$2b$12$abcdefghijklmnopqrstuvwxyzSECRETHASH'
  const query = 'insert into "users" ("username", "password_hash") values ($1, $2)'

  it('removes param values from message, stack and params, keeping the query and code', () => {
    const original = new DrizzleQueryError(query, ['acme', secret], pgError('23505'))
    const redacted = redactQueryParams(original)

    expect(redacted).toBeInstanceOf(DrizzleQueryError)
    expect(redacted.message).toBe(`Failed query: ${query}\nparams: [REDACTED]`)
    expect(redacted.stack).not.toContain(secret)
    expect(JSON.stringify({ ...redacted })).not.toContain(secret)
    expect(redacted.query).toBe(query)
    expect(pgErrorCode(redacted)).toBe('23505')
    // the original is untouched — the error handler still uses it
    expect(original.message).toContain(secret)
  })

  it('redacts a query error nested as a cause, and inside a pino { err } object', () => {
    const inner = new DrizzleQueryError(query, [secret], pgError('23505'))
    const outer = new Error('batch creation failed', { cause: inner })

    const redacted = redactQueryParams(outer)
    expect((redacted.cause as Error).message).not.toContain(secret)

    const merged = redactQueryParams({ err: inner, batch: 'X' })
    expect(merged.err.message).not.toContain(secret)
    expect(merged.batch).toBe('X')
  })

  it('returns other values unchanged', () => {
    const plain = new Error('boom')
    expect(redactQueryParams(plain)).toBe(plain)
    expect(redactQueryParams('message')).toBe('message')
  })
})
