CREATE TABLE IF NOT EXISTS "employee_salary_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"employee_name" text NOT NULL,
	"designation" text NOT NULL,
	"department" text,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"working_days" integer NOT NULL,
	"days_worked" integer,
	"salary_per_month" integer NOT NULL,
	"basic" integer NOT NULL,
	"other_allowance" integer NOT NULL,
	"overtime" integer NOT NULL,
	"bonus" integer NOT NULL,
	"gross_salary" integer NOT NULL,
	"other_deductions" integer NOT NULL,
	"total_deductions" integer NOT NULL,
	"net_salary" integer NOT NULL,
	"pan_number" text,
	"aadhar_number" text,
	"date_of_joining" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_salary_record_staff_month_year" UNIQUE("staff_id","month","year")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_customer_name_idx" ON "quotations" USING btree ("customer_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_log_at_idx" ON "access_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_log_company_key_idx" ON "access_log" USING btree ("company_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "batches_company_name_idx" ON "batches" USING btree ("company_name");