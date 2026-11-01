CREATE TABLE "market_comparables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"channel3_product_id" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"store" text NOT NULL,
	"url" text NOT NULL,
	"image_url" text,
	"price_cents" integer NOT NULL,
	"previous_price_cents" integer,
	"price_changed_at" timestamp with time zone,
	"subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "market_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "market_comparables" ADD CONSTRAINT "market_comparables_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_comparables_product_idx" ON "market_comparables" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "market_comparables_c3_idx" ON "market_comparables" USING btree ("channel3_product_id");