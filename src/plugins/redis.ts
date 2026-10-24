import { env } from '../config/env.js'

let _redis: import('ioredis').Redis | null = null

export function getRedis(): import('ioredis').Redis | null {
  return _redis
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_URL) {
    console.info('ℹ️  REDIS_URL not set — document caching disabled')
    return
  }
  const { Redis } = await import('ioredis')
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 })
  await redis.connect()
  _redis = redis
  console.info('✅ Redis connected')
}

export async function disconnectRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit()
    _redis = null
  }
}

/**
 * Cache-aside helpers. TTL is in seconds. A Redis failure never fails the request:
 * reads fall through to the DB and writes/deletes are skipped with a warning.
 * (A skipped delete leaves a stale entry for at most its TTL.)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const raw = await redis.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (err) {
    console.warn(`⚠️  Redis cacheGet failed for ${key}:`, (err as Error).message)
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSecs = 300): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.setex(key, ttlSecs, JSON.stringify(value))
  } catch (err) {
    console.warn(`⚠️  Redis cacheSet failed for ${key}:`, (err as Error).message)
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(key)
  } catch (err) {
    console.warn(`⚠️  Redis cacheDel failed for ${key}:`, (err as Error).message)
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = next
      if (keys.length) await redis.del(...keys)
    } while (cursor !== '0')
  } catch (err) {
    console.warn(`⚠️  Redis cacheDelPattern failed for ${pattern}:`, (err as Error).message)
  }
}
