// Integration tests for InboxService reads/writes against a REAL PostgreSQL.
// The WorkspacesService dependency is only used by sendReply (not covered here),
// so a bare stub is injected. Run: pnpm build && node --test test/inbox-service.test.js

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://wasphere:wasphere_dev@localhost:5432/wasphere_test';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { PrismaService } = require('../dist/prisma/prisma.service');
const { InboxEventsService } = require('../dist/inbox/inbox-events.service');
const { InboxService } = require('../dist/inbox/inbox.service');

const prisma = new PrismaService();
const svc = new InboxService(prisma, /* workspaces stub */ {}, new InboxEventsService());

let wsId;
let userId;
let agentAId; // MEMBER
let agentBId; // MEMBER

async function seedContact(name, phone) {
  const contact = await prisma.contact.create({
    data: { workspaceId: wsId, jid: `${phone}@s.whatsapp.net`, phone, whatsappName: name },
  });
  return prisma.conversation.create({
    data: { workspaceId: wsId, contactId: contact.id, sessionId: 's1', lastPreview: `hi from ${name}` },
  });
}

before(async () => {
  await prisma.$connect();
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.workspaceMember.deleteMany({});
  await prisma.workspace.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: ['svc-test@example.com', 'svc-agent-a@example.com', 'svc-agent-b@example.com'] } },
  });
  const user = await prisma.user.create({ data: { email: 'svc-test@example.com', passwordHash: 'x' } });
  userId = user.id;
  const ws = await prisma.workspace.create({ data: { name: 'Svc WS', ownerId: user.id } });
  wsId = ws.id;
  await prisma.workspaceMember.create({ data: { workspaceId: wsId, userId, role: 'OWNER' } });
  const agentA = await prisma.user.create({
    data: { email: 'svc-agent-a@example.com', passwordHash: 'x', firstName: 'Ana' },
  });
  agentAId = agentA.id;
  await prisma.workspaceMember.create({ data: { workspaceId: wsId, userId: agentAId, role: 'MEMBER' } });
  const agentB = await prisma.user.create({ data: { email: 'svc-agent-b@example.com', passwordHash: 'x' } });
  agentBId = agentB.id;
  await prisma.workspaceMember.create({ data: { workspaceId: wsId, userId: agentBId, role: 'MEMBER' } });
});

beforeEach(async () => {
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.contact.deleteMany({});
});

after(async () => {
  await prisma.$disconnect();
});

test('rejects a non-member', async () => {
  await assert.rejects(() => svc.listConversations('00000000-0000-0000-0000-000000000000', wsId, {}));
});

test('search matches by name but a non-matching term returns nothing (regression)', async () => {
  await seedContact('Alice', '923010000001');
  await seedContact('Bob', '923020000002');

  const byName = await svc.listConversations(userId, wsId, { q: 'alice' });
  assert.equal(byName.items.length, 1);
  assert.equal(byName.items[0].contact.name, 'Alice');

  // The bug: a non-numeric, non-matching term built `phone contains ""` and
  // matched EVERY row. It must now match nothing.
  const noMatch = await svc.listConversations(userId, wsId, { q: 'zzz' });
  assert.equal(noMatch.items.length, 0);

  const byPhone = await svc.listConversations(userId, wsId, { q: '923020' });
  assert.equal(byPhone.items.length, 1);
  assert.equal(byPhone.items[0].contact.name, 'Bob');
});

test('markRead clears the unread counter', async () => {
  const contact = await prisma.contact.create({
    data: { workspaceId: wsId, jid: '923030000003@s.whatsapp.net', phone: '923030000003', whatsappName: 'Carol' },
  });
  const convo = await prisma.conversation.create({
    data: { workspaceId: wsId, contactId: contact.id, sessionId: 's1', unreadCount: 5 },
  });
  await svc.markRead(userId, wsId, convo.id);
  const after = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(after.unreadCount, 0);
});

test('patchConversation updates status, tags and notes', async () => {
  const convo = await seedContact('Dave', '923040000004');
  await svc.patchConversation(userId, wsId, convo.id, { status: 'RESOLVED', tags: ['vip', 'lead'], notes: 'paid customer' });
  const view = await svc.getConversation(userId, wsId, convo.id);
  assert.equal(view.status, 'RESOLVED');
  assert.deepEqual(view.tags, ['vip', 'lead']);
  assert.equal(view.notes, 'paid customer');
});

test('EN_PROCESO & ATENDIDO are exclusive to their agent; only admin can reanudar; delegation releases', async () => {
  const convo = await seedContact('Eve', '923070000007');

  // Agent A opens the PENDIENTE chat -> takeover (assigned + EN_PROCESO).
  await svc.markRead(agentAId, wsId, convo.id);
  let row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.assignedToUserId, agentAId);
  assert.equal(row.attention, 'EN_PROCESO');

  // Agent B opens it -> read-only, must NOT steal the assignment.
  await svc.markRead(agentBId, wsId, convo.id);
  row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.assignedToUserId, agentAId);

  // Another MEMBER cannot reopen it.
  await assert.rejects(() => svc.patchConversation(agentBId, wsId, convo.id, { attention: 'PENDIENTE' }));

  // Agent A (the owner of the chat) marks it ATENDIDO — still exclusive to A.
  await svc.patchConversation(agentAId, wsId, convo.id, { attention: 'ATENDIDO' });
  row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.attention, 'ATENDIDO');
  assert.equal(row.assignedToUserId, agentAId);

  // ATENDIDO is locked to other MEMBERs too.
  await assert.rejects(() => svc.patchConversation(agentBId, wsId, convo.id, { attention: 'PENDIENTE' }));

  // The OWNER/ADMIN escape valve: they CAN reanudar a locked chat.
  await svc.patchConversation(userId, wsId, convo.id, { attention: 'PENDIENTE' });
  row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.attention, 'PENDIENTE');
  assert.equal(row.assignedToUserId, null);

  // Now claimable again — agent B takes over.
  await svc.markRead(agentBId, wsId, convo.id);
  row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.assignedToUserId, agentBId);
  assert.equal(row.attention, 'EN_PROCESO');

  // Delegating to a group releases the chat: PENDIENTE + unassigned.
  await prisma.agentGroup.deleteMany({ where: { workspaceId: wsId, name: { startsWith: 'Dept-' } } });
  const group = await prisma.agentGroup.create({ data: { workspaceId: wsId, name: `Dept-${Date.now()}` } });
  await svc.patchConversation(agentBId, wsId, convo.id, { delegatedGroupId: group.id });
  row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.attention, 'PENDIENTE');
  assert.equal(row.assignedToUserId, null);
  assert.equal(row.delegatedGroupId, group.id);
});

test('SOLUCIONADO can only be reopened manually by an admin', async () => {
  const convo = await seedContact('Hugo', '923110000011');
  await svc.markRead(agentAId, wsId, convo.id);
  await svc.patchConversation(agentAId, wsId, convo.id, { attention: 'SOLUCIONADO' });
  let row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.attention, 'SOLUCIONADO');

  // A regular agent cannot manually reopen a solved chat.
  await assert.rejects(() => svc.patchConversation(agentBId, wsId, convo.id, { attention: 'PENDIENTE' }));

  // The OWNER/ADMIN can reanudar it.
  await svc.patchConversation(userId, wsId, convo.id, { attention: 'EN_PROCESO' });
  row = await prisma.conversation.findUnique({ where: { id: convo.id } });
  assert.equal(row.attention, 'EN_PROCESO');
});

test('delegation notifies only the target group members (bell feed + seen cursor)', async () => {
  const convo = await seedContact('Frank', '923080000008');
  await prisma.agentGroup.deleteMany({ where: { workspaceId: wsId } });
  const group = await prisma.agentGroup.create({ data: { workspaceId: wsId, name: `Ventas-${Date.now()}` } });
  await prisma.agentGroupMember.create({ data: { groupId: group.id, userId: agentAId } });

  // OWNER delegates the chat to the group.
  await svc.patchConversation(userId, wsId, convo.id, { delegatedGroupId: group.id });

  // Agent A (group member) sees it, with actor + group + timestamp.
  const forA = await svc.listNotifications(agentAId, wsId);
  assert.equal(forA.items.length, 1);
  assert.equal(forA.unseenCount, 1);
  assert.equal(forA.items[0].conversationId, convo.id);
  assert.equal(forA.items[0].groupName, group.name);
  assert.equal(forA.items[0].actor.email, 'svc-test@example.com');
  assert.ok(forA.items[0].createdAt);

  // Agent B (not in the group) sees nothing.
  const forB = await svc.listNotifications(agentBId, wsId);
  assert.equal(forB.items.length, 0);

  // Opening the bell marks everything seen.
  await svc.markNotificationsSeen(agentAId, wsId);
  const seen = await svc.listNotifications(agentAId, wsId);
  assert.equal(seen.unseenCount, 0);
  assert.equal(seen.items[0].seen, true);
});

test('agentWork computes response time, chats attended and solved', async () => {
  const convo = await seedContact('Gina', '923090000009');
  const base = new Date('2026-06-15T12:00:00Z');
  const at = (offsetSec) => new Date(base.getTime() + offsetSec * 1000);
  // Customer writes at t0; agent A replies 90s later; customer again at +200s;
  // agent A replies at +230s (30s). Avg = (90 + 30) / 2 = 60s.
  const mk = (i, direction, tsSec, sentBy) => prisma.message.create({
    data: {
      workspaceId: wsId,
      conversationId: convo.id,
      waMessageId: `rt-${i}-${Date.now()}`,
      direction,
      type: 'text',
      body: 'x',
      fromMe: direction === 'OUTBOUND',
      sentByUserId: sentBy ?? null,
      waTimestamp: at(tsSec),
    },
  });
  await mk(1, 'INBOUND', 0, null);
  await mk(2, 'OUTBOUND', 90, agentAId);
  await mk(3, 'INBOUND', 200, null);
  await mk(4, 'OUTBOUND', 230, agentAId);
  // Agent A also takes over and solves the chat.
  await prisma.conversationEvent.createMany({
    data: [
      { workspaceId: wsId, conversationId: convo.id, actorUserId: agentAId, type: 'assigned', createdAt: at(1) },
      { workspaceId: wsId, conversationId: convo.id, actorUserId: agentAId, type: 'attention_changed', detail: { to: 'SOLUCIONADO' }, createdAt: at(300) },
    ],
  });

  const from = new Date('2026-06-15T00:00:00Z').toISOString();
  const to = new Date('2026-06-16T00:00:00Z').toISOString();
  const report = await svc.agentWork(userId, wsId, from, to);
  const row = report.agents.find((a) => a.userId === agentAId);
  assert.equal(row.chatsAtendidos, 1);
  assert.equal(row.marcadosSolucionado, 1);
  assert.equal(row.tasaSolucion, 100);
  assert.equal(row.respuestas, 2);
  assert.equal(row.avgResponseSeconds, 60);
});

test('status filter returns only matching conversations', async () => {
  const a = await seedContact('Open1', '923050000005');
  await seedContact('Open2', '923060000006');
  await svc.patchConversation(userId, wsId, a.id, { status: 'RESOLVED' });

  const open = await svc.listConversations(userId, wsId, { status: 'OPEN' });
  assert.equal(open.items.length, 1);
  const resolved = await svc.listConversations(userId, wsId, { status: 'RESOLVED' });
  assert.equal(resolved.items.length, 1);
  assert.equal(resolved.items[0].contact.name, 'Open1');
});
