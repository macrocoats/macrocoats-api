import { z } from 'zod'
import { PRODUCT_KEYS } from '../../types/index.js'

const contactFields = {
  contactPerson: z.string().min(1).max(200).optional(),
  email:         z.string().email('Invalid email format').optional(),
  phone:         z.string().regex(/^\d{10}$/, 'Must be 10 digits').optional(),
  gstNumber:     z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GST format').optional(),
  address:       z.string().max(500).optional(),
  city:          z.string().max(100).optional(),
  state:         z.string().max(100).optional(),
  pincode:       z.string().regex(/^\d{6}$/, 'Must be 6 digits').optional(),
}

export const createCompanySchema = z.object({
  key:             z.string().min(1).max(60).regex(/^[a-z0-9]+$/, 'Lowercase alphanumeric only'),
  displayName:     z.string().min(1).max(200),
  allowedProducts: z.array(z.enum(PRODUCT_KEYS as [string, ...string[]])).min(1),
  tokenExpiresAt:  z.string().datetime({ offset: true }).optional(),
  ...contactFields,
})

export const updateCompanySchema = z.object({
  displayName:     z.string().min(1).max(200).optional(),
  allowedProducts: z.array(z.enum(PRODUCT_KEYS as [string, ...string[]])).min(1).optional(),
  tokenExpiresAt:  z.string().datetime({ offset: true }).nullable().optional(),
  ...contactFields,
})

export type CreateCompanyBody = z.infer<typeof createCompanySchema>
export type UpdateCompanyBody = z.infer<typeof updateCompanySchema>
