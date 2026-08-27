ALTER TABLE "guests" DROP CONSTRAINT "guests_short_code_unique";--> statement-breakpoint
ALTER TABLE "guests" DROP COLUMN "short_code";--> statement-breakpoint
ALTER TABLE "guests" DROP COLUMN "postal_address";