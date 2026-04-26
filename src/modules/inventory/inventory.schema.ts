import { z } from 'zod'

export const createInventoryItemSchema = z.object({
  material:  z.string().min(1).max(200),
  unit:      z.enum(['Kg', 'L']),
  price:     z.number().min(0),
  stock:     z.string().max(200).default(''),
  supplier:  z.string().max(200).default(''),
  sortOrder: z.number().int().default(0),
})

export const updateInventoryItemSchema = createInventoryItemSchema.partial()

export const inventoryItemResponseSchema = z.object({
  id:        z.string().uuid(),
  material:  z.string(),
  unit:      z.enum(['Kg', 'L']),
  price:     z.number(),
  stock:     z.string(),
  supplier:  z.string(),
  sortOrder: z.number(),
  updatedAt: z.string(),
})

export type CreateInventoryItemBody = z.infer<typeof createInventoryItemSchema>
export type UpdateInventoryItemBody = z.infer<typeof updateInventoryItemSchema>
