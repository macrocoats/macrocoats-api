CREATE TABLE IF NOT EXISTS "zoho_invoice_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"zoho_invoice_id" text,
	"zoho_invoice_number" text,
	"status" text,
	"total" numeric(12, 2),
	"balance" numeric(12, 2),
	"invoice_date" date,
	"due_date" date,
	"last_synced_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zoho_invoice_syncs_dispatch_id_unique" UNIQUE("dispatch_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zoho_invoice_syncs" ADD CONSTRAINT "zoho_invoice_syncs_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zoho_invoice_syncs_status_idx" ON "zoho_invoice_syncs" USING btree ("status");