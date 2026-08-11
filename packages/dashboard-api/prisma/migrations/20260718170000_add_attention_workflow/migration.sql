-- Agent attention workflow: assignment (bot-first), attention status,
-- per-conversation event trail ("Atención realizada") and per-agent
-- message attribution for the daily-work report.

CREATE TYPE "AttentionStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'ATENDIDO', 'SOLUCIONADO');

ALTER TABLE "conversations"
  ADD COLUMN "assigned_to_user_id" UUID,
  ADD COLUMN "assigned_at" TIMESTAMPTZ,
  ADD COLUMN "attention" "AttentionStatus" NOT NULL DEFAULT 'PENDIENTE';

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD COLUMN "sent_by_user_id" UUID;

CREATE TABLE "conversation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "type" TEXT NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversation_events_conversation_id_created_at_idx"
  ON "conversation_events"("conversation_id", "created_at" DESC);
CREATE INDEX "conversation_events_workspace_id_created_at_idx"
  ON "conversation_events"("workspace_id", "created_at");

ALTER TABLE "conversation_events"
  ADD CONSTRAINT "conversation_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_events"
  ADD CONSTRAINT "conversation_events_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_events"
  ADD CONSTRAINT "conversation_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
