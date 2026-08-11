ALTER TABLE "webhooks"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'generic';

UPDATE "webhooks"
SET "provider" = 'openclaw'
WHERE lower("name") LIKE '%openclaw%'
   OR "url" ~* '/hooks/(agent|wasphere)/?$';
