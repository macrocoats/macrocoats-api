CREATE TABLE IF NOT EXISTS "vendor_material_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"unit_price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"unit" text NOT NULL,
	"minimum_order_qty" numeric(10, 2),
	"lead_time_days" integer,
	"remarks" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"purchase_date" date NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"suggested_unit_price" numeric(10, 2),
	"price_source" text NOT NULL,
	"vendor_price_id" uuid,
	"invoice_number" text,
	"remarks" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_material_prices" ADD CONSTRAINT "vendor_material_prices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_material_prices" ADD CONSTRAINT "vendor_material_prices_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vendor_material_prices" ADD CONSTRAINT "vendor_material_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_vendor_price_id_vendor_material_prices_id_fk" FOREIGN KEY ("vendor_price_id") REFERENCES "public"."vendor_material_prices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_entries" ADD CONSTRAINT "purchase_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vmp_vendor_id_idx" ON "vendor_material_prices" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vmp_inventory_item_id_idx" ON "vendor_material_prices" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vmp_vendor_item_effective_idx" ON "vendor_material_prices" USING btree ("vendor_id","inventory_item_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vmp_one_active_per_vendor_material" ON "vendor_material_prices" USING btree ("vendor_id","inventory_item_id") WHERE effective_to IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pe_vendor_id_idx" ON "purchase_entries" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pe_inventory_item_id_idx" ON "purchase_entries" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pe_purchase_date_idx" ON "purchase_entries" USING btree ("purchase_date");