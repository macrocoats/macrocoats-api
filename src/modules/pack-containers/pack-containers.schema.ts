import { z } from 'zod'
import { PACK_CONTAINER_IDS } from '../batches/packContainers.js'

export const containerIdSchema = z.enum(PACK_CONTAINER_IDS)

export const adjustStockSchema = z.discriminatedUnion('type', [
  // Containers bought or brought in: added to what's there.
  z.object({ type: z.literal('receipt'), quantity: z.number().int().positive(), note: z.string().trim().max(500).optional() }),
  // A physical count: replaces what's there.
  z.object({ type: z.literal('count'), quantity: z.number().int().min(0), note: z.string().trim().max(500).optional() }),
])

export const updateContainerSchema = z.object({
  lowStockThreshold: z.number().int().min(1),
})

export const listMovementsQuerySchema = z.object({
  containerId: containerIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type AdjustStockBody = z.infer<typeof adjustStockSchema>
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>
