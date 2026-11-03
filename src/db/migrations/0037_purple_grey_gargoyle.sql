ALTER TABLE "products" ADD COLUMN "default_process_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "product_formulation_variants" ADD COLUMN "process_tag_additions" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "product_formulation_variants" ADD COLUMN "process_tag_removals" text[] DEFAULT ARRAY[]::text[] NOT NULL;