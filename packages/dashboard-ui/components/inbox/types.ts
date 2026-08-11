export type ConversationStatus = "OPEN" | "RESOLVED" | "SNOOZED"

// Agent attention workflow. PENDIENTE = the AI bot is the (implicit) first
// responder; EN_PROCESO = a human agent took over; ATENDIDO/SOLUCIONADO =
// closed by the agent (locks the assignment).
export type AttentionStatus = "PENDIENTE" | "EN_PROCESO" | "ATENDIDO" | "SOLUCIONADO"

export interface AssignedAgent {
  id: string
  email: string
  // "Nombre Apellido" when the profile is filled in
  name?: string | null
}

// One row of the "Atención realizada" trail. actor null = the AI bot / system.
export interface ConversationEvent {
  id: string
  type: "assigned" | "attention_changed" | "status_changed" | "reopened" | string
  detail: Record<string, unknown> | null
  createdAt: string
  actor: AssignedAgent | null
}

export interface InboxContact {
  id: string
  phone: string
  name: string
  savedName: string | null
  whatsappName: string | null
  avatarUrl: string | null
  // accumulated (average) customer rating across agents, 1–5 (null = not rated)
  rating: number | null
  ratingCount: number
}

export interface Conversation {
  id: string
  sessionId: string
  status: ConversationStatus
  lastMessageAt: string
  lastPreview: string | null
  unreadCount: number
  tags: string[]
  sessionDeletedAt: string | null
  // soft-deleted (hidden) by an admin; only shown in the "Archivados" view
  archived?: boolean
  notes?: string | null
  attention: AttentionStatus
  // null = the AI bot is handling this chat
  assignedTo: AssignedAgent | null
  // delegated to an agent group / department / location
  delegatedGroup: { id: string; name: string } | null
  // reserved (delegated) directly to a specific agent; the chat stays PENDIENTE
  // but is exclusive to this agent until taken over or released
  delegatedToUser: AssignedAgent | null
  contact: InboxContact
}

export interface DelegationGroup {
  id: string
  name: string
}

// A workspace agent that a chat can be delegated (reserved) to.
export interface DelegationAgent {
  id: string
  name: string
  email: string
  role: "OWNER" | "ADMIN" | "MEMBER"
}

// One inbox-bell entry: a chat delegated to a group I belong to, or reserved
// directly to me. For a direct reservation `groupName` holds the target agent's
// name and `note` the optional message the delegating agent attached.
export interface InboxNotification {
  id: string
  conversationId: string
  contactName: string
  groupId: string | null
  groupName: string | null
  note?: string | null
  // who delegated the chat
  actor: AssignedAgent | null
  createdAt: string
  seen: boolean
}

export type MessageDirection = "INBOUND" | "OUTBOUND"
export type DeliveryStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"

export interface InboxMessage {
  id: string
  conversationId: string
  waMessageId: string
  direction: MessageDirection
  type: string
  body: string | null
  mediaUrl: string | null
  payload: Record<string, unknown> | null
  status: DeliveryStatus
  fromMe: boolean
  waTimestamp: string
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}

// Outbound reply payloads sent to POST /api/inbox/conversations/:id/messages.
// `media` is a base64 data URI for image/document.
export type OutboundReply =
  | { kind: "text"; text: string }
  | { kind: "image"; media: string; caption?: string }
  | { kind: "document"; media: string; fileName: string; mimetype: string }
  | { kind: "poll"; pollName: string; options: string[]; selectableCount?: number }
  | { kind: "reaction"; targetMessageId: string; emoji: string; targetFromMe: boolean }
  | { kind: "location"; latitude: number; longitude: number; locationName?: string; address?: string }
  | { kind: "contact"; contactName: string; contactPhone: string }
  | { kind: "buttons"; text: string; footer: string; buttons: { id: string; text: string }[] }
  | {
      kind: "list"
      listTitle: string
      text: string
      buttonText: string
      sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
    }
  | { kind: "template"; templateName: string; languageCode: string; bodyParams?: string[] }
