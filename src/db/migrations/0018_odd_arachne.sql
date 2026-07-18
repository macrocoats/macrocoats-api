CREATE TABLE IF NOT EXISTS "purchase_order_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"doc_category" text NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" date NOT NULL,
	"invoice_amount" numeric(10, 2) NOT NULL,
	"invoice_document_id" uuid,
	"remarks" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"material_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"gst_percent" numeric(5, 2) DEFAULT '18.00' NOT NULL,
	"gst_amount" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_n" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"notes" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" uuid NOT NULL,
	"po_date" date NOT NULL,
	"expected_delivery_date" date,
	"payment_terms" text,
	"delivery_address" text,
	"remarks" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_date" date,
	"payment_reference_number" text,
	"payment_remarks" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_documents" ADD CONSTRAINT "purchase_order_documents_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_documents" ADD CONSTRAINT "purchase_order_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_invoices" ADD CONSTRAINT "purchase_order_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_invoices" ADD CONSTRAINT "purchase_order_invoices_invoice_document_id_purchase_order_documents_id_fk" FOREIGN KEY ("invoice_document_id") REFERENCES "public"."purchase_order_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_invoices" ADD CONSTRAINT "purchase_order_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_material_id_inventory_items_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_timeline" ADD CONSTRAINT "purchase_order_timeline_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_timeline" ADD CONSTRAINT "purchase_order_timeline_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pod_purchase_order_id_idx" ON "purchase_order_documents" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pod_doc_category_idx" ON "purchase_order_documents" USING btree ("doc_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poinv_purchase_order_id_idx" ON "purchase_order_invoices" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poi_purchase_order_id_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poi_material_id_idx" ON "purchase_order_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pot_purchase_order_id_idx" ON "purchase_order_timeline" USING btree ("purchase_order_id","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_vendor_id_idx" ON "purchase_orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_po_date_idx" ON "purchase_orders" USING btree ("po_date");