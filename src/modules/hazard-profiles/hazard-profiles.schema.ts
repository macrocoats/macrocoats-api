import { z } from 'zod'

export const hazardClassificationSchema = z.object({
  class:           z.string().min(1),
  category:        z.string().min(1),
  tagType:         z.string().min(1),
  hStatementCode:  z.string().min(1),
  hStatementText:  z.string().min(1),
  pStatementCodes: z.array(z.string()).default([]),
})

export const createHazardProfileSchema = z.object({
  canonicalName:      z.string().min(1),
  displayName:         z.string().min(1),
  aliases:             z.array(z.string()).default([]),
  casNo:               z.string().nullable().optional(),
  genericDescription:  z.string().min(1),
  functionCategory:    z.string().min(1),
  compatNotes:         z.string().nullable().optional(),
  hazardClassifications: z.array(hazardClassificationSchema).default([]),
  pictograms:          z.array(z.string()).default([]),
  thresholdPercent:    z.number().min(0).max(100).default(1),
  disclosureRequired:  z.boolean().default(false),
  disclosureThresholdPercent: z.number().min(0).max(100).nullable().optional(),
  notes:               z.string().nullable().optional(),
  isActive:            z.boolean().default(true),
})

export const updateHazardProfileSchema = createHazardProfileSchema.partial()

export const listHazardProfilesQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
})

export type CreateHazardProfileBody = z.infer<typeof createHazardProfileSchema>
export type UpdateHazardProfileBody = z.infer<typeof updateHazardProfileSchema>
