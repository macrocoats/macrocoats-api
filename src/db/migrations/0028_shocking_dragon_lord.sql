CREATE TABLE IF NOT EXISTS "customer_pipeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"location" text,
	"company_id" uuid,
	"trial_status" text DEFAULT 'unknown' NOT NULL,
	"vendor_registration" text DEFAULT 'unknown' NOT NULL,
	"products" text,
	"next_step" text,
	"notes" text,
	"status_date" date,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_pipeline_entries" ADD CONSTRAINT "customer_pipeline_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_pipeline_entries" ADD CONSTRAINT "customer_pipeline_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_pipeline_entries_company_id_idx" ON "customer_pipeline_entries" USING btree ("company_id");