-- Store the WhatsApp LID (opaque privacy id) learned from inbound messages so
-- outbound sends addressed to "<id>@lid" resolve to the real contact.
ALTER TABLE "contacts" ADD COLUMN "lid" TEXT;

CREATE INDEX "contacts_workspace_id_lid_idx" ON "contacts"("workspace_id", "lid");
