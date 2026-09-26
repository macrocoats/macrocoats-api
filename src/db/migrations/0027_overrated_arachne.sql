CREATE TABLE IF NOT EXISTS "company_formula_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"is_default_for_company" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_product_key_products_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."products"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_formula_assignments" ADD CONSTRAINT "company_formula_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cfa_company_variant_unique" ON "company_formula_assignments" USING btree ("company_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cfa_company_product_default_unique" ON "company_formula_assignments" USING btree ("company_id","product_key") WHERE is_default_for_company = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfa_company_id_idx" ON "company_formula_assignments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfa_variant_id_idx" ON "company_formula_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cfa_product_key_idx" ON "company_formula_assignments" USING btree ("product_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_quot_date_idx" ON "quotations" USING btree ("quot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_created_at_idx" ON "quotations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_production_date_idx" ON "batches" USING btree ("production_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_product_code_idx" ON "batches" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_variant_id_idx" ON "batches" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_created_at_idx" ON "batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_customer_po_date_idx" ON "customer_purchase_orders" USING btree ("customer_po_date");