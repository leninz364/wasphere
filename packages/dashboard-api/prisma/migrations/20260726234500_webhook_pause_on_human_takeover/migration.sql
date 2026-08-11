-- Hold back message events while a human agent owns the chat, so an AI agent
-- on the receiving end stops replying over the person handling it.
ALTER TABLE "webhooks"
ADD COLUMN "pause_on_human_takeover" BOOLEAN NOT NULL DEFAULT true;
