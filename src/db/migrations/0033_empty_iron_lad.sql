CREATE TABLE IF NOT EXISTS "production_work_order_demands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"planned_quantity" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_work_order_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_n" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_number" text NOT NULL,
	"demand_type" text NOT NULL,
	"product_key" text NOT NULL,
	"variant_id" uuid,
	"formula_snapshot" jsonb NOT NULL,
	"planned_quantity" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"scheduled_date" date NOT NULL,
	"due_date" date,
	"priority" text DEFAULT 'normal' NOT NULL,
	"owner_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"material_readiness_snapshot" jsonb,
	"reason" text,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_work_orders_work_order_number_unique" UNIQUE("work_order_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batch_material_consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"lot_number" text NOT NULL,
	"supplier_lot_number" text,
	"received_quantity" numeric(14, 3) NOT NULL,
	"available_quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"received_date" date NOT NULL,
	"expiry_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"work_order_id" uuid,
	"batch_id" uuid,
	"reason" text,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "lifecycle_status" text DEFAULT 'needs_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "actual_yield" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "expiry_date" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "release_notes" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "released_by" uuid;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "dispatch_category" text DEFAULT 'order_fulfillment' NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "exception_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_order_demands" ADD CONSTRAINT "production_work_order_demands_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_order_demands" ADD CONSTRAINT "production_work_order_demands_order_id_customer_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."customer_purchase_orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_order_demands" ADD CONSTRAINT "production_work_order_demands_order_item_id_customer_purchase_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."customer_purchase_order_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_product_key_products_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."products"("key") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_variant_id_product_formulation_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_formulation_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_work_orders" ADD CONSTRAINT "production_work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_material_consumptions" ADD CONSTRAINT "batch_material_consumptions_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_material_consumptions" ADD CONSTRAINT "batch_material_consumptions_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batch_material_consumptions" ADD CONSTRAINT "batch_material_consumptions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_work_order_id_production_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."production_work_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_reservations" ADD CONSTRAINT "material_reservations_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_work_order_demands_wo_idx" ON "production_work_order_demands" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_work_order_demands_item_idx" ON "production_work_order_demands" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "production_work_order_demands_wo_item_unique" ON "production_work_order_demands" USING btree ("work_order_id","order_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_work_orders_status_idx" ON "production_work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_work_orders_product_idx" ON "production_work_orders" USING btree ("product_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_work_orders_schedule_idx" ON "production_work_orders" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_work_orders_owner_idx" ON "production_work_orders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batch_material_consumptions_batch_idx" ON "batch_material_consumptions" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batch_material_consumptions_lot_idx" ON "batch_material_consumptions" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_lots_item_lot_unique" ON "inventory_lots" USING btree ("inventory_item_id","lot_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_lots_expiry_idx" ON "inventory_lots" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_lot_idx" ON "inventory_movements" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_work_order_idx" ON "inventory_movements" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_movements_batch_idx" ON "inventory_movements" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_reservations_work_order_idx" ON "material_reservations" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_reservations_lot_idx" ON "material_reservations" USING btree ("lot_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batches" ADD CONSTRAINT "batches_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_lifecycle_status_idx" ON "batches" USING btree ("lifecycle_status");