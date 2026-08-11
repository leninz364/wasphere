import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { InboxEventsService } from './inbox-events.service';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { PatchConversationDto } from './dto/patch-conversation.dto';
import { SendReplyDto } from './dto/send-reply.dto';

// List/preview labels for outbound non-text replies (no body text to show).
const OUTBOUND_PREVIEW: Record<string, string> = {
  image: '📷 Photo',
  document: '📄 Document',
  poll: '📊 Poll',
};

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// "Nombre Apellido" when the profile is filled in; null otherwise.
function fullName(u: { firstName?: string | null; lastName?: string | null }): string | null {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly events: InboxEventsService,
  ) {}

  // ── access control ────────────────────────────────────────────────────────

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('Not a member of this workspace');
    return membership.role;
  }

  // A chat being actively handled (EN_PROCESO) or already marked ATENDIDO is
  // exclusive to the agent who owns it: other MEMBER agents get read-only access
  // and cannot write, change its state, or reopen it. OWNER/ADMIN keep an escape
  // valve — they can reanudar (reopen/reassign) a locked chat so it never gets
  // stuck if its agent goes offline. It also returns to the pool when the agent
  // delegates it to a group (→ PENDIENTE) or the customer writes again (ingest).
  private isLockedForUser(
    convo: { attention: string; assignedToUserId: string | null; delegatedToUserId?: string | null },
    userId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER',
  ): boolean {
    // OWNER/ADMIN always keep the reanudar (reopen/reassign) escape valve.
    if (role !== 'MEMBER') return false;
    // Reserved (delegated) to another agent — exclusive to them, even while it
    // is still PENDIENTE. Only the target agent may act on it.
    if (convo.delegatedToUserId && convo.delegatedToUserId !== userId) return true;
    // A chat being actively handled or already closed belongs to its agent.
    return (
      (convo.attention === 'EN_PROCESO' || convo.attention === 'ATENDIDO') &&
      !!convo.assignedToUserId &&
      convo.assignedToUserId !== userId
    );
  }

  // Loads a conversation and guarantees it belongs to the workspace (no IDOR).
  private async loadConversation(workspaceId: string, conversationId: string) {
    const convo = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        contact: true,
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        delegatedGroup: { select: { id: true, name: true } },
        delegatedToUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    return convo;
  }

  private assertSessionScope(sessionId: string, sessionScope: string | null): void {
    if (sessionScope && sessionId !== sessionScope) {
      throw new ForbiddenException('API key is scoped to a different session');
    }
  }

  private async writeAudit(sessionId: string | null, method: string, endpoint: string): Promise<void> {
    await this.prisma.auditLog.create({
      data: { sessionId: sessionId ?? undefined, method, endpoint, statusCode: 200 },
    });
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  async listConversations(
    userId: string,
    workspaceId: string,
    q: ListConversationsQueryDto,
    sessionScope: string | null = null,
  ) {
    await this.assertMember(workspaceId, userId);
    if (sessionScope && q.sessionId && q.sessionId !== sessionScope) {
      throw new ForbiddenException('API key is scoped to a different session');
    }
    const take = q.limit ?? 30;

    const where: Prisma.ConversationWhereInput = { workspaceId };
    // Archived (soft-deleted) chats are hidden from the inbox by default; the
    // dedicated `archived=true` view lists them so an admin can restore them.
    where.archivedAt = q.archived ? { not: null } : null;
    if (q.status) where.status = q.status;
    if (sessionScope || q.sessionId) where.sessionId = sessionScope ?? q.sessionId;
    if (q.q) {
      const term = q.q.trim();
      const digits = term.replace(/[^0-9]/g, '');
      where.OR = [
        { lastPreview: { contains: term, mode: 'insensitive' } },
        { contact: { is: { whatsappName: { contains: term, mode: 'insensitive' } } } },
        { contact: { is: { savedName: { contains: term, mode: 'insensitive' } } } },
        // only match on phone when the query actually has digits — otherwise
        // `contains: ""` matches every row and the search returns everything.
        ...(digits ? [{ contact: { is: { phone: { contains: digits } } } } as const] : []),
      ];
    }

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        contact: true,
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        delegatedGroup: { select: { id: true, name: true } },
        delegatedToUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items: items.map((c) => this.toConversationView(c)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async getConversation(
    userId: string,
    workspaceId: string,
    conversationId: string,
    sessionScope: string | null = null,
  ) {
    await this.assertMember(workspaceId, userId);
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);
    return this.toConversationView(convo);
  }

  async listMessages(
    userId: string,
    workspaceId: string,
    conversationId: string,
    q: ListMessagesQueryDto,
    sessionScope: string | null = null,
  ) {
    await this.assertMember(workspaceId, userId);
    const convo = await this.loadConversation(workspaceId, conversationId); // 404 + IDOR guard
    this.assertSessionScope(convo.sessionId, sessionScope);
    const take = q.limit ?? 50;

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ waTimestamp: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  // ── writes ────────────────────────────────────────────────────────────────

  async patchConversation(
    userId: string,
    workspaceId: string,
    conversationId: string,
    dto: PatchConversationDto,
    sessionScope: string | null = null,
  ) {
    const role = await this.assertMember(workspaceId, userId);
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);

    // EN_PROCESO/ATENDIDO chats belong to their agent — other MEMBER agents are
    // read-only. OWNER/ADMIN keep the reanudar (reopen/reassign) escape valve.
    if (this.isLockedForUser(convo, userId, role)) {
      throw new ForbiddenException(
        'Chat a cargo de otro agente — solo lectura hasta que vuelva a Pendiente.',
      );
    }

    // A SOLUCIONADO chat is locked for regular agents — no manual reopening
    // (neither attention changes nor re-opening the status). For them the only
    // way back is a fresh message from the customer, which auto-reopens the
    // cycle in the inbox ingest (attention → PENDIENTE, back to the AI bot).
    // OWNER/ADMIN may reanudar it manually (escape valve).
    const reopensSolved =
      convo.attention === 'SOLUCIONADO' &&
      ((dto.attention !== undefined && dto.attention !== 'SOLUCIONADO') ||
        (dto.status !== undefined && dto.status !== 'RESOLVED') ||
        dto.delegatedGroupId !== undefined ||
        dto.delegatedToUserId !== undefined);
    if (reopensSolved && role === 'MEMBER') {
      throw new ForbiddenException(
        'Chat solucionado: no se puede reabrir manualmente. Se reabrirá automáticamente cuando el cliente escriba de nuevo.',
      );
    }

    const data: Prisma.ConversationUpdateInput = {};
    const trail: Prisma.ConversationEventCreateManyInput[] = [];
    if (dto.status && dto.status !== convo.status) {
      data.status = dto.status;
      trail.push({
        workspaceId,
        conversationId: convo.id,
        actorUserId: userId,
        type: 'status_changed',
        detail: { from: convo.status, to: dto.status },
      });
    }
    if (dto.attention && dto.attention !== convo.attention) {
      data.attention = dto.attention;
      // SOLUCIONADO closes the thread; leaving it reopens a resolved thread.
      if (dto.attention === 'SOLUCIONADO') {
        data.status = 'RESOLVED';
        data.resolvedAt = new Date();
      } else if (!dto.status && convo.status === 'RESOLVED') {
        data.status = 'OPEN';
        data.resolvedAt = null;
      }
      // Back to PENDIENTE releases the chat: it returns to the pool so any
      // agent can take it over again (the "liberar" escape valve).
      if (dto.attention === 'PENDIENTE' && convo.assignedToUserId) {
        data.assignedTo = { disconnect: true };
        data.assignedAt = null;
      }
      // Closing states credit (and lock onto) the agent who set them.
      if (
        (dto.attention === 'ATENDIDO' || dto.attention === 'SOLUCIONADO') &&
        convo.assignedToUserId !== userId
      ) {
        data.assignedTo = { connect: { id: userId } };
        data.assignedAt = new Date();
      }
      trail.push({
        workspaceId,
        conversationId: convo.id,
        actorUserId: userId,
        type: 'attention_changed',
        detail: { from: convo.attention, to: dto.attention },
      });
    }
    // Delegation to an agent group / department / location.
    let notifyGroup: { id: string; name: string } | null = null;
    if (dto.delegatedGroupId !== undefined && dto.delegatedGroupId !== convo.delegatedGroupId) {
      if (dto.delegatedGroupId === null) {
        data.delegatedGroup = { disconnect: true };
        trail.push({
          workspaceId,
          conversationId: convo.id,
          actorUserId: userId,
          type: 'delegated',
          detail: { toGroupId: null, toGroupName: null },
        });
      } else {
        const group = await this.prisma.agentGroup.findFirst({
          where: { id: dto.delegatedGroupId, workspaceId },
          select: { id: true, name: true },
        });
        if (!group) throw new BadRequestException('Unknown group');
        data.delegatedGroup = { connect: { id: group.id } };
        notifyGroup = group;
        trail.push({
          workspaceId,
          conversationId: convo.id,
          actorUserId: userId,
          type: 'delegated',
          detail: { toGroupId: group.id, toGroupName: group.name },
        });
        // Delegating to a group hands the chat off: it returns to the pool as
        // PENDIENTE and unassigned, so any agent in that group can take it over.
        if (convo.attention !== 'PENDIENTE') {
          data.attention = 'PENDIENTE';
          if (convo.status === 'RESOLVED') data.status = 'OPEN';
          trail.push({
            workspaceId,
            conversationId: convo.id,
            actorUserId: userId,
            type: 'attention_changed',
            detail: { from: convo.attention, to: 'PENDIENTE', reason: 'delegated' },
          });
        }
        if (convo.assignedToUserId) {
          data.assignedTo = { disconnect: true };
          data.assignedAt = null;
        }
      }
    }
    // Delegation (reservation) directly to a specific agent, with an optional
    // note. The chat goes to PENDIENTE but stays exclusive to the target agent.
    let notifyUser: { id: string; name: string; note: string | null } | null = null;
    const note = dto.delegationNote?.trim() || null;
    if (dto.delegatedToUserId !== undefined && dto.delegatedToUserId !== convo.delegatedToUserId) {
      if (dto.delegatedToUserId === null) {
        data.delegatedToUser = { disconnect: true };
        trail.push({
          workspaceId,
          conversationId: convo.id,
          actorUserId: userId,
          type: 'delegated',
          detail: { toUserId: null, toUserName: null },
        });
      } else {
        const target = await this.prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: dto.delegatedToUserId } },
          select: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        });
        if (!target) throw new BadRequestException('El agente destino no pertenece a este espacio');
        const targetName = fullName(target.user) ?? target.user.email;
        data.delegatedToUser = { connect: { id: target.user.id } };
        notifyUser = { id: target.user.id, name: targetName, note };
        trail.push({
          workspaceId,
          conversationId: convo.id,
          actorUserId: userId,
          type: 'delegated',
          detail: { toUserId: target.user.id, toUserName: targetName, note },
        });
        // Reserving to an agent hands the chat off: it goes back to PENDIENTE and
        // unassigned, so only the target agent (or OWNER/ADMIN) can take it over.
        if (convo.attention !== 'PENDIENTE') {
          data.attention = 'PENDIENTE';
          if (convo.status === 'RESOLVED') data.status = 'OPEN';
          trail.push({
            workspaceId,
            conversationId: convo.id,
            actorUserId: userId,
            type: 'attention_changed',
            detail: { from: convo.attention, to: 'PENDIENTE', reason: 'delegated' },
          });
        }
        if (convo.assignedToUserId) {
          data.assignedTo = { disconnect: true };
          data.assignedAt = null;
        }
      }
    }
    if (dto.tags) data.tags = dto.tags as Prisma.InputJsonValue;
    if (dto.notes !== undefined) {
      const existing = (convo.metadata as Record<string, unknown> | null) ?? {};
      data.metadata = { ...existing, notes: dto.notes } as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.conversation.update({
      where: { id: convo.id },
      data,
      include: {
        contact: true,
        assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
        delegatedGroup: { select: { id: true, name: true } },
        delegatedToUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    if (trail.length > 0) {
      await this.prisma.conversationEvent.createMany({ data: trail });
    }
    await this.writeAudit(convo.sessionId, 'PATCH', `/inbox/conversations/${conversationId}`);
    this.events.emit({ type: 'conversation.update', workspaceId, conversationId });

    // Notify the members of the group the chat was delegated to (bell + SSE).
    if (notifyGroup) {
      const [members, actor] = await Promise.all([
        this.prisma.agentGroupMember.findMany({
          where: { groupId: notifyGroup.id },
          select: { userId: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true, lastName: true },
        }),
      ]);
      // The delegating agent doesn't need a bell for their own action.
      const recipients = members.map((m) => m.userId).filter((id) => id !== userId);
      if (recipients.length > 0) {
        this.events.emit({
          type: 'delegation',
          workspaceId,
          conversationId: convo.id,
          recipientUserIds: recipients,
          payload: {
            groupId: notifyGroup.id,
            groupName: notifyGroup.name,
            actorName: actor ? fullName(actor) ?? actor.email : 'Un agente',
            contactName:
              convo.contact.savedName ?? convo.contact.whatsappName ?? convo.contact.phone,
            at: new Date().toISOString(),
          },
        });
      }
    }

    // Notify the single agent a chat was reserved to (bell + SSE), unless the
    // delegating agent reserved it to themselves.
    if (notifyUser && notifyUser.id !== userId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      });
      this.events.emit({
        type: 'delegation',
        workspaceId,
        conversationId: convo.id,
        recipientUserIds: [notifyUser.id],
        payload: {
          toUserId: notifyUser.id,
          toUserName: notifyUser.name,
          note: notifyUser.note,
          actorName: actor ? fullName(actor) ?? actor.email : 'Un agente',
          contactName:
            convo.contact.savedName ?? convo.contact.whatsappName ?? convo.contact.phone,
          at: new Date().toISOString(),
        },
      });
    }
    return this.toConversationView(updated);
  }

  // ── archive (soft-delete) ──────────────────────────────────────────────────

  /**
   * Archive (hide) a chat. Reserved to OWNER/ADMIN and only allowed once the
   * chat is SOLUCIONADO — active chats can't be hidden by accident. The data is
   * preserved; the chat leaves the inbox and resurfaces if the customer writes
   * again (inbox-ingest clears archivedAt).
   */
  async archiveConversation(
    userId: string,
    workspaceId: string,
    conversationId: string,
    sessionScope: string | null = null,
  ) {
    const role = await this.assertMember(workspaceId, userId);
    if (role === 'MEMBER') {
      throw new ForbiddenException('Solo un administrador puede archivar chats.');
    }
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);
    if (convo.archivedAt) return { ok: true, archived: true };
    if (convo.attention !== 'SOLUCIONADO') {
      throw new BadRequestException('Solo se puede archivar un chat marcado como Solucionado.');
    }
    await this.prisma.conversation.update({
      where: { id: convo.id },
      data: { archivedAt: new Date(), archivedByUserId: userId },
    });
    await this.prisma.conversationEvent.create({
      data: { workspaceId, conversationId: convo.id, actorUserId: userId, type: 'archived', detail: {} },
    });
    await this.writeAudit(convo.sessionId, 'POST', `/inbox/conversations/${conversationId}/archive`);
    this.events.emit({ type: 'conversation.update', workspaceId, conversationId });
    return { ok: true, archived: true };
  }

  /** Restore an archived chat back into the inbox (OWNER/ADMIN only). */
  async unarchiveConversation(
    userId: string,
    workspaceId: string,
    conversationId: string,
    sessionScope: string | null = null,
  ) {
    const role = await this.assertMember(workspaceId, userId);
    if (role === 'MEMBER') {
      throw new ForbiddenException('Solo un administrador puede restaurar chats.');
    }
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);
    if (!convo.archivedAt) return { ok: true, archived: false };
    await this.prisma.conversation.update({
      where: { id: convo.id },
      data: { archivedAt: null, archivedByUserId: null },
    });
    await this.prisma.conversationEvent.create({
      data: { workspaceId, conversationId: convo.id, actorUserId: userId, type: 'unarchived', detail: {} },
    });
    await this.writeAudit(convo.sessionId, 'POST', `/inbox/conversations/${conversationId}/unarchive`);
    this.events.emit({ type: 'conversation.update', workspaceId, conversationId });
    return { ok: true, archived: false };
  }

  // ── delegation notifications (inbox bell) ─────────────────────────────────

  /**
   * Notifications for the bell: `delegated` events targeting a group the user
   * belongs to, newest first. `seen` is derived from the per-member cursor
   * (workspace_members.notifications_seen_at).
   */
  async listNotifications(userId: string, workspaceId: string) {
    await this.assertMember(workspaceId, userId);
    const [member, groupRows] = await Promise.all([
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { notificationsSeenAt: true },
      }),
      this.prisma.agentGroupMember.findMany({
        where: { userId, group: { workspaceId } },
        select: { groupId: true },
      }),
    ]);
    const myGroups = new Set(groupRows.map((g) => g.groupId));

    const rows = await this.prisma.conversationEvent.findMany({
      where: { workspaceId, type: 'delegated' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        conversation: {
          select: {
            id: true,
            contact: { select: { savedName: true, whatsappName: true, phone: true } },
          },
        },
      },
    });

    const seenAt = member?.notificationsSeenAt ?? null;
    const items = rows
      .filter((e) => {
        if (e.actorUserId === userId) return false; // not my own action
        const d = (e.detail as { toGroupId?: string | null; toUserId?: string | null } | null) ?? {};
        // delegations into one of my groups, or reserved directly to me
        return (!!d.toGroupId && myGroups.has(d.toGroupId)) || d.toUserId === userId;
      })
      .slice(0, 30)
      .map((e) => {
        const d = (e.detail as { toGroupId?: string; toGroupName?: string; toUserName?: string; note?: string | null }) ?? {};
        const c = e.conversation.contact;
        return {
          id: e.id,
          conversationId: e.conversation.id,
          contactName: c.savedName ?? c.whatsappName ?? c.phone,
          groupId: d.toGroupId ?? null,
          // For a direct reservation, surface the target agent's name in the same
          // slot the bell already renders so no UI change is needed.
          groupName: d.toGroupName ?? d.toUserName ?? null,
          note: d.note ?? null,
          actor: e.actor
            ? { id: e.actor.id, email: e.actor.email, name: fullName(e.actor) }
            : null,
          createdAt: e.createdAt,
          seen: seenAt ? e.createdAt <= seenAt : false,
        };
      });

    return { items, unseenCount: items.filter((i) => !i.seen).length };
  }

  /**
   * Lightweight list of the workspace's agents for the "delegate to an agent"
   * picker. Available to any member (unlike team/members which is manager-only).
   * Excludes the caller — you don't delegate a chat to yourself.
   */
  async listDelegatableAgents(userId: string, workspaceId: string) {
    await this.assertMember(workspaceId, userId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { not: userId } },
      select: {
        role: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({
      id: m.user.id,
      name: fullName(m.user) ?? m.user.email,
      email: m.user.email,
      role: m.role,
    }));
  }

  /** Marks every delegation notification as seen (bell dropdown opened). */
  async markNotificationsSeen(userId: string, workspaceId: string) {
    await this.assertMember(workspaceId, userId);
    await this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { notificationsSeenAt: new Date() },
    });
    return { ok: true };
  }

  async markRead(
    userId: string,
    workspaceId: string,
    conversationId: string,
    sessionScope: string | null = null,
    viaApiKey = false,
  ) {
    const role = await this.assertMember(workspaceId, userId);
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);

    const data: Prisma.ConversationUpdateInput = {};
    if (convo.unreadCount !== 0) data.unreadCount = 0;

    // A chat reserved (delegated) to another agent can't be claimed by other
    // MEMBER agents — only the target agent (or OWNER/ADMIN) may take it over.
    const reservedForOther =
      !!convo.delegatedToUserId && convo.delegatedToUserId !== userId && role === 'MEMBER';

    // Auto-takeover: the human agent who opens a PENDIENTE chat becomes
    // responsible for it (attention -> EN_PROCESO). Once a chat is EN_PROCESO
    // it is exclusive to its agent — other agents open it read-only and can NOT
    // steal it; it only returns to the pool when it goes back to PENDIENTE.
    // ATENDIDO/SOLUCIONADO also lock the assignment. API-key reads never claim.
    const takeover =
      !viaApiKey &&
      !reservedForOther &&
      convo.assignedToUserId !== userId &&
      (convo.attention === 'PENDIENTE' ||
        // orphaned EN_PROCESO (agent removed from the workspace) is claimable
        (convo.attention === 'EN_PROCESO' && !convo.assignedToUserId));
    if (takeover) {
      data.assignedTo = { connect: { id: userId } };
      data.assignedAt = new Date();
      if (convo.attention === 'PENDIENTE') data.attention = 'EN_PROCESO';
      // The reservation is fulfilled once the agent picks the chat up.
      if (convo.delegatedToUserId) data.delegatedToUser = { disconnect: true };
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.conversation.update({ where: { id: convo.id }, data });
      if (takeover) {
        await this.prisma.conversationEvent.create({
          data: {
            workspaceId,
            conversationId: convo.id,
            actorUserId: userId,
            type: 'assigned',
            // fromUserId null = the AI bot had it
            detail: { fromUserId: convo.assignedToUserId },
          },
        });
      }
      this.events.emit({ type: 'conversation.update', workspaceId, conversationId });
    }
    return { ok: true, unreadCount: 0 };
  }

  /** "Atención realizada" — the attention audit trail of one conversation. */
  async listEvents(
    userId: string,
    workspaceId: string,
    conversationId: string,
    sessionScope: string | null = null,
  ) {
    await this.assertMember(workspaceId, userId);
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);
    const rows = await this.prisma.conversationEvent.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    return {
      items: rows.map((e) => ({
        id: e.id,
        type: e.type,
        detail: e.detail,
        createdAt: e.createdAt,
        // null = AI bot / system
        actor: e.actor ? { id: e.actor.id, email: e.actor.email, name: fullName(e.actor) } : null,
      })),
    };
  }

  /**
   * Per-agent daily-work report: takeovers, chats marked atendido/solucionado/
   * pendiente and messages sent, within [from, to). The UI passes the local-day
   * boundaries; defaults to the current UTC day.
   */
  async agentWork(userId: string, workspaceId: string, fromIso?: string, toIso?: string) {
    await this.assertMember(workspaceId, userId);
    const from = fromIso && !isNaN(Date.parse(fromIso)) ? new Date(fromIso) : startOfUtcDay();
    const to = toIso && !isNaN(Date.parse(toIso)) ? new Date(toIso) : new Date(from.getTime() + 86_400_000);

    const [events, sentCounts, replyMessages, members] = await Promise.all([
      this.prisma.conversationEvent.findMany({
        where: { workspaceId, createdAt: { gte: from, lt: to } },
        select: { actorUserId: true, type: true, detail: true, conversationId: true },
      }),
      this.prisma.message.groupBy({
        by: ['sentByUserId'],
        where: { workspaceId, sentByUserId: { not: null }, createdAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      // Ordered stream for response-time: an agent's outbound reply paired with
      // the customer's preceding still-unanswered inbound, per conversation.
      this.prisma.message.findMany({
        where: { workspaceId, waTimestamp: { gte: from, lt: to } },
        select: { conversationId: true, direction: true, waTimestamp: true, sentByUserId: true },
        orderBy: [{ conversationId: 'asc' }, { waTimestamp: 'asc' }],
      }),
      this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, cargo: true } },
        },
      }),
    ]);

    type Row = {
      tookOver: Set<string>;
      atendidos: number;
      solucionados: number;
      pendientes: number;
      mensajes: number;
      // response-time accumulators (seconds)
      responseSum: number;
      responseCount: number;
    };
    const perAgent = new Map<string, Row>();
    const rowFor = (id: string): Row => {
      let r = perAgent.get(id);
      if (!r) {
        r = {
          tookOver: new Set(),
          atendidos: 0,
          solucionados: 0,
          pendientes: 0,
          mensajes: 0,
          responseSum: 0,
          responseCount: 0,
        };
        perAgent.set(id, r);
      }
      return r;
    };

    for (const e of events) {
      if (!e.actorUserId) continue; // bot/system events don't count as agent work
      const r = rowFor(e.actorUserId);
      if (e.type === 'assigned') r.tookOver.add(e.conversationId);
      if (e.type === 'attention_changed') {
        const to_ = (e.detail as { to?: string } | null)?.to;
        if (to_ === 'ATENDIDO') r.atendidos += 1;
        else if (to_ === 'SOLUCIONADO') r.solucionados += 1;
        else if (to_ === 'PENDIENTE') r.pendientes += 1;
      }
    }
    for (const s of sentCounts) {
      if (s.sentByUserId) rowFor(s.sentByUserId).mensajes = s._count._all;
    }

    // Walk the ordered message stream. For each conversation, the first inbound
    // that hasn't been answered yet starts the clock; the next outbound stops it.
    // Only agent replies (sentByUserId set) are credited — a bot reply just
    // clears the pending customer message so the agent isn't blamed for its wait.
    let convId: string | null = null;
    let pendingInboundTs: number | null = null;
    for (const m of replyMessages) {
      if (m.conversationId !== convId) {
        convId = m.conversationId;
        pendingInboundTs = null;
      }
      if (m.direction === 'INBOUND') {
        if (pendingInboundTs === null) pendingInboundTs = m.waTimestamp.getTime();
      } else {
        if (pendingInboundTs !== null) {
          const gapSec = Math.max(0, (m.waTimestamp.getTime() - pendingInboundTs) / 1000);
          if (m.sentByUserId) {
            const r = rowFor(m.sentByUserId);
            r.responseSum += gapSec;
            r.responseCount += 1;
          }
          pendingInboundTs = null;
        }
      }
    }

    const agents = members.map((m) => {
      const r = perAgent.get(m.userId);
      const avgResponseSeconds =
        r && r.responseCount > 0 ? Math.round(r.responseSum / r.responseCount) : null;
      const chatsAtendidos = r?.tookOver.size ?? 0;
      const marcadosSolucionado = r?.solucionados ?? 0;
      // Solution rate: solved / taken-over (only meaningful when they took chats).
      const tasaSolucion =
        chatsAtendidos > 0 ? Math.round((marcadosSolucionado / chatsAtendidos) * 100) : null;
      return {
        userId: m.userId,
        email: m.user.email,
        name: fullName(m.user),
        cargo: m.user.cargo,
        role: m.role,
        chatsAtendidos,
        marcadosAtendido: r?.atendidos ?? 0,
        marcadosSolucionado,
        marcadosPendiente: r?.pendientes ?? 0,
        mensajesEnviados: r?.mensajes ?? 0,
        // average first-response time in seconds (null = no replies in range)
        avgResponseSeconds,
        respuestas: r?.responseCount ?? 0,
        tasaSolucion,
      };
    });
    agents.sort(
      (a, b) =>
        b.chatsAtendidos + b.mensajesEnviados + b.marcadosSolucionado -
        (a.chatsAtendidos + a.mensajesEnviados + a.marcadosSolucionado),
    );
    return { from: from.toISOString(), to: to.toISOString(), agents };
  }

  /** Start a new conversation by sending the first text message to a number. */
  async startConversation(
    userId: string,
    workspaceId: string,
    dto: { sessionId: string; to: string; text: string },
    sessionScope: string | null = null,
  ): Promise<{ conversationId: string }> {
    await this.assertMember(workspaceId, userId);
    this.assertSessionScope(dto.sessionId, sessionScope);
    const phone = String(dto.to).replace(/[^0-9]/g, '');
    if (phone.length < 6) throw new BadRequestException('Enter a valid phone number with country code.');
    const jid = `${phone}@s.whatsapp.net`;

    // "Nuevo chat" must not bypass the solved-chat write lock for this number.
    const solved = await this.prisma.conversation.findFirst({
      where: {
        workspaceId,
        sessionId: dto.sessionId,
        attention: 'SOLUCIONADO',
        contact: { is: { jid } },
      },
      select: { id: true },
    });
    if (solved) {
      throw new ConflictException(
        'Ese número tiene un chat solucionado — se reabrirá automáticamente cuando el cliente escriba de nuevo.',
      );
    }

    const { waServerUrl, token } = await this.workspaces.getDecryptedToken(userId, workspaceId);
    const endpoint =
      `${waServerUrl.replace(/\/+$/, '')}/api/sessions/${encodeURIComponent(dto.sessionId)}/messages/text`;

    let resp: globalThis.Response;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Api-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, text: dto.text }),
      });
    } catch {
      throw new ServiceUnavailableException('WA Server unreachable. Message not sent.');
    }
    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { message?: string; error?: string };
      const reason = body.message || body.error;
      if ((resp.status >= 400 && resp.status < 500) || resp.status === 501) {
        throw new BadRequestException(reason || 'Could not start the conversation.');
      }
      throw new ServiceUnavailableException(reason || 'Session disconnected — reconnect to send.');
    }
    const result = (await resp.json().catch(() => ({}))) as { messageId?: string };
    const waMessageId = result.messageId ?? `local-${randomUUID()}`;
    const waTimestamp = new Date();

    const conversationId = await this.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.upsert({
        where: { workspaceId_jid: { workspaceId, jid } },
        update: {},
        create: { workspaceId, jid, phone },
      });
      const convo = await tx.conversation.upsert({
        where: { workspaceId_sessionId_contactId: { workspaceId, sessionId: dto.sessionId, contactId: contact.id } },
        update: {},
        create: { workspaceId, contactId: contact.id, sessionId: dto.sessionId },
      });
      await tx.message.upsert({
        where: { workspaceId_waMessageId: { workspaceId, waMessageId } },
        update: {},
        create: {
          workspaceId,
          conversationId: convo.id,
          waMessageId,
          direction: 'OUTBOUND',
          type: 'text',
          body: dto.text,
          status: 'SENT',
          fromMe: true,
          sentByUserId: userId,
          waTimestamp,
        },
      });
      await tx.conversation.update({
        where: { id: convo.id },
        data: { lastPreview: dto.text.slice(0, 140), lastMessageAt: waTimestamp },
      });
      return convo.id;
    });

    await this.writeAudit(dto.sessionId, 'POST', `/inbox/conversations`);
    this.events.emit({ type: 'message.new', workspaceId, conversationId });
    return { conversationId };
  }

  async sendReply(
    userId: string,
    workspaceId: string,
    conversationId: string,
    dto: SendReplyDto,
    sessionScope: string | null = null,
  ) {
    const role = await this.assertMember(workspaceId, userId);
    const convo = await this.loadConversation(workspaceId, conversationId);
    this.assertSessionScope(convo.sessionId, sessionScope);

    if (convo.sessionDeletedAt) {
      throw new ServiceUnavailableException(
        'This conversation is a read-only archive — its WhatsApp session was deleted.',
      );
    }

    // EN_PROCESO/ATENDIDO chats are exclusive to their agent — read-only for
    // other MEMBER agents; OWNER/ADMIN may still intervene (escape valve).
    if (this.isLockedForUser(convo, userId, role)) {
      throw new ForbiddenException(
        'Chat a cargo de otro agente — solo lectura hasta que vuelva a Pendiente.',
      );
    }

    // Solved chats are write-locked for every agent until the customer writes
    // again (auto-reopen) or an owner/admin reopens the chat manually.
    if (convo.attention === 'SOLUCIONADO') {
      throw new ConflictException(
        'Chat solucionado — se reabrirá automáticamente cuando el cliente escriba de nuevo.',
      );
    }

    // getDecryptedToken re-checks membership + that the WA server is configured.
    const { waServerUrl, token } = await this.workspaces.getDecryptedToken(userId, workspaceId);
    const to = convo.contact.phone;
    const base =
      `${waServerUrl.replace(/\/+$/, '')}/api/sessions/` +
      `${encodeURIComponent(convo.sessionId)}/messages`;
    const kind = dto.kind ?? 'text';

    // Map the reply kind -> (wa-server endpoint, request body, persisted shape).
    let endpoint: string;
    let sendBody: Record<string, unknown>;
    let msgType: string;
    let msgBody: string | null;
    let msgPayload: Prisma.InputJsonValue | undefined;
    // For sent images we keep the data URI so the thread can show the picture.
    let msgMediaUrl: string | null = null;

    switch (kind) {
      case 'image':
        endpoint = `${base}/image`;
        sendBody = { to, url: dto.media, caption: dto.caption };
        msgType = 'image';
        msgBody = dto.caption ?? null;
        msgPayload = dto.caption ? { caption: dto.caption } : undefined;
        msgMediaUrl = dto.media ?? null;
        break;
      case 'document':
        endpoint = `${base}/document`;
        sendBody = { to, url: dto.media, fileName: dto.fileName, mimetype: dto.mimetype };
        msgType = 'document';
        msgBody = dto.fileName ?? null;
        msgPayload = { fileName: dto.fileName ?? null, mimetype: dto.mimetype ?? null };
        // Keep the uploaded file (base64 data URI) so the sent document stays
        // downloadable from the thread — same as the image case above.
        msgMediaUrl = dto.media ?? null;
        break;
      case 'poll':
        endpoint = `${base}/poll`;
        sendBody = { to, name: dto.pollName, options: dto.options, selectableCount: dto.selectableCount ?? 1 };
        msgType = 'poll';
        msgBody = dto.pollName ?? null;
        msgPayload = {
          name: dto.pollName ?? null,
          options: dto.options ?? [],
          selectableCount: dto.selectableCount ?? 1,
        };
        break;
      case 'reaction':
        endpoint = `${base}/reaction`;
        sendBody = { to, messageId: dto.targetMessageId, emoji: dto.emoji ?? '', fromMe: dto.targetFromMe ?? false };
        msgType = 'reaction';
        msgBody = dto.emoji ?? null;
        msgPayload = undefined;
        break;
      case 'location':
        endpoint = `${base}/location`;
        sendBody = { to, latitude: dto.latitude, longitude: dto.longitude, name: dto.locationName, address: dto.address };
        msgType = 'location';
        msgBody = dto.locationName ?? dto.address ?? '📍 Location';
        msgPayload = {
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          name: dto.locationName ?? null,
          address: dto.address ?? null,
        };
        break;
      case 'contact':
        endpoint = `${base}/contact`;
        sendBody = { to, displayName: dto.contactName, phoneNumber: dto.contactPhone };
        msgType = 'contact';
        msgBody = dto.contactName ?? '👤 Contact';
        msgPayload = { displayName: dto.contactName ?? null, phoneNumber: dto.contactPhone ?? null };
        break;
      case 'buttons':
        endpoint = `${base}/buttons`;
        sendBody = { to, text: dto.text, footer: dto.footer, buttons: dto.buttons };
        msgType = 'buttons';
        msgBody = dto.text ?? null;
        msgPayload = { footer: dto.footer ?? null, buttons: dto.buttons ?? [] };
        break;
      case 'list':
        endpoint = `${base}/list`;
        sendBody = { to, title: dto.listTitle, text: dto.text, buttonText: dto.buttonText, sections: dto.sections };
        msgType = 'list';
        msgBody = dto.text ?? null;
        msgPayload = { title: dto.listTitle ?? null, buttonText: dto.buttonText ?? null, sections: dto.sections ?? [] };
        break;
      case 'template':
        endpoint = `${base}/template`;
        sendBody = { to, name: dto.templateName, languageCode: dto.languageCode, bodyParams: dto.bodyParams };
        msgType = 'text';
        msgBody = `📋 Template: ${dto.templateName ?? ''}${dto.bodyParams?.length ? ' — ' + dto.bodyParams.join(', ') : ''}`;
        msgPayload = { templateName: dto.templateName ?? null, languageCode: dto.languageCode ?? null, bodyParams: dto.bodyParams ?? [] };
        break;
      default:
        endpoint = `${base}/text`;
        sendBody = { to, text: dto.text };
        msgType = 'text';
        msgBody = dto.text ?? '';
        msgPayload = undefined;
    }

    let resp: globalThis.Response;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Api-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify(sendBody),
      });
    } catch (err) {
      this.logger.warn(`[Inbox] reply send transport error: ${String(err)}`);
      throw new ServiceUnavailableException('WA Server unreachable. Reply not sent.');
    }

    if (!resp.ok) {
      // Surface the real reason from wa-server (Meta/Baileys errors carry a
      // message) instead of a blanket "disconnected".
      const body = (await resp.json().catch(() => ({}))) as { message?: string; error?: string };
      const reason = body.message || body.error;
      this.logger.warn(
        `[Inbox] reply send failed status=${resp.status} kind=${kind} session=${convo.sessionId} reason=${reason ?? 'n/a'}`,
      );
      // 4xx = bad input; 501 = capability not supported on this provider (e.g.
      // polls on Meta). Both should surface the real reason, not "disconnected".
      if ((resp.status >= 400 && resp.status < 500) || resp.status === 501) {
        throw new BadRequestException(reason || `Could not send ${kind} message.`);
      }
      throw new ServiceUnavailableException(reason || 'Session disconnected — reconnect to send.');
    }

    // Reactions attach to an existing message — nothing to persist in the thread.
    if (kind === 'reaction') {
      await this.writeAudit(convo.sessionId, 'POST', `/inbox/conversations/${conversationId}/messages`);
      return { ok: true };
    }

    const result = (await resp.json().catch(() => ({}))) as { messageId?: string };
    const waMessageId = result.messageId ?? `local-${randomUUID()}`;
    const waTimestamp = new Date();
    const preview =
      msgBody && msgBody.length ? msgBody.slice(0, 140) : OUTBOUND_PREVIEW[msgType] ?? msgType;

    // Upsert (not create): the wa-server also mirrors this send back as a
    // `message.sent` event, so guard against a double-insert race on waMessageId.
    const message = await this.prisma.message.upsert({
      where: { workspaceId_waMessageId: { workspaceId, waMessageId } },
      // The wa-server mirror may have raced ahead — claim authorship either way.
      update: { sentByUserId: userId },
      create: {
        workspaceId,
        conversationId: convo.id,
        waMessageId,
        direction: 'OUTBOUND',
        type: msgType,
        body: msgBody,
        payload: msgPayload,
        mediaUrl: msgMediaUrl,
        status: 'SENT',
        fromMe: true,
        sentByUserId: userId,
        waTimestamp,
      },
    });

    await this.prisma.conversation.update({
      where: { id: convo.id },
      data: { lastPreview: preview, lastMessageAt: waTimestamp },
    });

    await this.writeAudit(convo.sessionId, 'POST', `/inbox/conversations/${conversationId}/messages`);
    this.events.emit({ type: 'message.new', workspaceId, conversationId });
    return message;
  }

  // ── view shaping ────────────────────────────────────────────────────────────

  private toConversationView(c: {
    id: string;
    sessionId: string;
    status: string;
    lastMessageAt: Date;
    lastPreview: string | null;
    unreadCount: number;
    tags: Prisma.JsonValue;
    sessionDeletedAt: Date | null;
    archivedAt?: Date | null;
    metadata?: Prisma.JsonValue;
    attention?: string;
    assignedTo?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
    delegatedGroup?: { id: string; name: string } | null;
    delegatedToUser?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
    contact: { id: string; jid: string; phone: string; whatsappName: string | null; savedName: string | null; avatarUrl: string | null; ratingAvg?: number | null; ratingCount?: number | null };
  }) {
    return {
      id: c.id,
      sessionId: c.sessionId,
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      lastPreview: c.lastPreview,
      unreadCount: c.unreadCount,
      tags: c.tags ?? [],
      sessionDeletedAt: c.sessionDeletedAt,
      archived: !!c.archivedAt,
      notes: (c.metadata as { notes?: string } | null)?.notes ?? null,
      attention: c.attention ?? 'PENDIENTE',
      // null = the AI bot is handling it
      assignedTo: c.assignedTo
        ? { id: c.assignedTo.id, email: c.assignedTo.email, name: fullName(c.assignedTo) }
        : null,
      delegatedGroup: c.delegatedGroup ?? null,
      delegatedToUser: c.delegatedToUser
        ? { id: c.delegatedToUser.id, email: c.delegatedToUser.email, name: fullName(c.delegatedToUser) }
        : null,
      contact: {
        id: c.contact.id,
        phone: c.contact.phone,
        // display priority: savedName ?? whatsappName ?? phone
        name: c.contact.savedName ?? c.contact.whatsappName ?? c.contact.phone,
        savedName: c.contact.savedName,
        whatsappName: c.contact.whatsappName,
        avatarUrl: c.contact.avatarUrl,
        rating: c.contact.ratingAvg ?? null,
        ratingCount: c.contact.ratingCount ?? 0,
      },
    };
  }
}
