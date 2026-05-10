import { z } from 'zod'
import { PRODUCT_KEYS } from '../../types/index.js'

export const componentBodySchema = z.object({
  materialName: z.string().min(1),
  percentage:   z.number().min(0).max(100).nullable(),
  unit:         z.enum(['L', 'Kg']),
  sortOrder:    z.number().int().default(0),
})

export const createVariantSchema = z.object({
  productKey:  z.enum(PRODUCT_KEYS as unknown as [string, ...string[]]),
  companyId:   z.string().uuid().nullable(),
  variantName: z.string().min(1).max(200),
  isDefault:   z.boolean().default(false),
  components:  z.array(componentBodySchema).min(1),
})

export const updateVariantSchema = z.object({
  variantName: z.string().min(1).max(200).optional(),
  isDefault:   z.boolean().optional(),
})

export const replaceComponentsSchema = z.object({
  components: z.array(componentBodySchema).min(1),
})

export type ComponentBody      = z.infer<typeof componentBodySchema>
export type CreateVariantBody  = z.infer<typeof createVariantSchema>
export type UpdateVariantBody  = z.infer<typeof updateVariantSchema>
export type ReplaceComponentsBody = z.infer<typeof replaceComponentsSchema>
