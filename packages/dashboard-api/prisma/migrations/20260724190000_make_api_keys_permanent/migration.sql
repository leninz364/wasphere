-- API keys remain valid until their row is explicitly deleted.
-- Keep the legacy columns for schema compatibility, but normalize all rows.
UPDATE "api_keys"
SET
  "is_active" = TRUE,
  "expires_at" = NULL;
