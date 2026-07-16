ALTER TABLE "product_formulation_variants" DROP CONSTRAINT "pfv_product_company_unique";--> statement-breakpoint
ALTER TABLE "product_formulation_variants" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_formulation_variants" ADD COLUMN "source_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_formulation_variants" ADD COLUMN "optimization_meta" jsonb;--> statement-breakpoint
ALTER TABLE "product_formulation_variants" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_formulation_variants" ADD CONSTRAINT "product_formulation_variants_source_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("source_variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pfv_product_company_default_unique" ON "product_formulation_variants" USING btree ("product_key","company_id") WHERE is_default = true;