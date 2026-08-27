CREATE TABLE "rsvp_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"attending" boolean NOT NULL,
	"party_count" integer NOT NULL,
	"attendee_names" text,
	"source" text NOT NULL,
	"recorded_by" text,
	"superseded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvp_history_source_valid" CHECK (source IN ('self', 'admin', 'phone'))
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "display_name_fallback" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "rsvp_history" ADD CONSTRAINT "rsvp_history_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_history" ADD CONSTRAINT "rsvp_history_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rsvp_history_guest_event_idx" ON "rsvp_history" USING btree ("guest_id","event_id");