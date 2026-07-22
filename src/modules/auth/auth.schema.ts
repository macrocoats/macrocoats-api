import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1).max(30).regex(/^[a-z0-9_.-]+$/),
  password: z.string().min(1).max(200),
})

export const tokenSchema = z.object({
  token: z.string().min(1).max(200),
})

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const userResponseSchema = z.object({
  id:              z.string().uuid(),
  name:            z.string(),
  role:            z.enum(['superadmin', 'company']),
  companyName:     z.string().nullable(),
  allowedProducts: z.array(z.string()).nullable(),
})

export type LoginBody         = z.infer<typeof loginSchema>
export type TokenBody         = z.infer<typeof tokenSchema>
export type MobileRefreshBody = z.infer<typeof mobileRefreshSchema>
export type UserResponse      = z.infer<typeof userResponseSchema>
