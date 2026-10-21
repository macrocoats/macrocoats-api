import { pgTable, uuid, text, date, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { companies } from './companies.js'
import { users } from './users.js'

/**
 * Prospective customers and where they stand on trials and vendor registration.
 * This is the one part of the Customer Supply dashboard that Zoho can't tell us
 * (Zoho only knows about invoiced customers), so it is entered by a superadmin.
 * `companyId` is optional: most prospects are not portal companies yet.
 * Statuses are TypeScript-only enums (validated by Zod), like `users.role`.
 */
export const customerPipelineEntries = pgTable('customer_pipeline_entries', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  companyName:        text('company_name').notNull(),
  location:           text('location'),
  companyId:          uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
  trialStatus:        text('trial_status', {
    enum: ['unknown', 'not_started', 'planned', 'in_progress', 'completed', 'failed', 'not_required'],
  }).notNull().default('unknown'),
  vendorRegistration: text('vendor_registration', {
    enum: ['unknown', 'not_started', 'awaiting', 'submitted', 'registered', 'not_required'],
  }).notNull().default('unknown'),
  products:           text('products'),
  nextStep:           text('next_step'),
  notes:              text('notes'),
  statusDate:         date('status_date'),
  archivedAt:         timestamp('archived_at', { withTimezone: true }),
  createdBy:          uuid('created_by').references(() => users.id),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('customer_pipeline_entries_company_id_idx').on(t.companyId),
])

export const customerPipelineEntriesRelations = relations(customerPipelineEntries, ({ one }) => ({
  company: one(companies, { fields: [customerPipelineEntries.companyId], references: [companies.id] }),
  creator: one(users,     { fields: [customerPipelineEntries.createdBy], references: [users.id] }),
}))

export type CustomerPipelineEntry    = typeof customerPipelineEntries.$inferSelect
export type NewCustomerPipelineEntry = typeof customerPipelineEntries.$inferInsert
