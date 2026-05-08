import { z } from 'zod'

export const createSalaryRecordSchema = z.object({
  staffId:         z.string().uuid(),
  employeeName:    z.string().min(1).max(100),
  designation:     z.string().min(1).max(100),
  department:      z.string().max(100).nullable().optional(),
  month:           z.number().int().min(1).max(12),
  year:            z.number().int().min(2020),
  workingDays:     z.number().int().min(0),
  daysWorked:      z.number().int().min(0).nullable().optional(),
  salaryPerMonth:  z.number().int().min(0),
  basic:           z.number().int().min(0),
  otherAllowance:  z.number().int().min(0),
  overtime:        z.number().int().min(0),
  bonus:           z.number().int().min(0),
  grossSalary:     z.number().int().min(0),
  otherDeductions: z.number().int().min(0),
  totalDeductions: z.number().int().min(0),
  netSalary:       z.number().int().min(0),
  panNumber:       z.string().nullable().optional(),
  aadharNumber:    z.string().nullable().optional(),
  dateOfJoining:   z.string().nullable().optional(),
})

export type CreateSalaryRecordInput = z.infer<typeof createSalaryRecordSchema>
