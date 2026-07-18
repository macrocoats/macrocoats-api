CREATE TABLE IF NOT EXISTS "customer_purchase_order_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_n" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_po_number" text NOT NULL,
	"customer_po_date" date NOT NULL,
	"reference_quotation_id" uuid,
	"expected_delivery_date" date,
	"customer_contact" text,
	"remarks" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"total_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customer_purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"product_key" text NOT NULL,
	"variant_id" uuid,
	"customer_product_code" text,
	"quantity_ordered" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'L' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_purchase_order_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"category" text NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_document_id" uuid,
	"remarks" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_purchase_order_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"linked_quantity" numeric(12, 3) NOT NULL,
	"remarks" text,
	"linked_by" uuid,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_purchase_order_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"user_id" uuid,
	"remarks" text,
	"metadata" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "customer_purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "customer_purchase_order_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_customer_id_companies_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_reference_quotation_id_quotations_id_fk" FOREIGN KEY ("reference_quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_orders" ADD CONSTRAINT "customer_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_items" ADD CONSTRAINT "customer_purchase_order_items_order_id_customer_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."customer_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_items" ADD CONSTRAINT "customer_purchase_order_items_product_key_products_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."products"("key") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_items" ADD CONSTRAINT "customer_purchase_order_items_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_documents" ADD CONSTRAINT "customer_purchase_order_documents_order_id_customer_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."customer_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_documents" ADD CONSTRAINT "customer_purchase_order_documents_supersedes_document_id_customer_purchase_order_documents_id_fk" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."customer_purchase_order_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_documents" ADD CONSTRAINT "customer_purchase_order_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_batches" ADD CONSTRAINT "customer_purchase_order_batches_order_id_customer_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."customer_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_batches" ADD CONSTRAINT "customer_purchase_order_batches_order_item_id_customer_purchase_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."customer_purchase_order_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_batches" ADD CONSTRAINT "customer_purchase_order_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_batches" ADD CONSTRAINT "customer_purchase_order_batches_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_timeline" ADD CONSTRAINT "customer_purchase_order_timeline_order_id_customer_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."customer_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_purchase_order_timeline" ADD CONSTRAINT "customer_purchase_order_timeline_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_customer_id_idx" ON "customer_purchase_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_status_idx" ON "customer_purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_customer_po_number_idx" ON "customer_purchase_orders" USING btree ("customer_po_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_items_order_id_idx" ON "customer_purchase_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_items_product_key_idx" ON "customer_purchase_order_items" USING btree ("product_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_documents_order_id_idx" ON "customer_purchase_order_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_documents_category_idx" ON "customer_purchase_order_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_batches_order_id_idx" ON "customer_purchase_order_batches" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_batches_order_item_id_idx" ON "customer_purchase_order_batches" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_batches_batch_id_idx" ON "customer_purchase_order_batches" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cpo_batches_item_batch_unique" ON "customer_purchase_order_batches" USING btree ("order_item_id","batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cpo_timeline_order_idx" ON "customer_purchase_order_timeline" USING btree ("order_id","at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_customer_purchase_order_id_customer_purchase_orders_id_fk" FOREIGN KEY ("customer_purchase_order_id") REFERENCES "public"."customer_purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_customer_purchase_order_item_id_customer_purchase_order_items_id_fk" FOREIGN KEY ("customer_purchase_order_item_id") REFERENCES "public"."customer_purchase_order_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatches_cpo_id_idx" ON "dispatches" USING btree ("customer_purchase_order_id");