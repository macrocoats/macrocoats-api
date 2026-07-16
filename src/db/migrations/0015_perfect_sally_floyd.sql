CREATE TABLE IF NOT EXISTS "ingredient_hazard_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"display_name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]' NOT NULL,
	"cas_no" text,
	"generic_description" text NOT NULL,
	"function_category" text NOT NULL,
	"compat_notes" text,
	"hazard_classifications" jsonb DEFAULT '[]' NOT NULL,
	"pictograms" jsonb DEFAULT '[]' NOT NULL,
	"threshold_percent" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"disclosure_required" boolean DEFAULT false NOT NULL,
	"disclosure_threshold_percent" numeric(5, 2),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ingredient_hazard_profiles_canonical_name_unique" UNIQUE("canonical_name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingredient_hazard_profiles" ADD CONSTRAINT "ingredient_hazard_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
