import type { FastifyInstance } from 'fastify'
import fastifyCors from '@fastify/cors'
import { env } from '../config/env.js'

const configuredOrigins = env.ALLOWED_ORIGIN
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const devOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]

const allowedOrigins = env.NODE_ENV === 'development'
  ? Array.from(new Set([...configuredOrigins, ...devOrigins]))
  : configuredOrigins

export async function registerCors(app: FastifyInstance) {
  await app.register(fastifyCors, {
    origin:      allowedOrigins,
    credentials: true,                 // required for cookies cross-origin
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}
