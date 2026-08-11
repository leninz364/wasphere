-- DropIndex
DROP INDEX "contacts_tags_idx";

-- DropIndex
DROP INDEX "conversations_workspace_id_archived_at_idx";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "resolved_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "custom_roles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "chat_retention_archived_days" INTEGER,
ADD COLUMN     "chat_retention_resolved_days" INTEGER;
