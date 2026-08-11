-- Backfill the retention clock for conversations that were already solved
-- before `resolved_at` was introduced. Prefer the latest real transition to
-- SOLUCIONADO; fall back once to the row's current updated_at only when no
-- historical attention event exists.
UPDATE "conversations" AS c
SET "resolved_at" = COALESCE(
  (
    SELECT MAX(e."created_at")
    FROM "conversation_events" AS e
    WHERE e."conversation_id" = c."id"
      AND e."type" = 'attention_changed'
      AND e."detail" ->> 'to' = 'SOLUCIONADO'
  ),
  c."updated_at"
)
WHERE c."status" = 'RESOLVED'
  AND c."attention" = 'SOLUCIONADO'
  AND c."resolved_at" IS NULL;
