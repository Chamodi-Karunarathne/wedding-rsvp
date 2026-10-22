CREATE TABLE "api_rate_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"requests" integer NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_rate_limits_scope_key_hash_pk" PRIMARY KEY("scope","key_hash"),
	CONSTRAINT "api_rate_limits_requests_positive" CHECK ("api_rate_limits"."requests" >= 1),
	CONSTRAINT "api_rate_limits_key_hash_valid" CHECK ("api_rate_limits"."key_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "api_rate_limits_expiry_idx" ON "api_rate_limits" USING btree ("window_ends_at");