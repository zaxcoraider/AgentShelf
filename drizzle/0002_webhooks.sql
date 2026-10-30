CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"resource_id" text,
	"outcome" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;