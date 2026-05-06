import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'

export const staff = pgTable('staff', {
  id:             uuid('id').primaryKey().defaultRandom(),
  name:           text('name').notNull(),
  designation:    text('designation').notNull(),
  phone:          text('phone').notNull(),
  email:          text('email'),
  panNumber:      text('pan_number'),
  aadharNumber:   text('aadhar_number'),
  dateOfJoining:  text('date_of_joining').notNull(),
  salaryPerMonth: integer('salary_per_month').notNull(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Staff    = typeof staff.$inferSelect
export type NewStaff = typeof staff.$inferInsert
