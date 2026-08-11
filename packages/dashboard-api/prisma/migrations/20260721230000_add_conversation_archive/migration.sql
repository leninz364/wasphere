-- Soft-delete (archive) support for conversations. An OWNER/ADMIN can archive a
-- SOLUCIONADO chat to hide it from the inbox without destroying its data.
ALTER TABLE "conversations" ADD COLUMN "archived_at" TIMESTAMPTZ;
ALTER TABLE "conversations" ADD COLUMN "archived_by_user_id" UUID;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_archived_by_user_id_fkey"
  FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Fast "hide archived" filtering on the list query.
CREATE INDEX "conversations_workspace_id_archived_at_idx"
  ON "conversations" ("workspace_id", "archived_at");
