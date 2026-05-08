import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { salaryRecords } from '../../db/schema/index.js'
import type { CreateSalaryRecordInput } from './salaryRecords.schema.js'

function toResponse(row: typeof salaryRecords.$inferSelect) {
  return {
    id:              row.id,
    staffId:         row.staffId,
    employeeName:    row.employeeName,
    designation:     row.designation,
    department:      row.department ?? null,
    month:           row.month,
    year:            row.year,
    workingDays:     row.workingDays,
    daysWorked:      row.daysWorked ?? null,
    salaryPerMonth:  row.salaryPerMonth,
    basic:           row.basic,
    otherAllowance:  row.otherAllowance,
    overtime:        row.overtime,
    bonus:           row.bonus,
    grossSalary:     row.grossSalary,
    otherDeductions: row.otherDeductions,
    totalDeductions: row.totalDeductions,
    netSalary:       row.netSalary,
    panNumber:       row.panNumber ?? null,
    aadharNumber:    row.aadharNumber ?? null,
    dateOfJoining:   row.dateOfJoining ?? null,
    generatedAt:     row.generatedAt.toISOString(),
    createdAt:       row.createdAt.toISOString(),
  }
}

export async function saveSalaryRecord(data: CreateSalaryRecordInput) {
  const values = {
    staffId:         data.staffId,
    employeeName:    data.employeeName,
    designation:     data.designation,
    department:      data.department || null,
    month:           data.month,
    year:            data.year,
    workingDays:     data.workingDays,
    daysWorked:      data.daysWorked ?? null,
    salaryPerMonth:  data.salaryPerMonth,
    basic:           data.basic,
    otherAllowance:  data.otherAllowance,
    overtime:        data.overtime,
    bonus:           data.bonus,
    grossSalary:     data.grossSalary,
    otherDeductions: data.otherDeductions,
    totalDeductions: data.totalDeductions,
    netSalary:       data.netSalary,
    panNumber:       data.panNumber ?? null,
    aadharNumber:    data.aadharNumber ?? null,
    dateOfJoining:   data.dateOfJoining ?? null,
    generatedAt:     new Date(),
  }

  const [row] = await db
    .insert(salaryRecords)
    .values(values)
    .onConflictDoUpdate({
      target: [salaryRecords.staffId, salaryRecords.month, salaryRecords.year],
      set: {
        employeeName:    values.employeeName,
        designation:     values.designation,
        department:      values.department,
        workingDays:     values.workingDays,
        daysWorked:      values.daysWorked,
        salaryPerMonth:  values.salaryPerMonth,
        basic:           values.basic,
        otherAllowance:  values.otherAllowance,
        overtime:        values.overtime,
        bonus:           values.bonus,
        grossSalary:     values.grossSalary,
        otherDeductions: values.otherDeductions,
        totalDeductions: values.totalDeductions,
        netSalary:       values.netSalary,
        panNumber:       values.panNumber,
        aadharNumber:    values.aadharNumber,
        dateOfJoining:   values.dateOfJoining,
        generatedAt:     values.generatedAt,
      },
    })
    .returning()

  return toResponse(row)
}

export async function listSalaryRecords(filters: {
  staffId?: string
  month?:   number
  year?:    number
}) {
  const conditions = []
  if (filters.staffId) conditions.push(eq(salaryRecords.staffId, filters.staffId))
  if (filters.month)   conditions.push(eq(salaryRecords.month,   filters.month))
  if (filters.year)    conditions.push(eq(salaryRecords.year,    filters.year))

  const rows = await db
    .select()
    .from(salaryRecords)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(salaryRecords.year), desc(salaryRecords.month), desc(salaryRecords.createdAt))

  return rows.map(toResponse)
}

export async function getSalaryRecordById(id: string) {
  const [row] = await db
    .select()
    .from(salaryRecords)
    .where(eq(salaryRecords.id, id))

  return row ? toResponse(row) : null
}
