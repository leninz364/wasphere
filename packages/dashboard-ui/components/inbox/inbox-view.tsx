"use client"

import * as React from "react"
import { toast } from "sonner"
import { Bell, Inbox as InboxIcon, PanelRight, ArrowLeft, Lock, PenSquare, Share2, Volume2, VolumeX, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { StatusDot } from "@/components/ui/status-dot"
import { StarRating } from "@/components/star-rating"
import { cn } from "@/lib/utils"
import { useInboxStream } from "@/lib/use-inbox-stream"
import { ConversationList } from "./conversation-list"
import { ThreadView } from "./thread-view"
import { Composer, type ComposerCapabilities } from "./composer"
import { ContactPanel } from "./contact-panel"
import { ForwardDialog } from "./forward-dialog"
import { relativeTime } from "./relative-time"
import type { AttentionStatus, Conversation, ConversationEvent, ConversationStatus, DelegationAgent, DelegationGroup, InboxMessage, InboxNotification, OutboundReply, Paginated } from "./types"
import { agentName, ATTENTION_LABELS } from "./attention"

const SOUND_KEY = "wasphere.inbox.soundEnabled"
const MUTED_KEY = "wasphere.inbox.mutedConversations"

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 660; o.type = "sine"
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    o.start(); o.stop(ctx.currentTime + 0.26)
  } catch { /* ignore */ }
}

export function InboxView({ initialConversations }: { initialConversations: Conversation[] }) {
  const [conversations, setConversations] = React.useState<Conversation[]>(initialConversations)
  const [listLoading, setListLoading] = React.useState(false)
  const [statusTab, setStatusTab] = React.useState<ConversationStatus>("OPEN")
  // Admin-only "Archivados" view: lists soft-deleted chats so they can be restored.
  const [archivedView, setArchivedView] = React.useState(false)
  // Chat pending archive confirmation (admin + SOLUCIONADO only).
  const [archiveTarget, setArchiveTarget] = React.useState<Conversation | null>(null)
  const [archiving, setArchiving] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Conversation | null>(null)
  const [messages, setMessages] = React.useState<InboxMessage[]>([])
  const [msgLoading, setMsgLoading] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [showContact, setShowContact] = React.useState(true)
  const [connected, setConnected] = React.useState(false)
  const [sound, setSound] = React.useState(true)
  const [mutedIds, setMutedIds] = React.useState<Set<string>>(new Set())
  const [sessions, setSessions] = React.useState<string[]>([])
  const [sessionFilter, setSessionFilter] = React.useState<string>("") // "" = all sessions (universal inbox)
  // Set once /api/sessions answers. That list is the live one, so it is
  // authoritative: a session id that survives only on old conversations (its
  // session was deleted or logged out) must NOT come back into the filter.
  // Conversation-derived ids are a fallback for when that call fails.
  const liveSessionsKnown = React.useRef(false)
  const [mobileContactOpen, setMobileContactOpen] = React.useState(false)
  const [capabilities, setCapabilities] = React.useState<ComposerCapabilities>(null)
  const [provider, setProvider] = React.useState<"baileys" | "meta" | null>(null)

  // Current user + role — needed for the EN_PROCESO/ATENDIDO exclusivity lock.
  // A chat is read-only for other MEMBER agents; OWNER/ADMIN bypass the lock
  // (they can reanudar/reasignar a chat a cargo de otro agente).
  const [me, setMe] = React.useState<string | null>(null)
  const [myRole, setMyRole] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { userId?: string } | null) => { if (!cancelled && d?.userId) setMe(d.userId) })
      .catch(() => { /* ignore */ })
    fetch("/api/team/my-role")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: string } | null) => { if (!cancelled && d?.role) setMyRole(d.role) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  // Delegation notifications (the bell): chats delegated to a group I belong to.
  const [notifications, setNotifications] = React.useState<InboxNotification[]>([])
  const [unseenCount, setUnseenCount] = React.useState(0)
  const loadNotifications = React.useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/notifications")
      if (!res.ok) return
      const data = (await res.json()) as { items?: InboxNotification[]; unseenCount?: number }
      setNotifications(data.items ?? [])
      setUnseenCount(data.unseenCount ?? 0)
    } catch { /* keep current */ }
  }, [])
  React.useEffect(() => { void loadNotifications() }, [loadNotifications])

  // New-chat (message a number that hasn't written first)
  const [newChatOpen, setNewChatOpen] = React.useState(false)
  const [ncSession, setNcSession] = React.useState("")
  const [ncPhone, setNcPhone] = React.useState("")
  const [ncText, setNcText] = React.useState("")
  const [ncSending, setNcSending] = React.useState(false)

  const selectedId = selected?.id ?? null
  const selectedIdRef = React.useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const mutedIdsRef = React.useRef(mutedIds)
  mutedIdsRef.current = mutedIds

  React.useEffect(() => {
    setSound(localStorage.getItem(SOUND_KEY) !== "false")
    try {
      const raw = localStorage.getItem(MUTED_KEY)
      if (raw) setMutedIds(new Set(JSON.parse(raw) as string[]))
    } catch { /* ignore */ }
  }, [])

  // Fill the session-filter dropdown from the LIVE sessions (Baileys + Meta), so
  // it shows every session even before any conversation exists on it — and only
  // those, so a deleted session stops appearing just because its old chats do.
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/sessions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Array<{ id: string }> | null) => {
        if (cancelled || !Array.isArray(data)) return
        liveSessionsKnown.current = true
        setSessions(data.map((s) => s.id).filter(Boolean))
      })
      .catch(() => { /* keep conversation-derived list */ })
    return () => { cancelled = true }
  }, [])

  // Load the selected conversation's provider capabilities so the composer can
  // hide what that provider can't do (e.g. polls on Meta) and show what it can.
  const selectedSessionId = selected?.sessionId ?? null
  React.useEffect(() => {
    if (!selectedSessionId) { setCapabilities(null); setProvider(null); return }
    let cancelled = false
    fetch(`/api/sessions/${encodeURIComponent(selectedSessionId)}/capabilities`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setCapabilities(d?.capabilities ?? null)
        setProvider(d?.provider === "meta" ? "meta" : d?.provider === "baileys" ? "baileys" : null)
      })
      .catch(() => { if (!cancelled) { setCapabilities(null); setProvider(null) } })
    return () => { cancelled = true }
  }, [selectedSessionId])

  const toggleMute = (convId: string, muted: boolean) => {
    setMutedIds((prev) => {
      const next = new Set(prev)
      if (muted) next.add(convId)
      else next.delete(convId)
      try { localStorage.setItem(MUTED_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  const refreshList = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true)
    const qs = new URLSearchParams({ status: statusTab, limit: "50" })
    if (archivedView) qs.set("archived", "true")
    if (search.trim()) qs.set("q", search.trim())
    if (sessionFilter) qs.set("sessionId", sessionFilter)
    try {
      const res = await fetch(`/api/inbox/conversations?${qs}`)
      const data = (await res.json()) as Paginated<Conversation>
      setConversations(data.items ?? [])
      // Fallback only: if /api/sessions never answered we have no live list, so
      // derive options from the sessions that have chats (universal inbox only,
      // so we never lose options). Once the live list is in, it wins.
      if (!liveSessionsKnown.current && !sessionFilter && !search.trim()) {
        setSessions((prev) => {
          const ids = new Set(prev)
          for (const c of data.items ?? []) ids.add(c.sessionId)
          return [...ids]
        })
      }
    } catch { /* keep current */ }
    finally { setListLoading(false) }
  }, [statusTab, search, sessionFilter, archivedView])

  // refetch list when tab or (debounced) search changes
  React.useEffect(() => {
    const t = setTimeout(() => { void refreshList() }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [refreshList, search])

  const loadMessages = React.useCallback(async (cid: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setMsgLoading(true)
    try {
      const res = await fetch(`/api/inbox/conversations/${cid}/messages?limit=50`)
      const data = (await res.json()) as Paginated<InboxMessage>
      setMessages(data.items ?? [])
    } catch { /* */ }
    finally { setMsgLoading(false) }
  }, [])

  // Agent groups (departments/locations) available for delegating chats.
  const [groups, setGroups] = React.useState<DelegationGroup[]>([])
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/team/groups")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Array<{ id: string; name: string }>) => {
        if (!cancelled && Array.isArray(d)) setGroups(d.map((g) => ({ id: g.id, name: g.name })))
      })
      .catch(() => { /* no groups available */ })
    return () => { cancelled = true }
  }, [])

  // Workspace agents available for delegating a chat directly to one person.
  const [agents, setAgents] = React.useState<DelegationAgent[]>([])
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/inbox/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: DelegationAgent[]) => {
        if (!cancelled && Array.isArray(d)) setAgents(d)
      })
      .catch(() => { /* no other agents available */ })
    return () => { cancelled = true }
  }, [])

  // "Atención realizada" trail of the selected conversation.
  const [events, setEvents] = React.useState<ConversationEvent[]>([])
  const loadEvents = React.useCallback(async (cid: string) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${cid}/events`)
      const data = (await res.json()) as { items?: ConversationEvent[] }
      setEvents(data.items ?? [])
    } catch { /* keep current */ }
  }, [])

  // This agent's own rating of the selected conversation's contact. The
  // accumulated average lives on conversation.contact.rating/ratingCount and is
  // refreshed here too (authoritative).
  const [ratingMine, setRatingMine] = React.useState<number | null>(null)
  const loadRating = React.useCallback(async (contactId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/rating`)
      if (!res.ok) return
      const d = (await res.json()) as { avg: number | null; count: number; myRating: number | null }
      setRatingMine(d.myRating ?? null)
      setSelected((s) => (s && s.contact.id === contactId ? { ...s, contact: { ...s.contact, rating: d.avg, ratingCount: d.count } } : s))
      setConversations((prev) => prev.map((c) => (c.contact.id === contactId ? { ...c, contact: { ...c.contact, rating: d.avg, ratingCount: d.count } } : c)))
    } catch { /* keep current */ }
  }, [])

  // Optional "rate the customer" prompt shown after marking a chat SOLUCIONADO.
  const [solveRating, setSolveRating] = React.useState<{ contactId: string; name: string } | null>(null)
  const [solveRatingValue, setSolveRatingValue] = React.useState(0)

  // Re-fetch the conversation so takeover/attention changes show up immediately.
  const refreshSelected = React.useCallback(async (cid: string) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${cid}`)
      if (!res.ok) return
      const fresh = (await res.json()) as Conversation
      setSelected((s) => (s && s.id === cid ? { ...s, ...fresh } : s))
      setConversations((prev) => prev.map((x) => (x.id === cid ? { ...x, ...fresh } : x)))
    } catch { /* keep current */ }
  }, [])

  const openConversation = React.useCallback(async (c: Conversation) => {
    setSelected(c)
    setEvents([])
    setRatingMine(null)
    void loadRating(c.contact.id)
    void loadMessages(c.id)
    void loadEvents(c.id)
    // Always mark read on open — it also performs the takeover ("se hace cargo
    // el agente que abre el chat") unless the chat is already ATENDIDO/SOLUCIONADO.
    await fetch(`/api/inbox/conversations/${c.id}/read`, { method: "POST" }).catch(() => null)
    setConversations((prev) => prev.map((x) => (x.id === c.id ? { ...x, unreadCount: 0 } : x)))
    void refreshSelected(c.id)
    void loadEvents(c.id)
  }, [loadMessages, loadEvents, refreshSelected, loadRating])

  // ── realtime ──────────────────────────────────────────────────────────────
  useInboxStream({
    onConnectionChange: setConnected,
    onMessageNew: (ev) => {
      void refreshList({ silent: true })
      const activeId = selectedIdRef.current
      if (ev.conversationId === activeId) {
        void loadMessages(activeId, { silent: true })
      } else if (
        sound &&
        !mutedIdsRef.current.has(ev.conversationId ?? "") &&
        document.visibilityState !== "visible"
      ) {
        beep()
      }
    },
    onConversationUpdate: (ev) => {
      void refreshList({ silent: true })
      const activeId = selectedIdRef.current
      if (activeId && ev.conversationId === activeId) {
        void refreshSelected(activeId)
        void loadEvents(activeId)
      }
    },
    onMessageStatus: () => {
      const activeId = selectedIdRef.current
      if (activeId) void loadMessages(activeId, { silent: true })
    },
    onDelegation: (ev) => {
      void loadNotifications()
      const p = (ev.payload ?? {}) as { actorName?: string; groupName?: string; toUserName?: string; note?: string | null; contactName?: string }
      const contact = p.contactName ?? "un contacto"
      const actor = p.actorName ?? "Un agente"
      if (p.toUserName) {
        // reserved directly to me
        toast.info(
          p.note
            ? `${actor} te asignó el chat de ${contact}: «${p.note}»`
            : `${actor} te asignó el chat de ${contact}`,
        )
      } else {
        toast.info(`${actor} delegó el chat de ${contact} a «${p.groupName ?? "tu grupo"}»`)
      }
      if (sound) beep()
    },
    onPollFallback: () => {
      void refreshList({ silent: true })
      void loadNotifications()
    },
  })

  const sendReply = async (reply: OutboundReply): Promise<boolean> => {
    if (!selected) return false
    setSending(true)
    try {
      const res = await fetch(`/api/inbox/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reply),
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string }
        toast.error(
          d?.message ?? (res.status === 503 ? "Sesión desconectada — reconéctate para enviar." : "No se pudo enviar la respuesta."),
        )
        return false
      }
      await loadMessages(selected.id, { silent: true })
      void refreshList({ silent: true })
      return true
    } catch {
      toast.error("No se pudo enviar la respuesta.")
      return false
    } finally {
      setSending(false)
    }
  }

  const openNewChat = () => {
    setNcSession((s) => s || sessionFilter || sessions[0] || "")
    setNewChatOpen(true)
  }

  // Start a chat with a number tapped from a shared contact card.
  const startChatWith = (phone: string) => {
    setNcSession((s) => s || selectedSessionId || sessions[0] || "")
    setNcPhone(phone.replace(/[^0-9]/g, ""))
    setNcText("")
    setNewChatOpen(true)
  }

  const startNewChat = async () => {
    const sessionId = ncSession || sessions[0]
    const phone = ncPhone.replace(/[^0-9]/g, "")
    const text = ncText.trim()
    if (!sessionId) { toast.error("Elige una sesión."); return }
    if (phone.length < 6) { toast.error("Ingresa un número válido con código de país."); return }
    if (!text) { toast.error("Escribe un mensaje."); return }
    setNcSending(true)
    try {
      const res = await fetch("/api/inbox/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, to: phone, text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(Array.isArray(data.message) ? data.message.join("\n") : (data.message ?? "No se pudo iniciar el chat."))
        return
      }
      toast.success("Mensaje enviado")
      setNewChatOpen(false); setNcPhone(""); setNcText("")
      await refreshList({ silent: true })
    } catch {
      toast.error("No se pudo conectar con el servidor.")
    } finally {
      setNcSending(false)
    }
  }

  const [forwardMsg, setForwardMsg] = React.useState<InboxMessage | null>(null)

  const reactToMessage = (m: InboxMessage, emoji: string) => {
    void sendReply({ kind: "reaction", targetMessageId: m.waMessageId, emoji, targetFromMe: m.fromMe })
  }

  // Set this agent's rating (0 clears). The customer's shown rating is the
  // accumulated average across agents — the endpoint returns the fresh average.
  const rateContact = async (rating: number, contactIdArg?: string) => {
    const contactId = contactIdArg ?? selected?.contact.id
    if (!contactId) return
    const prevMine = ratingMine
    setRatingMine(rating || null) // optimistic (own star)
    const res = await fetch(`/api/contacts/${contactId}/rating`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    }).catch(() => null)
    if (!res?.ok) {
      setRatingMine(prevMine)
      toast.error("No se pudo guardar la calificación.")
      return
    }
    const d = (await res.json().catch(() => null)) as { avg: number | null; count: number; myRating: number | null } | null
    if (d) {
      setRatingMine(d.myRating ?? null)
      setSelected((s) => (s && s.contact.id === contactId ? { ...s, contact: { ...s.contact, rating: d.avg, ratingCount: d.count } } : s))
      setConversations((prev) => prev.map((c) => (c.contact.id === contactId ? { ...c, contact: { ...c.contact, rating: d.avg, ratingCount: d.count } } : c)))
    }
  }

  const updateAttention = async (attention: AttentionStatus) => {
    if (!selected) return
    const res = await fetch(`/api/inbox/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attention }),
    }).catch(() => null)
    if (!res?.ok) {
      const d = (await res?.json().catch(() => ({}))) as { message?: string } | undefined
      toast.error(d?.message ?? "No se pudo cambiar el estado de atención.")
      return
    }
    const fresh = (await res.json().catch(() => null)) as Conversation | null
    if (fresh) {
      setSelected((s) => (s && s.id === fresh.id ? { ...s, ...fresh } : s))
      setConversations((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)))
    }
    void loadEvents(selected.id)
    void refreshList({ silent: true })
    toast.success(`Estado: ${ATTENTION_LABELS[attention]}`)
    // Marking SOLUCIONADO opens an optional prompt to rate the customer.
    if (attention === "SOLUCIONADO") {
      setSolveRatingValue(ratingMine ?? 0)
      setSolveRating({ contactId: selected.contact.id, name: selected.contact.name })
    }
  }

  const updateDelegation = async (groupId: string | null) => {
    if (!selected) return
    const res = await fetch(`/api/inbox/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delegatedGroupId: groupId }),
    }).catch(() => null)
    if (!res?.ok) {
      const d = (await res?.json().catch(() => ({}))) as { message?: string } | undefined
      toast.error(d?.message ?? "No se pudo delegar el chat.")
      return
    }
    const fresh = (await res.json().catch(() => null)) as Conversation | null
    if (fresh) {
      setSelected((s) => (s && s.id === fresh.id ? { ...s, ...fresh } : s))
      setConversations((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)))
    }
    void loadEvents(selected.id)
    void refreshList({ silent: true })
    const name = groupId ? groups.find((g) => g.id === groupId)?.name : null
    toast.success(name ? `Delegado a ${name}` : "Delegación eliminada")
  }

  const updateDelegationAgent = async (userId: string | null, note?: string) => {
    if (!selected) return
    const res = await fetch(`/api/inbox/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delegatedToUserId: userId, ...(note ? { delegationNote: note } : {}) }),
    }).catch(() => null)
    if (!res?.ok) {
      const d = (await res?.json().catch(() => ({}))) as { message?: string } | undefined
      toast.error(d?.message ?? "No se pudo delegar el chat.")
      return
    }
    const fresh = (await res.json().catch(() => null)) as Conversation | null
    if (fresh) {
      setSelected((s) => (s && s.id === fresh.id ? { ...s, ...fresh } : s))
      setConversations((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, ...fresh } : c)))
    }
    void loadEvents(selected.id)
    void refreshList({ silent: true })
    const name = userId ? agents.find((a) => a.id === userId)?.name : null
    toast.success(name ? `Delegado a ${name}` : "Delegación eliminada")
  }

  const toggleSound = () => {
    setSound((s) => {
      const v = !s
      localStorage.setItem(SOUND_KEY, v ? "true" : "false")
      return v
    })
  }

  // Open the chat a notification points to (fetching it if it isn't listed).
  const openNotification = React.useCallback(async (n: InboxNotification) => {
    const existing = conversations.find((c) => c.id === n.conversationId)
    if (existing) { void openConversation(existing); return }
    try {
      const res = await fetch(`/api/inbox/conversations/${n.conversationId}`)
      if (!res.ok) { toast.error("No se pudo abrir la conversación."); return }
      const convo = (await res.json()) as Conversation
      void openConversation(convo)
    } catch { toast.error("No se pudo abrir la conversación.") }
  }, [conversations, openConversation])

  // Opening the bell marks everything seen; the highlight persists until close.
  const onBellOpenChange = (open: boolean) => {
    if (open && unseenCount > 0) {
      void fetch("/api/inbox/notifications/seen", { method: "POST" }).catch(() => null)
      setUnseenCount(0)
    }
    if (!open) setNotifications((prev) => prev.map((n) => (n.seen ? n : { ...n, seen: true })))
  }

  // EN_PROCESO/ATENDIDO chats are exclusive to their agent: other MEMBER agents
  // see them read-only. OWNER/ADMIN bypass the lock (can reanudar/reasignar).
  const isPrivileged = myRole === "OWNER" || myRole === "ADMIN"
  const lockedBy = (() => {
    if (!selected || !me || isPrivileged) return null
    // Reserved (delegated) directly to another agent — exclusive to them, even
    // while PENDIENTE. Mirrors the backend's isLockedForUser rule.
    if (selected.delegatedToUser && selected.delegatedToUser.id !== me) {
      return agentName(selected.delegatedToUser)
    }
    // Actively handled or closed by another agent.
    if (
      (selected.attention === "EN_PROCESO" || selected.attention === "ATENDIDO") &&
      selected.assignedTo &&
      selected.assignedTo.id !== me
    ) {
      return agentName(selected.assignedTo)
    }
    return null
  })()

  // Archive (soft-delete) a SOLUCIONADO chat — admin only. Confirmed via dialog.
  const doArchive = async () => {
    const convo = archiveTarget
    if (!convo) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/inbox/conversations/${convo.id}/archive`, { method: "POST" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        toast.error(b.message ?? "No se pudo archivar el chat.")
        return
      }
      toast.success("Chat archivado.")
      setConversations((prev) => prev.filter((c) => c.id !== convo.id))
      if (selectedIdRef.current === convo.id) setSelected(null)
      setArchiveTarget(null)
    } catch { toast.error("No se pudo conectar con el servidor.") }
    finally { setArchiving(false) }
  }

  // Restore an archived chat back into the inbox — admin only.
  const doUnarchive = async (convo: Conversation) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${convo.id}/unarchive`, { method: "POST" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string }
        toast.error(b.message ?? "No se pudo restaurar el chat.")
        return
      }
      toast.success("Chat restaurado a la bandeja.")
      setConversations((prev) => prev.filter((c) => c.id !== convo.id))
      if (selectedIdRef.current === convo.id) setSelected(null)
    } catch { toast.error("No se pudo conectar con el servidor.") }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{archivedView ? "Archivados" : "Bandeja"}</h1>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <StatusDot status={connected ? "connected" : "connecting"} />
            {connected ? "en vivo" : "sondeando"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isPrivileged && (
            <Button
              variant={archivedView ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => { setSelected(null); setArchivedView((v) => !v) }}
              title={archivedView ? "Volver a la bandeja" : "Ver chats archivados"}
            >
              <Archive className="size-4" /> {archivedView ? "Ver bandeja" : "Archivados"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={openNewChat} title="Escribir a un número nuevo">
            <PenSquare className="size-4" /> Nuevo chat
          </Button>
          {/* delegation notifications (the bell) */}
          <DropdownMenu onOpenChange={onBellOpenChange}>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="relative size-8" title="Notificaciones de delegación" />
              }
            >
              <Bell className="size-4" />
              {unseenCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-white">
                  {unseenCount > 9 ? "9+" : unseenCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
              <div className="border-b px-3 py-2 text-xs font-semibold text-foreground">
                Chats delegados a ti o a tus grupos
              </div>
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Sin notificaciones — aquí verás los chats que te deleguen a ti o a tus grupos.
                </div>
              ) : (
                <ul className="max-h-80 overflow-y-auto py-1">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openNotification(n)}
                        className={cn(
                          "flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-muted",
                          !n.seen && "bg-primary/5",
                        )}
                      >
                        <Share2 className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-xs text-foreground">
                            <span className="font-medium">{agentName(n.actor)}</span>
                            {" delegó el chat de "}
                            <span className="font-medium">{n.contactName}</span>
                            {n.groupName ? <> a «{n.groupName}»</> : null}
                          </span>
                          {n.note ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] italic text-foreground">
                              “{n.note}”
                            </span>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(n.createdAt).toLocaleString()} · {relativeTime(n.createdAt)}
                          </span>
                        </span>
                        {!n.seen && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="size-8" onClick={toggleSound} title={sound ? "Silenciar sonido de notificaciones" : "Activar sonido de notificaciones"}>
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
          {selected && (
            <>
              {/* desktop: toggle the inline contact panel */}
              <Button variant="ghost" size="icon" className="hidden size-8 lg:inline-flex" onClick={() => setShowContact((v) => !v)} title="Mostrar/ocultar panel de contacto">
                <PanelRight className="size-4" />
              </Button>
              {/* mobile/tablet: open the contact panel as a slide-in sheet */}
              <Button variant="ghost" size="icon" className="size-8 lg:hidden" onClick={() => setMobileContactOpen(true)} title="Información del contacto">
                <PanelRight className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* panes */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
        {/* list — fixed width on desktop; full-width on mobile only when no chat is open */}
        <div className={cn("min-w-0 flex-col border-r md:flex md:w-80 md:shrink-0 md:flex-none", selected ? "hidden md:flex" : "flex flex-1")}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={openConversation}
            search={search}
            onSearch={setSearch}
            statusTab={statusTab}
            onStatusTab={setStatusTab}
            loading={listLoading}
            sessions={sessions}
            sessionFilter={sessionFilter}
            onSessionFilter={setSessionFilter}
          />
        </div>

        {/* thread */}
        <div className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")}>
          {selected ? (
            <ThreadView
              conversation={selected}
              messages={messages}
              loading={msgLoading}
              lockedBy={lockedBy}
              onAttentionChange={lockedBy ? undefined : updateAttention}
              onReact={lockedBy ? undefined : reactToMessage}
              onForward={setForwardMsg}
              onStartChat={startChatWith}
              provider={provider}
            >
              <>
                <div className="flex items-center gap-1 border-t px-2 py-1 md:hidden">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    <ArrowLeft className="mr-1 size-4" /> Atrás
                  </Button>
                </div>
                <Composer onSend={sendReply} sending={sending} sessionOffline={!!selected.sessionDeletedAt} capabilities={capabilities} sessionId={selected.sessionId} />
              </>
            </ThreadView>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-5 bg-muted/20 px-6 text-center">
              <div className="flex size-28 items-center justify-center rounded-full bg-primary/5">
                <InboxIcon className="size-14 text-primary/40" strokeWidth={1.5} />
              </div>
              <div className="max-w-md">
                <h2 className="text-2xl font-semibold text-foreground">Bandeja de BChat</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Selecciona una conversación para empezar a chatear. Envía y recibe textos,
                  medios y encuestas de WhatsApp — todo desde tu panel, en tiempo real.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                <Lock className="size-3" />
                Cifrado de extremo a extremo por WhatsApp
              </div>
            </div>
          )}
        </div>

        {/* contact panel (desktop) */}
        {selected && showContact && (
          <div className="hidden w-72 shrink-0 border-l lg:flex">
            <ContactPanel
              conversation={selected}
              recent={messages}
              events={events}
              groups={groups}
              agents={agents}
              onDelegate={lockedBy ? undefined : updateDelegation}
              onDelegateAgent={lockedBy ? undefined : updateDelegationAgent}
              onRateContact={rateContact}
              myRating={ratingMine}
              onArchive={isPrivileged && !archivedView && selected.attention === "SOLUCIONADO" ? () => setArchiveTarget(selected) : undefined}
              onUnarchive={isPrivileged && (archivedView || selected.archived) ? () => void doUnarchive(selected) : undefined}
            />
          </div>
        )}
      </div>

      <ForwardDialog
        message={forwardMsg}
        conversations={conversations}
        currentId={selectedId}
        onClose={() => setForwardMsg(null)}
      />

      {/* Optional rating prompt after marking a chat SOLUCIONADO */}
      <Dialog open={!!solveRating} onOpenChange={(o) => !o && setSolveRating(null)}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Chat solucionado</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-center text-sm text-muted-foreground">
              ¿Deseas calificar a <span className="font-medium text-foreground">{solveRating?.name}</span>? Es opcional y se suma a la calificación de los demás agentes.
            </p>
            <StarRating value={solveRatingValue} onChange={setSolveRatingValue} size={30} />
            <span className="text-xs text-muted-foreground">{solveRatingValue ? `${solveRatingValue}/5` : "Sin calificar"}</span>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSolveRating(null)}>Omitir</Button>
            <Button
              disabled={!solveRatingValue}
              onClick={() => {
                if (solveRating) void rateContact(solveRatingValue, solveRating.contactId)
                setSolveRating(null)
              }}
            >
              Guardar calificación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm archive (soft-delete) — admin only */}
      <Dialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Archivar chat</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-2 py-1">
            <p className="text-sm text-muted-foreground">
              El chat de <span className="font-medium text-foreground">{archiveTarget?.contact.name}</span> se ocultará de la bandeja.
            </p>
            <p className="text-xs text-muted-foreground">
              No se borra nada: el historial y la calificación se conservan, y el chat reaparece automáticamente si el cliente vuelve a escribir. Puedes restaurarlo desde «Archivados».
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveTarget(null)}>Cancelar</Button>
            <Button disabled={archiving} onClick={() => void doArchive()}>
              {archiving ? "Archivando…" : "Archivar chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New chat — message a number that hasn't written first */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo chat</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            {sessions.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nc-session">Enviar desde</Label>
                <select
                  id="nc-session"
                  value={ncSession}
                  onChange={(e) => setNcSession(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {sessions.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nc-phone">Número de teléfono (con código de país)</Label>
              <Input id="nc-phone" value={ncPhone} placeholder="593991234567" onChange={(e) => setNcPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nc-text">Mensaje</Label>
              <Textarea id="nc-text" value={ncText} rows={3} maxLength={4096} placeholder="Escribe tu primer mensaje…" onChange={(e) => setNcText(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Nota: en una sesión de Meta, escribir a un número nuevo fuera de la ventana de 24 horas requiere una plantilla aprobada.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => void startNewChat()} disabled={ncSending}>
              {ncSending ? "Enviando…" : "Enviar mensaje"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* mobile/tablet contact panel (slide-in) */}
      <Sheet open={mobileContactOpen} onOpenChange={setMobileContactOpen}>
        <SheetContent side="right" className="w-[88%] max-w-sm gap-0 p-0 lg:hidden">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">Información del contacto</SheetTitle>
          </SheetHeader>
          {selected && (
            <ContactPanel
              conversation={selected}
              recent={messages}
              events={events}
              groups={groups}
              agents={agents}
              onDelegate={lockedBy ? undefined : updateDelegation}
              onDelegateAgent={lockedBy ? undefined : updateDelegationAgent}
              onRateContact={rateContact}
              myRating={ratingMine}
              onArchive={isPrivileged && !archivedView && selected.attention === "SOLUCIONADO" ? () => setArchiveTarget(selected) : undefined}
              onUnarchive={isPrivileged && (archivedView || selected.archived) ? () => void doUnarchive(selected) : undefined}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
