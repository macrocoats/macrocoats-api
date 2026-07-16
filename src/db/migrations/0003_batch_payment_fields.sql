ALTER TABLE "batches" ADD COLUMN "payment_due_date" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "payment_term_days" integer DEFAULT 45;
