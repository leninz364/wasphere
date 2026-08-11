"use client"

import * as React from "react"
import { toast } from "sonner"
import { Copy, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { ApiError } from "@/components/ui/api-error"
import { StatusDot } from "@/components/ui/status-dot"
import { SessionsIllustration } from "@/components/empty-states"
import { NewSessionDialog } from "@/components/sessions/new-session-dialog"
import { QrDialog } from "@/components/sessions/qr-dialog"

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      aria-label={copied ? "Copiado" : "Copiar ID de sesión"}
      title={copied ? "¡Copiado!" : "Copiar ID de sesión"}
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  )
}

export interface Session {
  id: string
  status: string
  phoneNumber?: string | null
  name?: string | null
  connectedAt?: string | null
  proxy?: string | null
  config?: { provider?: string | null } | null
}

interface MetaSetup {
  callbackUrl: string
  verifyToken: string
}

/** Meta Cloud API sessions have no QR — never offer Baileys "Relink" for them. */
function isMetaSession(session: Session): boolean {
  return session.config?.provider === "meta"
}

interface SessionsTableProps {
  initialSessions: Session[]
}

function statusClassName(status: string): string {
  switch (status) {
    case "connected":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-transparent"
    case "qr_ready":
    case "connecting":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent"
    case "failed":
    case "qr_expired":
    case "disconnected":
    case "logged_out":
    default:
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-transparent"
  }
}

// Etiquetas visibles por estado — los valores internos ("connected", …) no cambian.
const STATUS_LABELS: Record<string, string> = {
  connected: "Conectada",
  connecting: "Conectando",
  qr_ready: "QR listo",
  qr_expired: "QR expirado",
  disconnected: "Desconectada",
  logged_out: "Sesión cerrada",
  failed: "Fallida",
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function SessionsTable({ initialSessions }: SessionsTableProps) {
  const [sessions, setSessions] = React.useState<Session[]>(initialSessions)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = React.useState(false)
  const [qrSessionId, setQrSessionId] = React.useState<string | null>(null)
  const [metaSetup, setMetaSetup] = React.useState<MetaSetup | null>(null)

  const refreshSessions = async () => {
    try {
      const res = await fetch("/api/sessions")
      if (!res.ok) {
        setFetchError("No se pudieron cargar las sesiones. Revisa tu conexión e inténtalo de nuevo.")
        return
      }
      setFetchError(null)
      const data = await res.json()
      const list: Session[] = Array.isArray(data)
        ? data
        : (data.sessions ?? [])
      setSessions(list)
    } catch {
      setFetchError("Could not load sessions. Check your connection and try again.")
    }
  }

  const handleLogout = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/logout`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.message ?? "No se pudo cerrar la sesión.")
        return
      }
      // Refresh list to show updated status.
      await refreshSessions()
    } catch {
      toast.error("No se pudo conectar con el servidor.")
    }
  }

  const handleDelete = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      })
      // 404 means already gone on wa-server — treat as success
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.message ?? "No se pudo eliminar.")
        return
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {
      toast.error("No se pudo conectar con el servidor.")
    }
  }

  const handleSessionCreated = (newSession: Session) => {
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === newSession.id)
      return exists
        ? prev.map((s) => (s.id === newSession.id ? newSession : s))
        : [newSession, ...prev]
    })
    if (!isMetaSession(newSession)) setQrSessionId(newSession.id)
  }

  const handleRelink = async (sessionId: string) => {
    // Relink = delete + recreate via QR. Baileys only — a Meta session would be
    // silently rebuilt as a QR/Baileys session, losing its Cloud API config.
    if (sessions.find((s) => s.id === sessionId && isMetaSession(s))) {
      toast.error("Las sesiones de Meta no usan QR. Elimínala y créala de nuevo con tus credenciales de Cloud API.")
      return
    }
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" })
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.message ?? "No se pudo reiniciar la sesión.")
        return
      }
      const updated: Session = await res.json()
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...updated } : s))
      )
      setQrSessionId(sessionId)
    } catch {
      toast.error("No se pudo conectar con el servidor.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sesiones</h1>
        <Button onClick={() => setNewDialogOpen(true)}>Nueva sesión</Button>
      </div>

      {fetchError && (
        <ApiError
          message={fetchError}
          onRetry={() => void refreshSessions()}
        />
      )}

      {!fetchError && sessions.length === 0 ? (
        <EmptyState
          illustration={<SessionsIllustration />}
          message="Aún no hay sesiones."
          description="Crea una sesión para conectar una cuenta de WhatsApp."
        />
      ) : !fetchError && (
        <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Sesión</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Teléfono</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Conectada el</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Proxy</TableHead>
              <TableHead className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id} className="hover:bg-muted/40 hover:-translate-y-px hover:shadow-sm transition-all duration-150 ease-out">
                <TableCell className="text-sm font-medium text-foreground font-mono">
                  <span className="flex items-center gap-0 max-w-[220px]">
                    <span className="min-w-0 truncate" title={session.id}>{session.id}</span>
                    <span className="shrink-0"><CopyButton value={session.id} /></span>
                  </span>
                </TableCell>
                <TableCell className="text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">{session.phoneNumber ?? "—"}</TableCell>
                <TableCell>
                  <Badge className={`${statusClassName(session.status)} flex items-center gap-1.5`}>
                    <StatusDot status={session.status} />
                    {STATUS_LABELS[session.status] ?? session.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-zinc-400 font-light tabular-nums">{formatDate(session.connectedAt)}</TableCell>
                <TableCell className="font-mono text-xs">
                  <span className="block max-w-[160px] truncate" title={session.proxy ?? undefined}>
                    {session.proxy ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {(session.status === "qr_ready" || session.status === "connecting") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setQrSessionId(session.id)}
                      >
                        Ver QR
                      </Button>
                    )}
                    {!isMetaSession(session) && (session.status === "failed" || session.status === "disconnected" || session.status === "logged_out" || session.status === "qr_expired") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRelink(session.id)}
                      >
                        Reconectar
                      </Button>
                    )}
                    {session.status === "connected" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLogout(session.id)}
                      >
                        Cerrar sesión
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(session.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <NewSessionDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        onCreated={(session) => {
          setNewDialogOpen(false)
          if (session.metaSetup && typeof session.metaSetup === "object") {
            setMetaSetup(session.metaSetup as MetaSetup)
          }
          handleSessionCreated(session as Session)
        }}
      />

      <MetaSetupDialog setup={metaSetup} onClose={() => setMetaSetup(null)} />

      {qrSessionId && (
        <QrDialog
          open={qrSessionId !== null}
          sessionId={qrSessionId}
          onClose={() => setQrSessionId(null)}
          onConnected={() => {
            setQrSessionId(null)
            refreshSessions()
          }}
        />
      )}
    </div>
  )
}

function MetaSetupDialog({ setup, onClose }: { setup: MetaSetup | null; onClose: () => void }) {
  if (!setup) return null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Finaliza la conexión en Meta</DialogTitle>
          <DialogDescription>
            Copia estos dos valores en WhatsApp &gt; Configuración &gt; Webhooks y suscríbete al campo messages.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <MetaSetupValue label="URL de callback" value={setup.callbackUrl} />
          <MetaSetupValue label="Verify Token" value={setup.verifyToken} />
          <p className="text-xs text-muted-foreground">
            El Verify Token se muestra una sola vez. Guárdalo antes de cerrar esta ventana.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetaSetupValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">{value}</code>
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copiar ${label}`}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
    </div>
  )
}
