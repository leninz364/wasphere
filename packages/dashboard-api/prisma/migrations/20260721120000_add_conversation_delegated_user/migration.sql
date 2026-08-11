-- Delegate (reserve) a conversation directly to a specific agent.
ALTER TABLE "conversations" ADD COLUMN "delegated_to_user_id" UUID;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_delegated_to_user_id_fkey"
  FOREIGN KEY ("delegated_to_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
