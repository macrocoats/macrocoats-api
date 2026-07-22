import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:             z.enum(['development', 'test', 'production']).default('development'),
  PORT:                 z.coerce.number().default(3001),
  API_VERSION:          z.string().default('v1'),
  LOG_LEVEL:            z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),

  DATABASE_URL:         z.string().min(1),

  PROCUREMENT_STORAGE_PATH: z.string().min(1),

  REDIS_URL:            z.string().optional(),

  JWT_PRIVATE_KEY_B64:  z.string().min(1),
  JWT_PUBLIC_KEY_B64:   z.string().min(1),
  JWT_ACCESS_EXPIRES:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES:  z.string().default('7d'),

  COOKIE_SECRET:        z.string().min(32),
  COOKIE_DOMAIN:        z.string().default('localhost'),
  COOKIE_SECURE:        z.coerce.boolean().default(false),

  ALLOWED_ORIGIN:       z.string().default('http://localhost:5173'),

  PDF_BROWSER_POOL_SIZE:  z.coerce.number().default(3),
  PDF_PAGE_TIMEOUT_MS:    z.coerce.number().default(30_000),
  PDF_RENDER_TIMEOUT_MS:  z.coerce.number().default(60_000),

  AI_PROVIDER:          z.enum(['heuristic', 'openai', 'azure-openai', 'local']).default('heuristic'),

  // Zoho Invoice (pull-only status sync) — optional so the server still
  // boots before the self-client is configured; endpoints return
  // ZOHO_NOT_CONFIGURED until these are set.
  ZOHO_CLIENT_ID:       z.string().optional(),
  ZOHO_CLIENT_SECRET:   z.string().optional(),
  ZOHO_REFRESH_TOKEN:   z.string().optional(),
  ZOHO_ORG_ID:          z.string().optional(),
  ZOHO_ACCOUNTS_DOMAIN: z.string().default('https://accounts.zoho.in'),
  ZOHO_API_DOMAIN:      z.string().default('https://www.zohoapis.in'),
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
