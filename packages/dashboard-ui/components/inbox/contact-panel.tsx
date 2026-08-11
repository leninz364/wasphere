"use client"

import * as React from "react"
import { X, FileText, Bot, UserRound, ClipboardList, Share2, UserPlus, Archive, ArchiveRestore } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { StarRating } from "@/components/star-rating"
import { ratingColor } from "@/lib/rating"
import { cn } from "@/lib/utils"
import { relativeTime } from "./relative-time"
import { agentName, ATTENTION_CLASSES, ATTENTION_LABELS } from "./attention"
import type { AttentionStatus, Conversation, ConversationEvent, DelegationAgent, DelegationGroup, InboxMessage } from "./types"

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toUpperCase()
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

// Human-readable line for one "Atención realizada" event.
function eventText(e: ConversationEvent): string {
  const who = e.actor ? agentName(e.actor) : "Bot IA"
  const d = (e.detail ?? {}) as { from?: string; to?: string; toGroupName?: string | null; toUserName?: string | null; note?: string | null }
  switch (e.type) {
    case "assigned":
      return `${who} se hizo cargo del chat`
    case "delegated":
      if (d.toGroupName) return `${who} delegó el chat a «${d.toGroupName}»`
      if (d.toUserName)
        return d.note
          ? `${who} delegó el chat a ${d.toUserName}: «${d.note}»`
          : `${who} delegó el chat a ${d.toUserName}`
      return `${who} quitó la delegación`
    case "attention_changed":
      return `${who} marcó como ${ATTENTION_LABELS[(d.to as AttentionStatus) ?? "PENDIENTE"] ?? d.to}`
    case "status_changed":
      return d.to === "RESOLVED" ? `${who} resolvió la conversación` : `${who} reabrió la conversación`
    case "reopened":
      return "Nuevo mensaje — el chat volvió al Bot IA"
    case "archived":
      return `${who} archivó el chat`
    case "unarchived":
      return `${who} restauró el chat`
    default:
      return `${who}: ${e.type}`
  }
}

// Delegate (reserve) the chat directly to one agent, with an optional message.
// The chat goes to PENDIENTE but stays exclusive to that agent.
function DelegateAgentControl({
  current,
  agents,
  disabled,
  onDelegate,
}: {
  current: Conversation["delegatedToUser"]
  agents: DelegationAgent[]
  disabled: boolean
  onDelegate: (userId: string | null, note?: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [agentId, setAgentId] = React.useState("")
  const [note, setNote] = React.useState("")

  if (current) {
    return (
      <span className="flex w-fit items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
        <UserPlus className="size-3" /> Reservado a {current.name ?? current.email}
        {!disabled && (
          <button
            type="button"
            onClick={() => onDelegate(null)}
            className="opacity-60 hover:opacity-100"
            aria-label="Quitar delegación"
          >
            <X className="size-3" />
          </button>
        )}
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
      >
        <UserPlus className="size-3.5" /> Delegar a un agente…
      </button>
    )
  }

  const reset = () => { setOpen(false); setAgentId(""); setNote("") }
  const submit = () => {
    if (!agentId) return
    onDelegate(agentId, note.trim() || undefined)
    reset()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
      <div className="flex items-center gap-2">
        <UserPlus className="size-3.5 shrink-0 text-muted-foreground" />
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
          title="Delegar este chat a un agente"
        >
          <option value="">Elegir agente…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Mensaje para el agente (opcional)…"
        maxLength={500}
        rows={2}
        className="resize-none text-xs"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={reset} className="text-[11px] text-muted-foreground hover:underline">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!agentId}
          onClick={submit}
          className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
        >
          Delegar
        </button>
      </div>
    </div>
  )
}

export function ContactPanel({
  conversation,
  recent,
  events = [],
  groups = [],
  agents = [],
  onDelegate,
  onDelegateAgent,
  onRateContact,
  myRating,
  onArchive,
  onUnarchive,
}: {
  conversation: Conversation
  recent: InboxMessage[]
  events?: ConversationEvent[]
  groups?: DelegationGroup[]
  agents?: DelegationAgent[]
  onDelegate?: (groupId: string | null) => void
  onDelegateAgent?: (userId: string | null, note?: string) => void
  onRateContact?: (rating: number) => void
  // this agent's own rating for the contact (accumulated avg lives on the contact)
  myRating?: number | null
  // admin-only soft-delete: archive a SOLUCIONADO chat / restore an archived one
  onArchive?: () => void
  onUnarchive?: () => void
}) {
  const c = conversation.contact
  const images = recent.filter((m) => (m.type === "image" || m.type === "sticker") && m.mediaUrl)
  const docs = recent.filter((m) => m.type === "document")
  const mediaCount = images.length + docs.length

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-muted/30 p-3">
      {/* contact card */}
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center shadow-sm">
        <Avatar className="size-16 ring-2 ring-primary/10">
          {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-lg">{initials(c.name)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="text-sm font-semibold text-foreground">{c.name}</div>
          <div className="text-xs text-muted-foreground">+{c.phone}</div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
          Contacto de WhatsApp
        </span>
      </div>

      {/* attention: who + state + trail */}
      <Section
        title="Atención realizada"
        action={
          <span className={cn("rounded-full px-2 py-px text-[10px] font-medium", ATTENTION_CLASSES[conversation.attention ?? "PENDIENTE"])}>
            {ATTENTION_LABELS[conversation.attention ?? "PENDIENTE"]}
          </span>
        }
      >
        <div className="flex items-center gap-1.5 text-xs text-foreground">
          {conversation.assignedTo ? <UserRound className="size-3.5 text-blue-500" /> : <Bot className="size-3.5 text-violet-500" />}
          <span className="font-medium">{agentName(conversation.assignedTo)}</span>
          <span className="text-muted-foreground">atiende este chat</span>
        </div>

        {/* delegate to a group / department / location */}
        {onDelegate && groups.length > 0 && (
          <div className="flex items-center gap-2">
            <Share2 className="size-3.5 shrink-0 text-muted-foreground" />
            <select
              value={conversation.delegatedGroup?.id ?? ""}
              disabled={conversation.attention === "SOLUCIONADO"}
              onChange={(e) => onDelegate(e.target.value || null)}
              className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs disabled:opacity-50"
              title="Delegar este chat a un grupo o departamento"
            >
              <option value="">Sin delegar</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>Delegar a: {g.name}</option>
              ))}
            </select>
          </div>
        )}
        {conversation.delegatedGroup && (
          <span className="flex w-fit items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-400">
            <Share2 className="size-3" /> Delegado a {conversation.delegatedGroup.name}
          </span>
        )}

        {/* delegate (reserve) the chat directly to a specific agent + message */}
        {onDelegateAgent && agents.length > 0 && (
          <DelegateAgentControl
            current={conversation.delegatedToUser}
            agents={agents}
            disabled={conversation.attention === "SOLUCIONADO"}
            onDelegate={onDelegateAgent}
          />
        )}
        {events.length === 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClipboardList className="size-3.5" /> Sin acciones registradas aún
          </span>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/50" />
                <span className="flex-1 text-foreground/80">{eventText(e)}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground" title={new Date(e.createdAt).toLocaleString()}>
                  {relativeTime(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* customer rating: accumulated across all agents + this agent's own */}
      <Section title="Calificación del cliente">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <StarRating value={Math.round(conversation.contact.rating ?? 0)} readOnly size={20} color={ratingColor(conversation.contact.rating)} />
            <span className="text-sm font-semibold" style={conversation.contact.rating ? { color: ratingColor(conversation.contact.rating) } : undefined}>
              {conversation.contact.rating ? conversation.contact.rating.toFixed(1) : "—"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {conversation.contact.ratingCount > 0
                ? `${conversation.contact.ratingCount} calificaci${conversation.contact.ratingCount === 1 ? "ón" : "ones"}`
                : "Sin calificaciones"}
            </span>
          </div>
          {onRateContact && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Tu calificación:</span>
              <StarRating value={myRating ?? 0} onChange={onRateContact} size={18} />
            </div>
          )}
        </div>
      </Section>

      {/* media & docs */}
      <Section title="Multimedia y documentos" action={<span className="text-[11px] text-muted-foreground">{mediaCount}</span>}>
        {mediaCount === 0 ? (
          <span className="text-xs text-muted-foreground">Sin multimedia aún</span>
        ) : (
          <div className="flex flex-col gap-2">
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {images.slice(0, 6).map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={m.id} src={m.mediaUrl!} alt="" className="aspect-square w-full rounded-md object-cover" />
                ))}
              </div>
            )}
            {docs.slice(0, 4).map((m) => {
              const p = (m.payload ?? {}) as Record<string, unknown>
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{(p.fileName as string) || m.body || "Documento"}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* admin-only: archive (hide) a solved chat, or restore an archived one */}
      {(onArchive || onUnarchive) && (
        <Section title="Administración">
          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Archive className="size-3.5" /> Archivar chat
            </button>
          )}
          {onUnarchive && (
            <button
              type="button"
              onClick={onUnarchive}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
            >
              <ArchiveRestore className="size-3.5" /> Restaurar a la bandeja
            </button>
          )}
          <p className="text-[10px] leading-snug text-muted-foreground">
            {onArchive
              ? "Oculta el chat de la bandeja sin borrar datos. Reaparece si el cliente vuelve a escribir."
              : "Devuelve el chat a la bandeja activa."}
          </p>
        </Section>
      )}

    </div>
  )
}
