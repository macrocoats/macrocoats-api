import { z } from 'zod'

export const createInventoryItemSchema = z.object({
  material:          z.string().min(1).max(200),
  unit:              z.enum(['Kg', 'L']),
  price:             z.number().min(0),
  stock:             z.string().max(200).optional().default(''),
  supplier:          z.string().max(200).default(''),
  sortOrder:         z.number().int().default(0),
  stockQty:          z.number().min(0).nullable().optional(),
  lowStockThreshold: z.number().int().min(1).optional(),
})

export const updateInventoryItemSchema = createInventoryItemSchema.partial()

export const inventoryItemResponseSchema = z.object({
  id:                z.string().uuid(),
  material:          z.string(),
  unit:              z.enum(['Kg', 'L']),
  price:             z.number(),
  supplier:          z.string(),
  sortOrder:         z.number(),
  stockQty:          z.number().nullable(),
  lowStockThreshold: z.number(),
  stockStatus:       z.enum(['unknown', 'out_of_stock', 'low', 'in_stock']),
  updatedAt:         z.string(),
})

export type CreateInventoryItemBody = z.infer<typeof createInventoryItemSchema>
export type UpdateInventoryItemBody = z.infer<typeof updateInventoryItemSchema>
export type StockStatus = 'unknown' | 'out_of_stock' | 'low' | 'in_stock'
