import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { env } from '../config/env.js'
import * as schema from './schema/index.js'

// In test mode use a single connection; in prod use a pool
const connectionOptions = env.NODE_ENV === 'test'
  ? { max: 1 }
  : { max: 20, idle_timeout: 30 }

const queryClient = postgres(env.DATABASE_URL, connectionOptions)

export const db = drizzle(queryClient, { schema, logger: env.LOG_LEVEL === 'debug' })

export type DB = typeof db

export { schema }
