-- Move from a single overwritable rating to per-agent ratings whose average is
-- the customer's accumulated rating.

CREATE TABLE "contact_ratings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "contact_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "contact_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_ratings_contact_id_user_id_key" ON "contact_ratings"("contact_id", "user_id");
CREATE INDEX "contact_ratings_contact_id_idx" ON "contact_ratings"("contact_id");

ALTER TABLE "contact_ratings"
  ADD CONSTRAINT "contact_ratings_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_ratings"
  ADD CONSTRAINT "contact_ratings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Replace the single rating column with the denormalized average + count.
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "rating";
ALTER TABLE "contacts" ADD COLUMN "rating_avg" DOUBLE PRECISION;
ALTER TABLE "contacts" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;
