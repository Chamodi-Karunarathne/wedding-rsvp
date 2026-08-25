CREATE TABLE "delivery_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by" text,
	"notes" text,
	CONSTRAINT "delivery_channels_guest_channel_unique" UNIQUE("guest_id","channel"),
	CONSTRAINT "delivery_channels_channel_valid" CHECK (channel IN ('whatsapp', 'print', 'in_person')),
	CONSTRAINT "delivery_channels_status_valid" CHECK (status IN ('pending', 'sent', 'delivered'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue_name" text NOT NULL,
	"venue_address" text NOT NULL,
	"map_url" text,
	"dress_code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "guest_messages" (
	"guest_id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_opens" (
	"guest_id" uuid PRIMARY KEY NOT NULL,
	"first_open" timestamp with time zone,
	"last_open" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"short_code" text NOT NULL,
	"display_name" text NOT NULL,
	"sort_name" text NOT NULL,
	"side" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"max_party_size" integer DEFAULT 2 NOT NULL,
	"phone" text,
	"postal_address" text,
	"personal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_token_unique" UNIQUE("token"),
	CONSTRAINT "guests_short_code_unique" UNIQUE("short_code"),
	CONSTRAINT "guests_side_valid" CHECK (side IN ('bride', 'groom', 'both')),
	CONSTRAINT "guests_language_valid" CHECK (language IN ('en', 'si')),
	CONSTRAINT "guests_max_party_size_positive" CHECK ("guests"."max_party_size" >= 1)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"guest_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "invitations_guest_id_event_id_pk" PRIMARY KEY("guest_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attending" boolean NOT NULL,
	"party_count" integer NOT NULL,
	"attendee_names" text,
	"source" text DEFAULT 'self' NOT NULL,
	"recorded_by" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvps_guest_event_unique" UNIQUE("guest_id","event_id"),
	CONSTRAINT "rsvps_source_valid" CHECK (source IN ('self', 'admin', 'phone')),
	CONSTRAINT "rsvps_party_count_matches_attending" CHECK (("rsvps"."attending" AND "rsvps"."party_count" >= 1) OR (NOT "rsvps"."attending" AND "rsvps"."party_count" = 0))
);
--> statement-breakpoint
CREATE TABLE "site_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_channels" ADD CONSTRAINT "delivery_channels_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_messages" ADD CONSTRAINT "guest_messages_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_opens" ADD CONSTRAINT "guest_opens_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guests_sort_name_idx" ON "guests" USING btree ("sort_name");