CREATE TABLE IF NOT EXISTS "finished_goods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"product_code" text NOT NULL,
	"company_name" text NOT NULL,
	"variant_id" uuid,
	"variant_name" text,
	"produced_quantity" numeric(12, 3) NOT NULL,
	"dispatched_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"reserved_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'Available' NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finished_goods_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispatch_sequences" (
	"date_key" text PRIMARY KEY NOT NULL,
	"last_n" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_number" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"quotation_id" uuid,
	"invoice_number" text,
	"dispatch_date" date NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"transport_details" jsonb,
	"remarks" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatches_dispatch_number_unique" UNIQUE("dispatch_number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finished_goods" ADD CONSTRAINT "finished_goods_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finished_goods" ADD CONSTRAINT "finished_goods_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finished_goods_batch_id_idx" ON "finished_goods" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finished_goods_status_idx" ON "finished_goods" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finished_goods_company_name_idx" ON "finished_goods" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finished_goods_product_code_idx" ON "finished_goods" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatches_batch_id_idx" ON "dispatches" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatches_company_id_idx" ON "dispatches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatches_dispatch_date_idx" ON "dispatches" USING btree ("dispatch_date");