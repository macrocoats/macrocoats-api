import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:             z.enum(['development', 'test', 'production']).default('development'),
  PORT:                 z.coerce.number().default(3001),
  API_VERSION:          z.string().default('v1'),
  LOG_LEVEL:            z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),

  DATABASE_URL:         z.string().min(1),

  REDIS_URL:            z.string().optional(),

  JWT_PRIVATE_KEY_B64:  z.string().min(1),
  JWT_PUBLIC_KEY_B64:   z.string().min(1),
  JWT_ACCESS_EXPIRES:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES:  z.string().default('7d'),

  COOKIE_SECRET:        z.string().min(32),
  COOKIE_DOMAIN:        z.string().default('localhost'),
  COOKIE_SECURE:        z.coerce.boolean().default(false),

  ALLOWED_ORIGIN:       z.string().default('http://localhost:5173'),
})

function loadEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = loadEnv()
export type Env = typeof env
