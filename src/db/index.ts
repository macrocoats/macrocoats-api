import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { env } from '../config/env.js'
import * as schema from './schema/index.js'

// In test mode use a single connection; in prod use a pool
const connectionOptions = env.NODE_ENV === 'test'
  ? { max: 1 }
  : { max: env.DB_POOL_MAX, idle_timeout: 30, connect_timeout: 10 }

export const queryClient = postgres(env.DATABASE_URL, connectionOptions)

export const db = drizzle(queryClient, { schema, logger: env.LOG_LEVEL === 'debug' })

export const closeDb = () => queryClient.end()

export type DB = typeof db

export { schema }
