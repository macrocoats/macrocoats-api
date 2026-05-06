import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const vendors = pgTable('vendors', {
  id:            uuid('id').primaryKey().defaultRandom(),
  vendorName:    text('vendor_name').notNull(),
  gstNumber:     text('gst_number').notNull(),
  address:       text('address'),
  email:         text('email'),
  contactPerson: text('contact_person'),
  phoneNumbers:  jsonb('phone_numbers').notNull().$type<string[]>(),
  bankDetails:   jsonb('bank_details').$type<{
    bankName: string
    accountName: string
    accountNumber: string
    ifsc: string
    branch?: string
  }>(),
  chemicals: jsonb('chemicals').notNull().$type<Array<{
    chemicalName: string
    rate: number
    unit: string
  }>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Vendor    = typeof vendors.$inferSelect
export type NewVendor = typeof vendors.$inferInsert
