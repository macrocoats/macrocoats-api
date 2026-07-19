import { z } from 'zod'

export const createTemplateSchema = z.object({
  name:     z.string().min(1),
  category: z.string().nullable().optional(),
  bodyHtml: z.string().min(1),
})

export const updateTemplateSchema = createTemplateSchema.partial()

export const documentFieldsSchema = z.object({
  templateId:   z.string().uuid().nullable().optional(),
  referenceNo:  z.string().nullable().optional(),
  letterDate:   z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  companyName:  z.string().nullable().optional(),
  subject:      z.string().nullable().optional(),
  attention:    z.string().nullable().optional(),
  preparedBy:   z.string().nullable().optional(),
  approvedBy:   z.string().nullable().optional(),
  designation:  z.string().nullable().optional(),
  bodyHtml:     z.string().min(1),
  status:       z.enum(['draft', 'final']).default('draft'),
})

export const createDocumentSchema = documentFieldsSchema

export const updateDocumentSchema = documentFieldsSchema.partial({ bodyHtml: true }).extend({
  bodyHtml: z.string().min(1).optional(),
})

export const createVersionSchema = documentFieldsSchema

export type CreateTemplateBody = z.infer<typeof createTemplateSchema>
export type UpdateTemplateBody = z.infer<typeof updateTemplateSchema>
export type CreateDocumentBody = z.infer<typeof createDocumentSchema>
export type UpdateDocumentBody = z.infer<typeof updateDocumentSchema>
export type CreateVersionBody  = z.infer<typeof createVersionSchema>
