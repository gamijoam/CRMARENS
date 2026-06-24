DROP INDEX IF EXISTS "contact_channels_channel_external_id_key";

CREATE INDEX "contact_channels_channel_external_id_idx" ON "contact_channels"("channel", "external_id");
