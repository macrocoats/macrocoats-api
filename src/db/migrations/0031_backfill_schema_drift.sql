-- Hand-written: company_product_prices and these 10 indexes reached the schema and the
-- drizzle snapshots (from 0011 on) via db:push but never got a migration, so a database
-- built from migrations alone was missing them. IF NOT EXISTS keeps this a no-op where
-- they were already pushed.
CREATE TABLE IF NOT EXISTS "company_product_prices" (
	"company_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"price_per_litre" numeric(10, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_product_prices_company_id_product_key_pk" PRIMARY KEY("company_id","product_key")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "company_product_prices" ADD CONSTRAINT "company_product_prices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sr_staff_id_idx" ON "employee_salary_records" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_created_by_idx" ON "batches" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pfv_product_key_idx" ON "product_formulation_variants" USING btree ("product_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pfv_company_id_idx" ON "product_formulation_variants" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpa_company_id_idx" ON "company_product_access" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_company_id_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_log_user_id_idx" ON "access_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_log_at_company_key_idx" ON "access_log" USING btree ("at","company_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rt_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qli_quotation_id_idx" ON "quotation_line_items" USING btree ("quotation_id");
