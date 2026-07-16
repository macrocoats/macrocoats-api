import { z } from 'zod'

export const listVendorPricesQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
})

export const createVendorPriceSchema = z.object({
  inventoryItemId: z.string().uuid(),
  effectiveFrom:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitPrice:       z.number().min(0),
  unit:            z.enum(['Kg', 'L']),
  currency:        z.literal('INR').default('INR'),
  minimumOrderQty: z.number().min(0).nullable().optional(),
  leadTimeDays:    z.number().int().min(0).nullable().optional(),
  remarks:         z.string().max(1000).optional(),
})

export const effectivePriceQuerySchema = z.object({
  inventoryItemId: z.string().uuid(),
  date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type ListVendorPricesQuery = z.infer<typeof listVendorPricesQuerySchema>
export type CreateVendorPriceBody = z.infer<typeof createVendorPriceSchema>
export type EffectivePriceQuery   = z.infer<typeof effectivePriceQuerySchema>
