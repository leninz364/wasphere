-- Delegate a conversation to an agent group / department / location.
ALTER TABLE "conversations" ADD COLUMN "delegated_group_id" UUID;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_delegated_group_id_fkey"
  FOREIGN KEY ("delegated_group_id") REFERENCES "agent_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
