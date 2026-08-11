import { createHmac, randomBytes } from 'crypto';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { InboxEventsService } from '../inbox/inbox-events.service';
import { eventMatchesFilter, WebhookEvent } from '../lib/webhook-events';
import { deliverWebhook } from '../common/webhook-delivery';
import { AuditEventDto } from './dto/audit-event.dto';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { mediaUrlFor } from '../media/media-token';

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000]; // delays before attempt 2, 3, 4

// Events that belong to one customer conversation, and so can be held back
// while a human agent owns that chat. Everything else (session lifecycle,
// webhook.test) is workspace-level and always goes out.
const CONVERSATION_SCOPED_EVENTS = new Set(['message.received', 'poll.vote']);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** The chat JID an inbound event came from, or null if the payload has none. */
function chatJidOf(dto: WebhookEventDto): string | null {
  const data = dto.data as Record<string, any> | undefined;
  if (!data) return null;
  const key = (data.message as Record<string, any> | undefined)?.key as
    | Record<string, any>
    | undefined;
  return (data.from ?? key?.remoteJid ?? null) as string | null;
}

/**
 * True for anything that is not a one-to-one chat: groups, broadcast lists,
 * channels and status updates.
 *
 * The inbox discards all of these (see InboxIngestService), so a group message
 * has no conversation, no contact and no attention state — there is nothing to
 * take over and nowhere for an operator to see what was said. Forwarding them
 * to an agent webhook let the bot answer inside the operator's own group chats,
 * invisibly. The fanout applies the same 1:1 rule the rest of the product does.
 */
function isNonDirectChat(dto: WebhookEventDto): boolean {
  const data = dto.data as Record<string, any> | undefined;
  if (data?.isGroup === true) return true;
  const jid = chatJidOf(dto);
  if (!jid) return false;
  return (
    jid.endsWith('@g.us') ||
    jid.endsWith('@broadcast') ||
    jid.endsWith('@newsletter') ||
    jid === 'status@broadcast'
  );
}

/**
 * Normalized phone number of whoever sent an inbound event, or null when the
 * event does not identify one.
 *
 * Mirrors the JID resolution in InboxIngestService so both land on the same
 * contact: WhatsApp may address the chat by an opaque `<id>@lid`, in which case
 * the real number arrives separately as senderJid/senderPn.
 */
function senderPhoneOf(dto: WebhookEventDto): string | null {
  const data = dto.data as Record<string, any> | undefined;
  const rawJid = chatJidOf(dto);
  if (!data || !rawJid) return null;
  const key = (data.message as Record<string, any> | undefined)?.key as
    | Record<string, any>
    | undefined;

  const senderPn: string | undefined = data.senderPn ?? key?.senderPn ?? undefined;
  const jid: string =
    data.senderJid ?? (rawJid.endsWith('@lid') && senderPn ? senderPn : rawJid);
  const phone = jid.split('@')[0].replace(/[^0-9]/g, '');
  return phone || null;
}

function sign(secret: string, timestamp: number, rawBody: string): string {
  const signed = `${timestamp}.${rawBody}`;
  return `v1,sha256=${createHmac('sha256', secret).update(signed).digest('hex')}`;
}

@Injectable()
export class InternalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      // Run once after migrations on every API start so a retention window that
      // elapsed while the service was stopped does not wait for the next cron.
      await this.applyChatRetentionPolicy();
    } catch (err) {
      // Retention maintenance must never prevent the API from starting.
      this.logger.error(
        `[ChatRetention] Startup retention run failed: ${String(err)}`,
      );
    }
  }

  async ingestAudit(dto: AuditEventDto): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        sessionId: dto.sessionId,
        actorTokenPrefix: dto.actorTokenPrefix,
        method: dto.method,
        endpoint: dto.endpoint,
        statusCode: dto.statusCode,
        requestHash: dto.requestHash,
        ipAddress: dto.ipAddress,
      },
    });
  }

  // Returns immediately — fanout runs in the background.
  // Design: workspaceId comes from the URL path, so wa-server code is unchanged;
  // each workspace's DASHBOARD_WEBHOOK_URL is configured to include its own UUID.
  fanoutWebhookEvent(workspaceId: string, dto: WebhookEventDto): void {
    this.runFanout(workspaceId, dto).catch((err: unknown) => {
      this.logger.error(
        `[Fanout] Unexpected top-level error for workspace ${workspaceId}: ${String(err)}`,
      );
    });
  }

  private async runFanout(workspaceId: string, dto: WebhookEventDto): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { workspaceId, isActive: true },
      select: {
        id: true,
        url: true,
        signingSecret: true,
        bearerToken: true,
        bearerTokenIv: true,
        retryMax: true,
        events: true,
        pauseOnHumanTakeover: true,
      },
    });

    const matching = webhooks.filter((wh) =>
      eventMatchesFilter(wh.events as (WebhookEvent | '*')[], dto.event as WebhookEvent),
    );

    if (matching.length === 0) return;

    // 1:1 only, matching the inbox. A group message has no conversation to take
    // over and no thread an operator can watch, so forwarding it would let the
    // bot answer inside the operator's own group chats with nobody seeing it.
    if (CONVERSATION_SCOPED_EVENTS.has(dto.event) && isNonDirectChat(dto)) {
      this.logger.debug(
        `[Fanout] skipped event=${dto.event} — group/broadcast chat, not a 1:1 conversation`,
      );
      return;
    }

    const humanIsHandling =
      matching.some((wh) => wh.pauseOnHumanTakeover) &&
      (await this.isHandledByHuman(workspaceId, dto));

    const deliverable = humanIsHandling
      ? matching.filter((wh) => !wh.pauseOnHumanTakeover)
      : matching;

    if (deliverable.length < matching.length) {
      this.logger.log(
        `[Fanout] paused ${matching.length - deliverable.length} webhook(s) for event=${dto.event} — a human agent owns this chat`,
      );
    }

    if (deliverable.length === 0) return;

    await Promise.allSettled(
      deliverable.map((wh) => this.deliverWithRetry(workspaceId, wh, dto, 1)),
    );
  }

  /**
   * True when a human agent owns this conversation and the AI bot should stay
   * quiet. Two ways that happens:
   *
   *  - attention EN_PROCESO — an agent opened the chat and is answering it.
   *  - delegatedToUserId set — the chat is reserved for a named agent. It stays
   *    PENDIENTE on purpose (so it keeps showing in that agent's queue), but it
   *    has already been handed to a person, so the bot must not answer ahead of
   *    them. Group delegation is not included: that returns the chat to the
   *    pool for a department, and nobody has picked it up yet.
   *
   * ATENDIDO and SOLUCIONADO deliberately do not count. Those are chats an agent
   * closed, and an inbound message reopens them straight back to PENDIENTE — the
   * inbox ingest does that in parallel with this fanout, so treating them as
   * "handled" would silence the bot on a chat that is, by the time anyone looks,
   * pending again. A conversation that does not exist yet is a brand-new chat:
   * pending by definition, so the bot answers.
   */
  private async isHandledByHuman(
    workspaceId: string,
    dto: WebhookEventDto,
  ): Promise<boolean> {
    if (!CONVERSATION_SCOPED_EVENTS.has(dto.event)) return false;

    const phone = senderPhoneOf(dto);
    if (!phone) return false;

    const convo = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        sessionId: dto.sessionId,
        contact: { phone },
      },
      select: { attention: true, delegatedToUserId: true },
    });
    if (!convo) return false;

    return convo.attention === 'EN_PROCESO' || convo.delegatedToUserId !== null;
  }

  /**
   * Replace any inline base64 media with a fetchable download URL so consumers
   * (n8n etc.) get a small payload + a link, not a multi-MB blob. No-op when
   * MEDIA_BASE_URL is unset (keeps the inline data URI for backward compat).
   */
  private toDeliverableData(dto: WebhookEventDto): unknown {
    const data = dto.data as Record<string, any> | undefined;
    const content = data?.content as Record<string, any> | undefined;
    if (!data || !content?.dataUri || typeof data.messageId !== 'string') return dto.data;
    const url = mediaUrlFor(data.messageId);
    if (!url) return dto.data;
    const { dataUri, ...restContent } = content;
    void dataUri;
    return { ...data, content: { ...restContent, mediaUrl: url } };
  }

  private async deliverWithRetry(
    workspaceId: string,
    wh: {
      id: string;
      url: string;
      signingSecret: string;
      bearerToken: string | null;
      bearerTokenIv: string | null;
      retryMax: number;
    },
    dto: WebhookEventDto,
    attempt: number,
  ): Promise<void> {
    if (attempt > 1) {
      await sleep(RETRY_DELAYS_MS[attempt - 2] ?? 30_000);
    }

    const deliveryId = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const deliveryPayload = {
      event: dto.event,
      sessionId: dto.sessionId,
      timestamp: dto.timestamp,
      deliveryId,
      data: this.toDeliverableData(dto),
    };
    const rawBody = JSON.stringify(deliveryPayload);
    const signature = sign(wh.signingSecret, timestamp, rawBody);
    const start = Date.now();
    let authHeaders: Record<string, string>;
    try {
      authHeaders = this.webhooks.getDeliveryAuthHeaders(wh);
    } catch {
      this.logger.error(
        `[Fanout] webhook=${wh.id} has an unreadable Bearer credential; delivery refused`,
      );
      await this.webhooks.recordDelivery(wh.id, false);
      return;
    }

    // SSRF-guarded delivery — a user-controlled URL can never reach internal
    // services or cloud metadata (DNS pinning + private-IP denylist + manual
    // redirect handling live inside deliverWebhook → safeFetch).
    const result = await deliverWebhook(wh.url, rawBody, {
      'X-WaSphere-Event': dto.event,
      'X-WaSphere-Signature': signature,
      'X-WaSphere-Timestamp': String(timestamp),
      'X-WaSphere-Delivery-Id': deliveryId,
      ...authHeaders,
    });
    const statusCode = result.statusCode;
    const succeeded = result.success;

    if (result.blocked) {
      this.logger.warn(
        `[Fanout] webhook=${wh.id} attempt=${attempt} blocked: destination not allowed (SSRF guard) url=${wh.url}`,
      );
    } else if (!succeeded && result.error) {
      this.logger.warn(
        `[Fanout] webhook=${wh.id} attempt=${attempt} ${result.error}`,
      );
    }

    const latencyMs = Date.now() - start;

    if (succeeded) {
      this.logger.log(
        `[Fanout] webhook.delivered id=${wh.id} event=${dto.event} status=${statusCode} latency=${latencyMs}ms`,
      );
      await this.webhooks.recordDelivery(wh.id, true);
      return;
    }

    // Retry if attempts remain
    if (attempt < wh.retryMax) {
      return this.deliverWithRetry(workspaceId, wh, dto, attempt + 1);
    }

    // Retries exhausted
    this.logger.warn(
      `[Fanout] webhook.failed id=${wh.id} event=${dto.event} status=${statusCode ?? 'timeout'} attempt=${attempt}`,
    );
    await this.webhooks.recordDelivery(wh.id, false);
  }

  @Cron('0 2 * * *', { timeZone: 'UTC' })
  async purgeOldAuditLogs(): Promise<void> {
    const retentionDays = parseInt(
      process.env.AUDIT_RETENTION_DAYS ?? '90',
      10,
    );
    if (isNaN(retentionDays) || retentionDays < 1) {
      this.logger.warn('[AuditPurge] Invalid AUDIT_RETENTION_DAYS — skipping purge');
      return;
    }
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const result = await this.prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    this.logger.log(
      `[AuditPurge] Deleted ${result.count} audit log rows older than ${retentionDays} days`,
    );
  }

  /**
   * Apply per-workspace chat retention policies:
   *  - RESOLVED/SOLUCIONADO chats older than `chatRetentionResolvedDays` are
   *    soft-archived (archivedAt set, archivedByUserId null).
   *  - Archived chats older than `chatRetentionArchivedDays` are permanently
   *    deleted, including their messages and events (DB cascade).
   *
   * Runs at 03:00 UTC to avoid overlapping with the audit log purge.
   */
  @Cron('0 3 * * *', { timeZone: 'UTC' })
  async applyChatRetentionPolicy(): Promise<void> {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        OR: [
          { chatRetentionResolvedDays: { gt: 0 } },
          { chatRetentionArchivedDays: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        chatRetentionResolvedDays: true,
        chatRetentionArchivedDays: true,
      },
    });

    if (workspaces.length === 0) return;

    this.logger.log(
      `[ChatRetention] Running retention policy for ${workspaces.length} workspace(s)`,
    );

    for (const ws of workspaces) {
      try {
        await this.archiveResolvedChats(ws.id, ws.chatRetentionResolvedDays);
        await this.deleteArchivedChats(ws.id, ws.chatRetentionArchivedDays);
      } catch (err) {
        this.logger.error(
          `[ChatRetention] Workspace ${ws.id} retention run failed: ${String(err)}`,
        );
      }
    }
  }

  private async archiveResolvedChats(
    workspaceId: string,
    days: number | null,
  ): Promise<void> {
    if (!days || days <= 0) return;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.conversation.findMany({
      where: {
        workspaceId,
        status: 'RESOLVED',
        attention: 'SOLUCIONADO',
        archivedAt: null,
        // A solved chat remains visible for `days` after its latest update.
        // Any later change to the conversation restarts the retention window.
        updatedAt: { lt: cutoff },
      },
      select: { id: true, sessionId: true },
    });

    if (candidates.length === 0) return;

    const ids = candidates.map((c) => c.id);
    const now = new Date();

    const [updateResult] = await this.prisma.$transaction([
      this.prisma.conversation.updateMany({
        where: { id: { in: ids } },
        data: { archivedAt: now, archivedByUserId: null },
      }),
      this.prisma.conversationEvent.createMany({
        data: ids.map((conversationId) => ({
          workspaceId,
          conversationId,
          actorUserId: null, // system
          type: 'archived',
          detail: { reason: 'retention', retentionDays: days },
        })),
      }),
    ]);

    this.logger.log(
      `[ChatRetention] Archived ${updateResult.count} resolved chat(s) in workspace ${workspaceId} (>${days} days)`,
    );

    for (const convo of candidates) {
      this.inboxEvents.emit({
        type: 'conversation.update',
        workspaceId,
        conversationId: convo.id,
      });
      // Audit trail: mirror the manual archive path.
      await this.prisma.auditLog.create({
        data: {
          sessionId: convo.sessionId,
          method: 'CRON',
          endpoint: '/internal/chat-retention/archive',
          statusCode: 200,
        },
      });
    }
  }

  private async deleteArchivedChats(
    workspaceId: string,
    days: number | null,
  ): Promise<void> {
    if (!days || days <= 0) return;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.prisma.conversation.deleteMany({
      where: {
        workspaceId,
        archivedAt: { lt: cutoff },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `[ChatRetention] Deleted ${result.count} archived chat(s) in workspace ${workspaceId} (>${days} days)`,
      );
    }
  }
}
