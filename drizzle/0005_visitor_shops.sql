ALTER TABLE "sellers" ADD COLUMN "visitor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "creator_key" text;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "expires_at" timestamp with time zone;