import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface ContactRow {
  id: string;
  savedName: string | null;
  whatsappName: string | null;
  phone: string;
  jid: string;
  avatarUrl: string | null;
  tags: string[];
  notes: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  updatedAt: Date;
}

const SELECT = {
  id: true, savedName: true, whatsappName: true, phone: true, jid: true,
  avatarUrl: true, tags: true, notes: true, ratingAvg: true, ratingCount: true, updatedAt: true,
} as const;

function view(c: ContactRow) {
  return {
    id: c.id,
    name: c.savedName || c.whatsappName || c.phone,
    savedName: c.savedName,
    whatsappName: c.whatsappName,
    phone: c.phone,
    jid: c.jid,
    avatarUrl: c.avatarUrl,
    tags: c.tags ?? [],
    notes: c.notes,
    // accumulated (average) customer rating across all agents
    rating: c.ratingAvg ?? null,
    ratingCount: c.ratingCount ?? 0,
    updatedAt: c.updatedAt,
  };
}

/** Trim, drop empties, cap length, dedupe (case-insensitive), cap count. */
function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().slice(0, 30);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}

function csvCell(v: string | null): string {
  const s = (v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMember(workspaceId: string, userId: string): Promise<void> {
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!m) throw new ForbiddenException('Not a member of this workspace');
  }

  async list(
    userId: string,
    workspaceId: string,
    q: { search?: string; tag?: string; limit?: number; cursor?: string },
  ) {
    await this.assertMember(workspaceId, userId);
    const take = Math.min(Math.max(q.limit ?? 50, 1), 100);

    const where: Prisma.ContactWhereInput = { workspaceId };
    const s = q.search?.trim();
    if (s) {
      where.OR = [
        { savedName: { contains: s, mode: 'insensitive' } },
        { whatsappName: { contains: s, mode: 'insensitive' } },
      ];
      // Only match on phone when the query has a meaningful run of digits —
      // otherwise a query like "john-5" collapses to "5" and matches everyone.
      const digits = s.replace(/[^0-9]/g, '');
      if (digits.length >= 3) where.OR.push({ phone: { contains: digits } });
    }
    if (q.tag?.trim()) where.tags = { has: q.tag.trim() };

    const rows = await this.prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: SELECT,
    });

    const nextCursor = rows.length > take ? rows[take - 1].id : null;
    return { items: rows.slice(0, take).map(view), nextCursor };
  }

  /** Distinct tags used across the workspace (for the filter + suggestions). */
  async listTags(userId: string, workspaceId: string): Promise<string[]> {
    await this.assertMember(workspaceId, userId);
    const rows = await this.prisma.$queryRaw<{ tag: string }[]>(
      Prisma.sql`SELECT DISTINCT unnest(tags) AS tag FROM contacts WHERE workspace_id = ${workspaceId}::uuid ORDER BY tag`,
    );
    return rows.map((r) => r.tag);
  }

  /** Manually add a contact by phone number. */
  async create(userId: string, workspaceId: string, dto: { phone: string; savedName?: string; tags?: unknown }) {
    await this.assertMember(workspaceId, userId);
    const digits = (dto.phone ?? '').replace(/[^0-9]/g, '');
    if (digits.length < 6) throw new BadRequestException('Enter a valid phone number (with country code).');
    const jid = `${digits}@s.whatsapp.net`;

    const existing = await this.prisma.contact.findUnique({
      where: { workspaceId_jid: { workspaceId, jid } },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('A contact with this number already exists.');

    const created = await this.prisma.contact.create({
      data: {
        workspaceId,
        jid,
        phone: digits,
        savedName: dto.savedName?.trim() || null,
        tags: sanitizeTags(dto.tags),
      },
      select: SELECT,
    });
    return view(created);
  }

  async update(
    userId: string,
    workspaceId: string,
    contactId: string,
    dto: { savedName?: string | null; tags?: unknown; notes?: string | null },
  ) {
    await this.assertMember(workspaceId, userId);
    const existing = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Contact not found');

    const data: Prisma.ContactUpdateInput = {};
    if (dto.savedName !== undefined) data.savedName = dto.savedName?.trim() ? dto.savedName.trim() : null;
    if (dto.tags !== undefined) data.tags = sanitizeTags(dto.tags);
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() ? dto.notes.trim().slice(0, 2000) : null;

    const updated = await this.prisma.contact.update({
      where: { id: contactId },
      data,
      select: SELECT,
    });
    return view(updated);
  }

  // ── star rating (accumulated across agents) ───────────────────────────────

  private async assertContact(workspaceId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');
  }

  /** { avg, count, myRating } — the accumulated rating plus this agent's own. */
  async getRating(userId: string, workspaceId: string, contactId: string) {
    await this.assertMember(workspaceId, userId);
    await this.assertContact(workspaceId, contactId);
    const [contact, mine] = await Promise.all([
      this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { ratingAvg: true, ratingCount: true },
      }),
      this.prisma.contactRating.findUnique({
        where: { contactId_userId: { contactId, userId } },
        select: { rating: true },
      }),
    ]);
    return {
      avg: contact?.ratingAvg ?? null,
      count: contact?.ratingCount ?? 0,
      myRating: mine?.rating ?? null,
    };
  }

  /**
   * Sets this agent's 1–5 rating for the contact (0 clears their own rating),
   * then recomputes the contact's accumulated average + count.
   */
  async setRating(userId: string, workspaceId: string, contactId: string, rating: number) {
    await this.assertMember(workspaceId, userId);
    await this.assertContact(workspaceId, contactId);
    const r = Math.round(rating);
    if (r >= 1 && r <= 5) {
      await this.prisma.contactRating.upsert({
        where: { contactId_userId: { contactId, userId } },
        create: { contactId, userId, rating: r },
        update: { rating: r },
      });
    } else {
      // 0 / out-of-range removes this agent's contribution
      await this.prisma.contactRating.deleteMany({ where: { contactId, userId } });
    }
    const agg = await this.prisma.contactRating.aggregate({
      where: { contactId },
      _avg: { rating: true },
      _count: true,
    });
    const avg = agg._avg.rating ?? null;
    const count = agg._count;
    await this.prisma.contact.update({
      where: { id: contactId },
      data: { ratingAvg: avg, ratingCount: count },
    });
    return { avg, count, myRating: r >= 1 && r <= 5 ? r : null };
  }

  async remove(userId: string, workspaceId: string, contactId: string) {
    await this.assertMember(workspaceId, userId);
    const existing = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.contact.delete({ where: { id: contactId } });
    return { ok: true };
  }

  /** Apply a tag-add / tag-remove / delete across many contacts at once. */
  async bulk(
    userId: string,
    workspaceId: string,
    dto: { ids: string[]; action: 'addTag' | 'removeTag' | 'delete'; tag?: string },
  ) {
    await this.assertMember(workspaceId, userId);
    const ids = [...new Set(dto.ids)].slice(0, 500);
    if (ids.length === 0) throw new BadRequestException('No contacts selected');

    if (dto.action === 'delete') {
      const res = await this.prisma.contact.deleteMany({ where: { workspaceId, id: { in: ids } } });
      return { ok: true, affected: res.count };
    }

    const tag = dto.tag?.trim();
    if (!tag) throw new BadRequestException('Tag is required');
    const rows = await this.prisma.contact.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, tags: true },
    });
    await this.prisma.$transaction(
      rows.map((c) => {
        const next =
          dto.action === 'addTag'
            ? sanitizeTags([...c.tags, tag])
            : c.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
        return this.prisma.contact.update({ where: { id: c.id }, data: { tags: next } });
      }),
    );
    return { ok: true, affected: rows.length };
  }

  /**
   * Bulk-import contacts from parsed rows. New numbers are inserted; numbers
   * that already exist are skipped (saved names/tags are never overwritten).
   * Rows without a usable phone number are reported as invalid.
   */
  async importContacts(
    userId: string,
    workspaceId: string,
    rows: { phone?: string; name?: string; tags?: unknown; notes?: string }[],
  ): Promise<{ imported: number; skipped: number; invalid: number }> {
    await this.assertMember(workspaceId, userId);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to import');
    }
    if (rows.length > 2000) {
      throw new BadRequestException('Import at most 2000 rows per request');
    }

    let invalid = 0;
    let duplicate = 0; // collapsed within this batch — counted as skipped
    const seen = new Set<string>();
    const data: Prisma.ContactCreateManyInput[] = [];

    for (const row of rows) {
      const digits = (row.phone ?? '').replace(/[^0-9]/g, '');
      if (digits.length < 6) {
        invalid++;
        continue;
      }
      const jid = `${digits}@s.whatsapp.net`;
      if (seen.has(jid)) { duplicate++; continue; } // collapse duplicates within this batch
      seen.add(jid);

      const notes = typeof row.notes === 'string' ? row.notes.trim().slice(0, 2000) : '';
      data.push({
        workspaceId,
        jid,
        phone: digits,
        savedName: typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 100) : null,
        tags: sanitizeTags(row.tags),
        notes: notes || null,
      });
    }

    if (data.length === 0) {
      return { imported: 0, skipped: duplicate, invalid };
    }

    // skipDuplicates relies on the @@unique([workspaceId, jid]) constraint to
    // skip numbers already in the book — existing rows are left untouched.
    const res = await this.prisma.contact.createMany({ data, skipDuplicates: true });
    // skipped = already-in-DB (data.length - inserted) + within-file duplicates.
    return { imported: res.count, skipped: (data.length - res.count) + duplicate, invalid };
  }

  /** Build a CSV of the workspace's contacts (optionally a selected subset). */
  async exportCsv(userId: string, workspaceId: string, ids?: string[]) {
    await this.assertMember(workspaceId, userId);
    const where: Prisma.ContactWhereInput = { workspaceId };
    if (ids && ids.length) where.id = { in: [...new Set(ids)].slice(0, 10000) };
    const rows = await this.prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 10000,
      select: SELECT,
    });
    const header = ['Name', 'Phone', 'Saved Name', 'WhatsApp Name', 'Tags', 'Notes'];
    const lines = [header.join(',')];
    for (const c of rows) {
      const v = view(c);
      lines.push([
        csvCell(v.name),
        csvCell(v.phone),
        csvCell(v.savedName),
        csvCell(v.whatsappName),
        csvCell(v.tags.join('; ')),
        csvCell(v.notes),
      ].join(','));
    }
    return { filename: `contacts-${workspaceId}.csv`, csv: lines.join('\n'), count: rows.length };
  }
}
