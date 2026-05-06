import { z } from 'zod'

export const createStaffSchema = z.object({
  name:           z.string().min(1).max(100),
  designation:    z.string().min(1).max(100),
  phone:          z.string().regex(/^\d{10}$/, 'Must be 10 digits'),
  email:          z.union([z.string().email(), z.literal('')]).optional(),
  panNumber:      z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format').optional().or(z.literal('')).optional(),
  aadharNumber:   z.string().regex(/^\d{12}$/, 'Must be 12 digits').optional().or(z.literal('')).optional(),
  dateOfJoining:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  salaryPerMonth: z.number().int().min(0),
})

export const updateStaffSchema = createStaffSchema.partial()

export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
