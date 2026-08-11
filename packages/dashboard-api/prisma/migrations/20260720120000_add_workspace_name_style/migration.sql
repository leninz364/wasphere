-- Style options (color / size / font) for the company name shown in the
-- sidebar when the workspace has no custom logo.
ALTER TABLE "workspaces" ADD COLUMN "name_style" JSONB;
