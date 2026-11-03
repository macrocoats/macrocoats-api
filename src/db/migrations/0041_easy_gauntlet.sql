CREATE TABLE IF NOT EXISTS "zoho_invoice_details" (
	"zoho_invoice_id" text PRIMARY KEY NOT NULL,
	"last_modified" text DEFAULT '' NOT NULL,
	"invoice_date" date,
	"zoho_customer_id" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zoho_invoice_details_invoice_date_idx" ON "zoho_invoice_details" USING btree ("invoice_date");