ALTER TABLE "webhooks"
ADD COLUMN "api_key_id" UUID;

-- Preserve existing Agent IA connections by linking each webhook to the most
-- recently created key with the same workspace and display name.
UPDATE "webhooks" AS webhook
SET "api_key_id" = (
  SELECT api_key."id"
  FROM "api_keys" AS api_key
  WHERE api_key."workspace_id" = webhook."workspace_id"
    AND lower(trim(api_key."name")) = lower(trim(webhook."name"))
  ORDER BY api_key."created_at" DESC
  LIMIT 1
);

CREATE INDEX "webhooks_api_key_id_idx" ON "webhooks"("api_key_id");

ALTER TABLE "webhooks"
ADD CONSTRAINT "webhooks_api_key_id_fkey"
FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
