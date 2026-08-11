"use client"

import * as React from "react"
import { Bot, Check, CheckCheck, ChevronDown, FileText, ImageIcon, Lock, MapPin, BarChart3, MoreHorizontal, SmilePlus, Download, Forward, Copy, Maximize2, Plus, Contact as ContactIcon, UserRound, PhoneMissed, AlertTriangle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusDot } from "@/components/ui/status-dot"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { clockTime } from "./relative-time"
import { agentName, ATTENTION_CLASSES, ATTENTION_DOT, ATTENTION_LABELS, ATTENTION_ORDER } from "./attention"
import type { AttentionStatus, Conversation, InboxMessage } from "./types"

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toUpperCase()
}

function Ticks({ status }: { status: InboxMessage["status"] }) {
  if (status === "READ") return <CheckCheck className="size-3.5 text-sky-400" />
  if (status === "DELIVERED") return <CheckCheck className="size-3.5 opacity-70" />
  if (status === "FAILED") return <span className="text-[10px] text-destructive">failed</span>
  return <Check className="size-3.5 opacity-70" />
}

// Tap an image to open a lightbox with a Download button.
function ImageView({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-64 max-w-full rounded-md object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton className="max-w-3xl gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[78vh] w-full rounded object-contain" />
          <div className="flex justify-end">
            <a
              href={src}
              download={alt && alt !== "image" ? alt : "bchat-image.jpg"}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="size-4" /> Descargar
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Inline video player + a "full view" lightbox (big player + download).
function VideoView({ src }: { src: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="relative w-fit">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={src} controls className="max-h-72 max-w-full rounded-md" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Vista completa"
        className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
      >
        <Maximize2 className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton className="max-w-4xl gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={src} controls autoPlay className="max-h-[78vh] w-full rounded" />
          <div className="flex justify-end">
            <a
              href={src}
              download="bchat-video.mp4"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="size-4" /> Descargar
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MediaBlock({ m, onStartChat }: { m: InboxMessage; onStartChat?: (phone: string) => void }) {
  const p = (m.payload ?? {}) as Record<string, unknown>
  const cap = (p.caption as string) || m.body

  // Inbound messages WhatsApp couldn’t decrypt (LID / unsupported) arrive empty.
  if (m.type === "unknown") {
    return (
      <span className="text-xs italic text-muted-foreground">
        ⚠️ Este mensaje no se pudo cargar (no compatible o cifrado).
      </span>
    )
  }

  // Location — WhatsApp-style: a map thumbnail with a pin, name + address below.
  if (m.type === "location") {
    const lat = p.latitude as number | undefined
    const lng = p.longitude as number | undefined
    const name = (p.name as string) || ""
    const addr = (p.address as string) || ""
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
    const maps = hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : "#"
    // Wikimedia static map (keyless, reliable). Falls back to a coords card if it fails.
    const thumb = hasCoords
      ? `https://maps.wikimedia.org/img/osm-intl,15,${lat},${lng},320x150.png`
      : null
    return (
      <a href={maps} target="_blank" rel="noopener noreferrer" className="-mx-1 block w-60 max-w-full overflow-hidden rounded-lg bg-background/40">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt="Map location"
            className="h-32 w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
          />
        ) : null}
        <span className="flex items-start gap-2 px-2.5 py-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-red-500" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{name || "Ubicación"}</span>
            {addr && <span className="line-clamp-2 text-[11px] opacity-70">{addr}</span>}
            {!name && !addr && hasCoords && <span className="text-[11px] opacity-70">{lat}, {lng}</span>}
          </span>
        </span>
      </a>
    )
  }

  // Rejected incoming call — WhatsApp couldn't be answered, so we auto-rejected
  // and auto-replied. Shown as a compact call-log row.
  if (m.type === "call") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <PhoneMissed className="size-4 shrink-0 text-red-500" />
        <span>{m.body || "📞 Llamada rechazada automáticamente"}</span>
      </span>
    )
  }

  // Contact — WhatsApp-style: avatar circle + name + phone.
  if (m.type === "contact") {
    const name = (p.displayName as string) || (p.name as string) || m.body || "Contacto"
    const phone = (p.phoneNumber as string) || (p.phone as string) || ""
    return (
      <div className="-mx-1 flex w-60 max-w-full flex-col gap-1.5 rounded-lg bg-background/40 p-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-foreground">
            {contactInitials(name)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            {phone && <span className="truncate text-[11px] opacity-70">{phone}</span>}
          </span>
          <ContactIcon className="ml-auto size-4 shrink-0 opacity-50" />
        </div>
        {phone && onStartChat && (
          <button
            onClick={() => onStartChat(phone)}
            className="rounded-md border border-current/20 py-1 text-center text-xs font-medium text-primary transition hover:bg-primary/10"
          >
            Mensaje
          </button>
        )}
      </div>
    )
  }

  const label =
    m.type === "image" ? { Icon: ImageIcon, text: "Photo" }
    : m.type === "video" ? { Icon: ImageIcon, text: "Video" }
    : m.type === "document" ? { Icon: FileText, text: (p.fileName as string) || "Document" }
    : m.type === "location" ? { Icon: MapPin, text: "Location" }
    : m.type === "poll" ? { Icon: BarChart3, text: (p.name as string) || "Poll" }
    : { Icon: FileText, text: m.type }
  const pollOptions = m.type === "poll" && Array.isArray(p.options) ? (p.options as string[]) : null
  // Media carries its data URI in mediaUrl (sent or downloaded).
  const src = m.mediaUrl ?? null
  const isImage = (m.type === "image" || m.type === "sticker") && src
  const isVideo = m.type === "video" && src
  const isAudio = m.type === "audio" && src
  const isDoc = m.type === "document" && src
  const fileName = (p.fileName as string) || "file"
  // Media types carry a binary; when mediaUrl is null the server couldn't
  // download/decrypt it (e.g. @lid contacts, transient network). Show a clear
  // "unavailable" state instead of a dead, unclickable box.
  const missingMedia = (m.type === "image" || m.type === "sticker" || m.type === "video" || m.type === "audio" || m.type === "document") && !src
  return (
    <div className="flex flex-col gap-1">
      {isImage ? (
        <ImageView src={src!} alt={fileName || cap || "image"} />
      ) : isVideo ? (
        <VideoView src={src!} />
      ) : isAudio ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio src={src!} controls className="w-56 max-w-full" />
      ) : isDoc ? (
        <a
          href={src!}
          download={fileName}
          className="flex items-center gap-2 rounded-md bg-background/40 px-2 py-1.5 transition hover:bg-background/60"
        >
          <FileText className="size-4 shrink-0 opacity-80" />
          <span className="truncate text-xs">{label.text}</span>
          <Download className="ml-auto size-3.5 shrink-0 opacity-70" />
        </a>
      ) : missingMedia ? (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="flex flex-col">
            <span className="truncate text-xs font-medium">{label.text}</span>
            <span className="text-[11px] text-muted-foreground">Archivo no disponible — no se pudo descargar</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md bg-background/40 px-2 py-1.5">
          <label.Icon className="size-4 shrink-0 opacity-80" />
          <span className="truncate text-xs">{label.text}</span>
        </div>
      )}
      {pollOptions && pollOptions.length > 0 && (
        <ul className="flex flex-col gap-1 pl-0.5">
          {pollOptions.map((o, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs">
              <span className="size-3 shrink-0 rounded-full border border-current opacity-50" />
              <span className="break-words">{o}</span>
            </li>
          ))}
        </ul>
      )}
      {cap && m.type !== "poll" ? <span className="whitespace-pre-wrap break-words text-sm">{cap}</span> : null}
    </div>
  )
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]
const ALL_REACTIONS = [
  "👍", "👎", "❤️", "🔥", "🥰", "😍", "😂", "🤣", "😊", "😇", "🙂", "😉", "😎", "😋",
  "😮", "😯", "😲", "🤯", "😱", "😨", "😢", "😭", "😡", "🤬", "🙄", "😏", "🤔", "🤨",
  "🥳", "🎉", "💯", "✅", "❌", "⭐", "🙏", "👏", "🙌", "💪", "👌", "✌️", "🤝", "🫶",
  "💔", "❤️‍🔥", "💚", "💙", "💜", "🧡", "💛", "🤍", "🖤", "💋", "🌹", "👀",
]

// Reactions + poll votes are events, not chat bubbles — render them centered.
function SystemLine({ m }: { m: InboxMessage }) {
  const text =
    m.type === "reaction"
      ? `${m.fromMe ? "You" : "They"} reacted ${m.body ?? ""}`
      : m.body ?? ""
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">{text}</span>
    </div>
  )
}

function ReactButton({ m, onReact }: { m: InboxMessage; onReact: (m: InboxMessage, emoji: string) => void }) {
  const [showAll, setShowAll] = React.useState(false)
  return (
    <DropdownMenu onOpenChange={(o) => !o && setShowAll(false)}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100" />}
      >
        <SmilePlus className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      {showAll ? (
        <DropdownMenuContent align={m.fromMe ? "end" : "start"} className="w-64 p-2 shadow-md">
          <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto">
            {ALL_REACTIONS.map((e, i) => (
              <button
                key={`${e}-${i}`}
                onClick={() => onReact(m, e)}
                className="rounded-md p-1 text-xl leading-none transition-transform hover:scale-125 hover:bg-muted"
                type="button"
              >
                {e}
              </button>
            ))}
          </div>
        </DropdownMenuContent>
      ) : (
        <DropdownMenuContent align={m.fromMe ? "end" : "start"} className="flex w-fit items-center gap-0.5 overflow-visible rounded-full p-1.5 shadow-md">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => onReact(m, e)}
              className="rounded-full p-1.5 text-xl leading-none transition-transform hover:scale-125 hover:bg-muted"
              type="button"
            >
              {e}
            </button>
          ))}
          <button
            onClick={(ev) => { ev.preventDefault(); setShowAll(true) }}
            className="ml-0.5 rounded-full bg-muted p-1.5 text-muted-foreground transition hover:bg-muted-foreground/20"
            type="button"
            title="Más emojis"
          >
            <Plus className="size-4" />
          </button>
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  )
}

function MsgMenu({ m, onForward }: { m: InboxMessage; onForward: (m: InboxMessage) => void }) {
  const canForward = m.type === "text" || m.type === "image" || m.type === "sticker" || m.type === "poll"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100" />}
      >
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={m.fromMe ? "end" : "start"}>
        {canForward && (
          <DropdownMenuItem onClick={() => onForward(m)}>
            <Forward className="mr-2 size-4" /> Reenviar
          </DropdownMenuItem>
        )}
        {m.body && (
          <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(m.body ?? "")}>
            <Copy className="mr-2 size-4" /> Copiar texto
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Bubble({
  m,
  onReact,
  onForward,
  onStartChat,
}: {
  m: InboxMessage
  onReact?: (m: InboxMessage, emoji: string) => void
  onForward?: (m: InboxMessage) => void
  onStartChat?: (phone: string) => void
}) {
  const isTextual = m.type === "text"
  return (
    <div className={cn("group flex items-center gap-1.5", m.fromMe ? "justify-end" : "justify-start")}>
      {m.fromMe && onForward && <MsgMenu m={m} onForward={onForward} />}
      {onReact && m.fromMe && <ReactButton m={m} onReact={onReact} />}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          m.fromMe
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {isTextual ? (
          <span className="whitespace-pre-wrap break-words">{m.body ?? ""}</span>
        ) : (
          <MediaBlock m={m} onStartChat={onStartChat} />
        )}
        <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", m.fromMe ? "text-primary-foreground/70" : "text-muted-foreground")}>
          <span>{clockTime(m.waTimestamp)}</span>
          {m.fromMe ? <Ticks status={m.status} /> : null}
        </div>
      </div>
      {onReact && !m.fromMe && <ReactButton m={m} onReact={onReact} />}
      {!m.fromMe && onForward && <MsgMenu m={m} onForward={onForward} />}
    </div>
  )
}

export function ThreadView({
  conversation,
  messages,
  loading,
  lockedBy,
  onAttentionChange,
  onReact,
  onForward,
  onStartChat,
  provider,
  children,
}: {
  conversation: Conversation
  messages: InboxMessage[]
  loading: boolean
  // Set when another agent has this chat EN_PROCESO: read-only for this user.
  lockedBy?: string | null
  onAttentionChange?: (a: AttentionStatus) => void
  onReact?: (m: InboxMessage, emoji: string) => void
  onForward?: (m: InboxMessage) => void
  onStartChat?: (phone: string) => void
  provider?: "baileys" | "meta" | null
  children: React.ReactNode // composer
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = React.useState(true)

  // newest-last for display (API returns newest-first). Hide undecryptable
  // placeholders ("unknown") — they're transient noise that decode on retry.
  const ordered = React.useMemo(
    () => [...messages].reverse().filter((m) => m.type !== "unknown"),
    [messages],
  )

  React.useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [ordered.length, atBottom])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const archived = !!conversation.sessionDeletedAt
  // Solved chats are write-locked until the customer writes again (auto-reopen)
  // or an owner/admin reopens them manually.
  const solvedLock = conversation.attention === "SOLUCIONADO"

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="size-8 shrink-0">
            {conversation.contact.avatarUrl ? <AvatarImage src={conversation.contact.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-[10px]">{contactInitials(conversation.contact.name)}</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-semibold text-foreground">{conversation.contact.name}</span>
          {provider && (
            <Badge
              variant="secondary"
              className={
                provider === "meta"
                  ? "shrink-0 border-transparent bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400"
                  : "shrink-0 border-transparent bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
              }
            >
              {provider === "meta" ? "Meta" : "BChat"}
            </Badge>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">· {conversation.sessionId}</span>
          {conversation.status === "RESOLVED" && <Badge variant="secondary" className="text-[10px]">Resuelto</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* who is handling this chat (null = AI bot) */}
          <Badge
            variant="secondary"
            className={cn(
              "hidden gap-1 border-transparent text-[10px] sm:inline-flex",
              conversation.assignedTo
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-violet-500/10 text-violet-600 dark:text-violet-400",
            )}
            title={conversation.assignedTo ? conversation.assignedTo.email : "Atendido por el bot de IA"}
          >
            {conversation.assignedTo ? <UserRound className="size-3" /> : <Bot className="size-3" />}
            {agentName(conversation.assignedTo)}
          </Badge>
          {/* attention state: static badge when solved (locked), selector otherwise */}
          {lockedBy ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                ATTENTION_CLASSES[conversation.attention ?? "EN_PROCESO"],
              )}
              title={`Chat a cargo de ${lockedBy} — solo lectura`}
            >
              <Lock className="size-3" />
              {ATTENTION_LABELS[conversation.attention ?? "EN_PROCESO"]}
            </span>
          ) : solvedLock ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                ATTENTION_CLASSES.SOLUCIONADO,
              )}
              title="Bloqueado — se reabrirá cuando el cliente escriba de nuevo"
            >
              <Lock className="size-3" />
              {ATTENTION_LABELS.SOLUCIONADO}
            </span>
          ) : onAttentionChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:opacity-80",
                      ATTENTION_CLASSES[conversation.attention ?? "PENDIENTE"],
                    )}
                    title="Cambiar estado de atención"
                  />
                }
              >
                {ATTENTION_LABELS[conversation.attention ?? "PENDIENTE"]}
                <ChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ATTENTION_ORDER.map((a) => (
                  <DropdownMenuItem key={a} onClick={() => onAttentionChange(a)} disabled={a === conversation.attention}>
                    <span className={cn("mr-2 size-2 rounded-full", ATTENTION_DOT[a])} />
                    {ATTENTION_LABELS[a]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                <Skeleton className="h-10 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Aún no hay mensajes en esta conversación.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {ordered.map((m) =>
              m.type === "reaction" || m.type === "poll_vote" ? (
                <SystemLine key={m.id} m={m} />
              ) : (
                <Bubble key={m.id} m={m} onReact={onReact} onForward={onForward} onStartChat={onStartChat} />
              ),
            )}
          </div>
        )}
        {!atBottom && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-3 right-4 size-9 rounded-full shadow"
            onClick={() => { setAtBottom(true) }}
          >
            <ChevronDown className="size-4" />
          </Button>
        )}
      </div>

      {/* composer / archived / solved banner */}
      {archived ? (
        <div className="border-t bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
          Sesión eliminada — esto es un archivo de solo lectura.
        </div>
      ) : solvedLock ? (
        <div className="border-t bg-emerald-500/5 px-4 py-3 text-center text-xs text-muted-foreground">
          ✅ Chat solucionado y bloqueado — se reabrirá automáticamente solo cuando el cliente escriba de nuevo.
        </div>
      ) : lockedBy ? (
        <div className="flex items-center justify-center gap-1.5 border-t bg-blue-500/5 px-4 py-3 text-center text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          Chat a cargo de <span className="font-medium text-foreground">{lockedBy}</span> — solo lectura.
          Podrás intervenir cuando vuelva a Pendiente.
        </div>
      ) : (
        children
      )}
    </div>
  )
}
