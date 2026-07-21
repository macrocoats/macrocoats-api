CREATE TABLE IF NOT EXISTS "product_formulation_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_key" text NOT NULL,
	"company_id" uuid,
	"variant_name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pfv_product_company_unique" UNIQUE("product_key","company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "formulation_variant_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"material_name" text NOT NULL,
	"percentage" numeric(5, 2),
	"unit" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "variant_name" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "coa_snapshot" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_formulation_variants" ADD CONSTRAINT "product_formulation_variants_product_key_products_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."products"("key") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_formulation_variants" ADD CONSTRAINT "product_formulation_variants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formulation_variant_components" ADD CONSTRAINT "formulation_variant_components_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fvc_variant_id_idx" ON "formulation_variant_components" USING btree ("variant_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
