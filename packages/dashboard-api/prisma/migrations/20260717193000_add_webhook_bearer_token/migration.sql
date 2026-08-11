ALTER TABLE "webhooks"
ADD COLUMN "bearer_token" TEXT,
ADD COLUMN "bearer_token_iv" TEXT;
