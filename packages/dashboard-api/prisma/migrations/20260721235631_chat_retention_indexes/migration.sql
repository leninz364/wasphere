-- CreateIndex
CREATE INDEX "conversations_workspace_id_status_resolved_at_idx" ON "conversations"("workspace_id", "status", "resolved_at");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_archived_at_idx" ON "conversations"("workspace_id", "archived_at");
