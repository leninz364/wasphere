import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isValidEvents, WILDCARD_EVENT } from '../lib/webhook-events';
import { deliverWebhook } from '../common/webhook-delivery';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { EncryptionService } from '../workspaces/encryption.service';

const PROD_URL_RE = /^https:\/\//i;
const IS_PROD = process.env.NODE_ENV === 'production';
const AUTO_DEACTIVATE_THRESHOLD = 50;

function generateSigningSecret(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  const signed = `${timestamp}.${rawBody}`;
  return `v1,sha256=${createHmac('sha256', secret).update(signed).digest('hex')}`;
}

function validateUrl(url: string): void {
  if (IS_PROD && !PROD_URL_RE.test(url)) {
    throw new BadRequestException('Webhook URL must use HTTPS in production');
  }
}

const LIST_SELECT = {
  id: true,
  apiKeyId: true,
  provider: true,
  name: true,
  url: true,
  events: true,
  isActive: true,
  pauseOnHumanTakeover: true,
  retryMax: true,
  failureCount: true,
  createdAt: true,
  lastDeliveredAt: true,
  lastFailedAt: true,
  bearerTokenIv: true,
  // signingSecret intentionally excluded from list
} as const;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private toPublicWebhook<T extends { bearerTokenIv: string | null }>(webhook: T) {
    const { bearerTokenIv, ...visible } = webhook;
    return { ...visible, hasBearerToken: bearerTokenIv !== null };
  }

  getDeliveryAuthHeaders(webhook: {
    bearerToken: string | null;
    bearerTokenIv: string | null;
  }): Record<string, string> {
    if (!webhook.bearerToken && !webhook.bearerTokenIv) return {};
    if (!webhook.bearerToken || !webhook.bearerTokenIv) {
      throw new Error('WEBHOOK_BEARER_TOKEN_INCOMPLETE');
    }
    const token = this.encryption.decrypt(webhook.bearerToken, webhook.bearerTokenIv);
    return { Authorization: `Bearer ${token}` };
  }

  private async requireMembership(userId: string, workspaceId: string): Promise<void> {
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!m) throw new ForbiddenException('Not a member of this workspace');
  }

  private async findOwned(workspaceId: string, webhookId: string) {
    const wh = await this.prisma.webhook.findFirst({
      where: { id: webhookId, workspaceId },
    });
    if (!wh) throw new NotFoundException('Webhook not found');
    return wh;
  }

  private async requireOwnedApiKey(workspaceId: string, apiKeyId?: string): Promise<void> {
    if (!apiKeyId) return;
    const key = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, workspaceId },
      select: { id: true },
    });
    if (!key) throw new BadRequestException('API key does not belong to this workspace');
  }

  async list(userId: string, workspaceId: string) {
    await this.requireMembership(userId, workspaceId);
    const webhooks = await this.prisma.webhook.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: LIST_SELECT,
    });
    return webhooks.map((webhook) => this.toPublicWebhook(webhook));
  }

  async create(userId: string, workspaceId: string, dto: CreateWebhookDto) {
    await this.requireMembership(userId, workspaceId);
    validateUrl(dto.url);
    await this.requireOwnedApiKey(workspaceId, dto.apiKeyId);

    if (!isValidEvents(dto.events)) {
      throw new BadRequestException(
        'Invalid events. Use known event types or ["*"] for all.',
      );
    }

    const signingSecret = generateSigningSecret();
    const bearerCredential = dto.bearerToken
      ? this.encryption.encrypt(dto.bearerToken)
      : null;

    const wh = await this.prisma.webhook.create({
      data: {
        workspaceId,
        apiKeyId: dto.apiKeyId,
        provider: dto.provider ?? 'generic',
        name: dto.name,
        url: dto.url,
        events: dto.events,
        signingSecret,
        bearerToken: bearerCredential?.ciphertext,
        bearerTokenIv: bearerCredential?.iv,
        isActive: dto.isActive ?? true,
        pauseOnHumanTakeover: dto.pauseOnHumanTakeover ?? true,
        retryMax: dto.retryMax ?? 3,
      },
      select: { ...LIST_SELECT, signingSecret: true },
    });

    await this.prisma.auditLog.create({
      data: { method: 'POST', endpoint: 'webhook.created' },
    });

    return this.toPublicWebhook(wh); // signingSecret shown once on creation
  }

  async update(userId: string, workspaceId: string, webhookId: string, dto: UpdateWebhookDto) {
    await this.requireMembership(userId, workspaceId);
    await this.findOwned(workspaceId, webhookId);
    await this.requireOwnedApiKey(workspaceId, dto.apiKeyId);

    if (dto.url) validateUrl(dto.url);
    if (dto.events !== undefined && !isValidEvents(dto.events)) {
      throw new BadRequestException(
        'Invalid events. Use known event types or ["*"] for all.',
      );
    }
    if (dto.bearerToken !== undefined && dto.clearBearerToken) {
      throw new BadRequestException(
        'bearerToken and clearBearerToken cannot be used together.',
      );
    }

    const bearerCredential = dto.bearerToken
      ? this.encryption.encrypt(dto.bearerToken)
      : null;

    const updated = await this.prisma.webhook.update({
      where: { id: webhookId },
      data: {
        ...(dto.apiKeyId !== undefined && { apiKeyId: dto.apiKeyId }),
        ...(dto.provider !== undefined && { provider: dto.provider }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.events !== undefined && { events: dto.events }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.pauseOnHumanTakeover !== undefined && {
          pauseOnHumanTakeover: dto.pauseOnHumanTakeover,
        }),
        ...(dto.retryMax !== undefined && { retryMax: dto.retryMax }),
        ...(bearerCredential && {
          bearerToken: bearerCredential.ciphertext,
          bearerTokenIv: bearerCredential.iv,
        }),
        ...(dto.clearBearerToken === true && {
          bearerToken: null,
          bearerTokenIv: null,
        }),
        // Re-activate clears the failure counter
        ...(dto.isActive === true && { failureCount: 0 }),
      },
      select: LIST_SELECT,
    });

    return this.toPublicWebhook(updated);
  }

  async remove(userId: string, workspaceId: string, webhookId: string) {
    await this.requireMembership(userId, workspaceId);
    await this.findOwned(workspaceId, webhookId);
    await this.prisma.webhook.delete({ where: { id: webhookId } });
    await this.prisma.auditLog.create({
      data: { method: 'DELETE', endpoint: 'webhook.deleted' },
    });
    return { success: true };
  }

  async testFire(userId: string, workspaceId: string, webhookId: string) {
    await this.requireMembership(userId, workspaceId);
    const wh = await this.findOwned(workspaceId, webhookId);

    const payload = {
      event: 'webhook.test' as const,
      workspaceId,
      webhookId: wh.id,
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test delivery from WaSphere.' },
    };

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = computeSignature(wh.signingSecret, timestamp, rawBody);

    // SSRF-guarded delivery. The returned error is always generic so the
    // test-fire response can never be used to probe the SSRF guard.
    const result = await deliverWebhook(wh.url, rawBody, {
      'X-WaSphere-Event': payload.event,
      'X-WaSphere-Signature': signature,
      'X-WaSphere-Timestamp': String(timestamp),
      ...this.getDeliveryAuthHeaders(wh),
    });
    const { statusCode, success, error } = result;

    await this.prisma.auditLog.create({
      data: { method: 'POST', endpoint: 'webhook.test_fire', statusCode: statusCode ?? undefined },
    });

    return { success, statusCode, error };
  }

  // Called by Phase D fanout — updates delivery tracking and auto-deactivates at threshold.
  async recordDelivery(webhookId: string, succeeded: boolean): Promise<void> {
    if (succeeded) {
      await this.prisma.webhook.update({
        where: { id: webhookId },
        data: { lastDeliveredAt: new Date(), failureCount: 0 },
      });
    } else {
      const wh = await this.prisma.webhook.update({
        where: { id: webhookId },
        data: { lastFailedAt: new Date(), failureCount: { increment: 1 } },
        select: { failureCount: true },
      });
      if (wh.failureCount >= AUTO_DEACTIVATE_THRESHOLD) {
        await this.prisma.webhook.update({
          where: { id: webhookId },
          data: { isActive: false },
        });
      }
    }
  }
}
