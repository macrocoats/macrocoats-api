import type { FastifyInstance } from 'fastify'
import { authenticate, requireAuth } from '../../middleware/authenticate.js'
import { requireSuperAdmin } from '../../middleware/requireSuperAdmin.js'
import { AppErrors } from '../../types/errors.js'
import {
  createTemplateSchema,
  updateTemplateSchema,
  createDocumentSchema,
  updateDocumentSchema,
  createVersionSchema,
} from './letterheads.schema.js'
import {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  createNewVersion,
  listVersionHistory,
} from './letterheads.service.js'

const adminHandler = [authenticate, requireAuth, requireSuperAdmin]

export async function letterheadRoutes(app: FastifyInstance) {
  // ── Templates ──────────────────────────────────────────────────────────────
  app.get('/templates', { preHandler: adminHandler }, async (_request, reply) => {
    const templates = await listTemplates()
    return reply.send({ data: templates })
  })

  app.get<{ Params: { id: string } }>('/templates/:id', { preHandler: adminHandler }, async (request, reply) => {
    const template = await getTemplateById(request.params.id)
    if (!template) return reply.code(404).send({ error: AppErrors.LETTERHEAD_TEMPLATE_NOT_FOUND })
    return reply.send({ data: template })
  })

  app.post('/templates', { preHandler: adminHandler }, async (request, reply) => {
    const body = createTemplateSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const template = await createTemplate(body.data, request.authUser!.id)
    return reply.code(201).send({ data: template })
  })

  app.put<{ Params: { id: string } }>('/templates/:id', { preHandler: adminHandler }, async (request, reply) => {
    const body = updateTemplateSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const template = await updateTemplate(request.params.id, body.data)
    if (!template) return reply.code(404).send({ error: AppErrors.LETTERHEAD_TEMPLATE_NOT_FOUND })
    return reply.send({ data: template })
  })

  app.post<{ Params: { id: string } }>('/templates/:id/duplicate', { preHandler: adminHandler }, async (request, reply) => {
    const template = await duplicateTemplate(request.params.id, request.authUser!.id)
    if (!template) return reply.code(404).send({ error: AppErrors.LETTERHEAD_TEMPLATE_NOT_FOUND })
    return reply.code(201).send({ data: template })
  })

  app.delete<{ Params: { id: string } }>('/templates/:id', { preHandler: adminHandler }, async (request, reply) => {
    const template = await deleteTemplate(request.params.id)
    if (!template) return reply.code(404).send({ error: AppErrors.LETTERHEAD_TEMPLATE_NOT_FOUND })
    return reply.code(204).send()
  })

  // ── Documents ──────────────────────────────────────────────────────────────
  app.get('/documents', { preHandler: adminHandler }, async (_request, reply) => {
    const documents = await listDocuments()
    return reply.send({ data: documents })
  })

  app.get<{ Params: { id: string } }>('/documents/:id', { preHandler: adminHandler }, async (request, reply) => {
    const document = await getDocumentById(request.params.id)
    if (!document) return reply.code(404).send({ error: AppErrors.LETTERHEAD_DOCUMENT_NOT_FOUND })
    return reply.send({ data: document })
  })

  app.post('/documents', { preHandler: adminHandler }, async (request, reply) => {
    const body = createDocumentSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const document = await createDocument(body.data, request.authUser!.id)
    return reply.code(201).send({ data: document })
  })

  app.put<{ Params: { id: string } }>('/documents/:id', { preHandler: adminHandler }, async (request, reply) => {
    const body = updateDocumentSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const document = await updateDocument(request.params.id, body.data)
    if (!document) return reply.code(404).send({ error: AppErrors.LETTERHEAD_DOCUMENT_NOT_FOUND })
    return reply.send({ data: document })
  })

  app.get<{ Params: { id: string } }>('/documents/:id/versions', { preHandler: adminHandler }, async (request, reply) => {
    const versions = await listVersionHistory(request.params.id)
    if (!versions) return reply.code(404).send({ error: AppErrors.LETTERHEAD_DOCUMENT_NOT_FOUND })
    return reply.send({ data: versions })
  })

  app.post<{ Params: { id: string } }>('/documents/:id/versions', { preHandler: adminHandler }, async (request, reply) => {
    const body = createVersionSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: AppErrors.VALIDATION_ERROR, issues: body.error.flatten() })
    }
    const document = await createNewVersion(request.params.id, body.data, request.authUser!.id)
    if (!document) return reply.code(404).send({ error: AppErrors.LETTERHEAD_DOCUMENT_NOT_FOUND })
    return reply.code(201).send({ data: document })
  })
}
