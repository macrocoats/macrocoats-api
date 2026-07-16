CREATE TABLE IF NOT EXISTS "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_name" text NOT NULL,
	"gst_number" text NOT NULL,
	"address" text,
	"email" text,
	"contact_person" text,
	"phone_numbers" jsonb NOT NULL,
	"bank_details" jsonb,
	"chemicals" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"designation" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"pan_number" text,
	"aadhar_number" text,
	"date_of_joining" text NOT NULL,
	"salary_per_month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
