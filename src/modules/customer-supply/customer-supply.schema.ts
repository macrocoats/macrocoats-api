import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd')

export const supplySummaryQuerySchema = z.object({
  from:       isoDate.optional(),
  to:         isoDate.optional(),
  customerId: z.string().max(100).optional(),
  product:    z.string().max(300).optional(),
  /** Skip the short-lived invoice-list cache and ask Zoho again. */
  refresh:    z.enum(['true', 'false']).optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, { message: '`from` must be on or before `to`', path: ['from'] })

export const TRIAL_STATUSES = ['unknown', 'not_started', 'planned', 'in_progress', 'completed', 'failed', 'not_required'] as const
export const VENDOR_REGISTRATION_STATUSES = ['unknown', 'not_started', 'awaiting', 'submitted', 'registered', 'not_required'] as const

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()

export const createPipelineEntrySchema = z.object({
  companyName:        z.string().trim().min(1).max(200),
  location:           optionalText(200),
  companyId:          z.string().uuid().nullable().optional(),
  trialStatus:        z.enum(TRIAL_STATUSES).default('unknown'),
  vendorRegistration: z.enum(VENDOR_REGISTRATION_STATUSES).default('unknown'),
  products:           optionalText(500),
  nextStep:           optionalText(500),
  notes:              optionalText(2000),
  statusDate:         isoDate.nullable().optional(),
})

export const updatePipelineEntrySchema = z.object({
  companyName:        z.string().trim().min(1).max(200).optional(),
  location:           optionalText(200),
  companyId:          z.string().uuid().nullable().optional(),
  trialStatus:        z.enum(TRIAL_STATUSES).optional(),
  vendorRegistration: z.enum(VENDOR_REGISTRATION_STATUSES).optional(),
  products:           optionalText(500),
  nextStep:           optionalText(500),
  notes:              optionalText(2000),
  statusDate:         isoDate.nullable().optional(),
  archived:           z.boolean().optional(),
})

export const pipelineEntryParamsSchema = z.object({
  id: z.string().uuid(),
})

export const listPipelineQuerySchema = z.object({
  includeArchived: z.enum(['true', 'false']).optional(),
})

export type SupplySummaryQuery     = z.infer<typeof supplySummaryQuerySchema>
export type CreatePipelineEntryBody = z.infer<typeof createPipelineEntrySchema>
export type UpdatePipelineEntryBody = z.infer<typeof updatePipelineEntrySchema>
