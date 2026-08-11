-- Inbox bell: per-member cursor marking delegation notifications as seen.
ALTER TABLE "workspace_members" ADD COLUMN "notifications_seen_at" TIMESTAMPTZ;
