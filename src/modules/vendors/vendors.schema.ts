import { z } from 'zod'

export const phoneNumbersSchema = z.array(z.string().min(7).max(15))

export const chemicalSchema = z.object({
  chemicalName: z.string().min(1),
  rate:         z.number().min(0),
  unit:         z.enum(['L', 'kg']),
})

export const bankDetailsSchema = z.object({
  bankName:      z.string().min(1),
  accountName:   z.string().min(1),
  accountNumber: z.string().min(1),
  ifsc:          z.string().min(1),
  branch:        z.string().optional(),
}).optional()

export const createVendorSchema = z.object({
  vendorName:    z.string().min(1).max(200),
  gstNumber:     z.string().min(1).max(20),
  address:       z.string().optional(),
  email:         z.union([z.string().email(), z.literal('')]).optional(),
  contactPerson: z.string().optional(),
  phoneNumbers:  phoneNumbersSchema.default([]),
  bankDetails:   bankDetailsSchema,
  chemicals:     z.array(chemicalSchema).default([]),
})

export const updateVendorSchema = createVendorSchema.partial()

export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>
