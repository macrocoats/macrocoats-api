import type { FastifyInstance } from 'fastify'
import fastifyCors from '@fastify/cors'
import { env } from '../config/env.js'

export async function registerCors(app: FastifyInstance) {
  await app.register(fastifyCors, {
    origin:      env.ALLOWED_ORIGIN,
    credentials: true,                 // required for cookies cross-origin
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}
