import { pgTable, uuid, text, integer, timestamp, unique } from 'drizzle-orm/pg-core'

export const salaryRecords = pgTable('employee_salary_records', {
  id:              uuid('id').primaryKey().defaultRandom(),
  staffId:         uuid('staff_id').notNull(),
  employeeName:    text('employee_name').notNull(),
  designation:     text('designation').notNull(),
  department:      text('department'),
  month:           integer('month').notNull(),
  year:            integer('year').notNull(),
  workingDays:     integer('working_days').notNull(),
  daysWorked:      integer('days_worked'),
  salaryPerMonth:  integer('salary_per_month').notNull(),
  basic:           integer('basic').notNull(),
  otherAllowance:  integer('other_allowance').notNull(),
  overtime:        integer('overtime').notNull(),
  bonus:           integer('bonus').notNull(),
  grossSalary:     integer('gross_salary').notNull(),
  otherDeductions: integer('other_deductions').notNull(),
  totalDeductions: integer('total_deductions').notNull(),
  netSalary:       integer('net_salary').notNull(),
  panNumber:       text('pan_number'),
  aadharNumber:    text('aadhar_number'),
  dateOfJoining:   text('date_of_joining'),
  generatedAt:     timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:       timestamp('created_at',   { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPerMonth: unique('uq_salary_record_staff_month_year').on(t.staffId, t.month, t.year),
}))

export type SalaryRecord    = typeof salaryRecords.$inferSelect
export type NewSalaryRecord = typeof salaryRecords.$inferInsert
