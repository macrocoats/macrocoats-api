import { z } from 'zod'

export const loginSchema = z.object({
  // The service canonicalizes usernames before lookup; validation must accept
  // the same case-insensitive input surface or normalization is unreachable.
  username: z.string().min(1).max(30).regex(/^[a-z0-9_.-]+$/i),
  password: z.string().min(1).max(200),
})

export const tokenSchema = z.object({
  token: z.string().min(1).max(200),
})

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().min(1).max(2048),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword:     z.string().min(12).max(200),
})

const userResponseSchema = z.object({
  id:              z.string().uuid(),
  name:            z.string(),
  role:            z.enum(['superadmin', 'company']),
  companyName:     z.string().nullable(),
  allowedProducts: z.array(z.string()).nullable(),
})

type LoginBody         = z.infer<typeof loginSchema>
type TokenBody         = z.infer<typeof tokenSchema>
type MobileRefreshBody = z.infer<typeof mobileRefreshSchema>
type ChangePasswordBody = z.infer<typeof changePasswordSchema>
type UserResponse      = z.infer<typeof userResponseSchema>
