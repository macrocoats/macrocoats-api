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

/** Cache-aside helper. TTL is in seconds. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null
  const raw = await redis.get(key)
  return raw ? (JSON.parse(raw) as T) : null
}

export async function cacheSet(key: string, value: unknown, ttlSecs = 300): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.setex(key, ttlSecs, JSON.stringify(value))
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  await redis.del(key)
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = next
    if (keys.length) await redis.del(...keys)
  } while (cursor !== '0')
}
