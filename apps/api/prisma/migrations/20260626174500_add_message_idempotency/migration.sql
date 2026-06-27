DELETE FROM "messages" winner
USING "messages" duplicate
WHERE winner."external_message_id" IS NOT NULL
  AND winner."channel" = duplicate."channel"
  AND winner."external_message_id" = duplicate."external_message_id"
  AND winner."id" > duplicate."id";

CREATE UNIQUE INDEX "messages_channel_external_message_id_key"
ON "messages"("channel", "external_message_id");
