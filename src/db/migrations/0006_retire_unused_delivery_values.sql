-- Retire only the unused sending records. Household invitations, responses,
-- tokens, messages and open timestamps are deliberately unaffected.
-- ALTER takes the table lock before cleanup; the migrator's transaction keeps
-- older app instances from inserting a retired value between these statements.
ALTER TABLE "delivery_channels" DROP CONSTRAINT "delivery_channels_channel_valid";--> statement-breakpoint
ALTER TABLE "delivery_channels" DROP CONSTRAINT "delivery_channels_status_valid";--> statement-breakpoint
DELETE FROM "delivery_channels" WHERE "channel" = 'in_person';--> statement-breakpoint
UPDATE "delivery_channels" SET "status" = 'sent' WHERE "status" = 'delivered';--> statement-breakpoint
ALTER TABLE "delivery_channels" ADD CONSTRAINT "delivery_channels_channel_valid" CHECK (channel IN ('whatsapp', 'print', 'instagram', 'messenger', 'wechat'));--> statement-breakpoint
ALTER TABLE "delivery_channels" ADD CONSTRAINT "delivery_channels_status_valid" CHECK (status IN ('pending', 'sent'));
