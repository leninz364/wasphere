UPDATE "webhooks"
SET "provider" = 'n8n'
WHERE "provider" = 'generic'
  AND (
    lower("name") LIKE '%n8n%'
    OR "url" ~* '/webhook(-test)?/'
  );
