import { z } from 'zod'
import { PRODUCT_KEYS } from '../../types/index.js'

export const createCompanySchema = z.object({
  key:             z.string().min(1).max(60).regex(/^[a-z0-9]+$/, 'Lowercase alphanumeric only'),
  displayName:     z.string().min(1).max(200),
  allowedProducts: z.array(z.enum(PRODUCT_KEYS as [string, ...string[]])).min(1),
  tokenExpiresAt:  z.string().datetime({ offset: true }).optional(),
})

export const updateCompanySchema = z.object({
  displayName:     z.string().min(1).max(200).optional(),
  allowedProducts: z.array(z.enum(PRODUCT_KEYS as [string, ...string[]])).min(1).optional(),
  tokenExpiresAt:  z.string().datetime({ offset: true }).nullable().optional(),
})

export type CreateCompanyBody = z.infer<typeof createCompanySchema>
export type UpdateCompanyBody = z.infer<typeof updateCompanySchema>
