-- Agent profile fields (nombre, apellido, cédula, cargo) + agent groups.

ALTER TABLE "users"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "cedula" TEXT,
  ADD COLUMN "cargo" TEXT;

CREATE TABLE "agent_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "agent_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_groups_workspace_id_name_key" ON "agent_groups"("workspace_id", "name");

ALTER TABLE "agent_groups"
  ADD CONSTRAINT "agent_groups_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_group_members" (
  "group_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_group_members_pkey" PRIMARY KEY ("group_id", "user_id")
);

ALTER TABLE "agent_group_members"
  ADD CONSTRAINT "agent_group_members_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "agent_groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_group_members"
  ADD CONSTRAINT "agent_group_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
