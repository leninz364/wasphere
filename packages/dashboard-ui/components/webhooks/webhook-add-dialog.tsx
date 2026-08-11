"use client"

import * as React from "react"
import { toast } from "sonner"
import { Copy, Check, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import type { Webhook } from "@/components/webhooks/webhooks-tab"

// ─── Event groups ─────────────────────────────────────────────────────────────

const EVENT_GROUPS = [
  {
    label: "Messages",
    events: ["message.sent", "message.delivered", "message.read", "message.failed", "message.received"],
  },
  {
    label: "Sessions",
    events: ["session.connected", "session.disconnected", "session.qr", "session.failed"],
  },
  {
    label: "System",
    events: ["webhook.test"],
  },
] as const

const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events)

const EVENT_LABELS: Record<string, string> = {
  "message.sent": "Message Sent",
  "message.delivered": "Message Delivered",
  "message.read": "Message Read",
  "message.failed": "Message Failed",
  "message.received": "Message Received",
  "session.connected": "Session Connected",
  "session.disconnected": "Session Disconnected",
  "session.qr": "Session QR Code",
  "session.failed": "Session Failed",
  "webhook.test": "Test Event",
}

function eventLabel(ev: string): string {
  return EVENT_LABELS[ev] ?? ev.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Signing secret reveal ────────────────────────────────────────────────────

function SecretDisplay({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("No se pudo copiar.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          Este secreto de firma no se mostrará nuevamente. Cópialo ahora y guárdalo de forma segura.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-foreground">Secreto de firma</Label>
        <div className="flex items-center gap-2">
          <Input value={secret} readOnly className="font-mono text-xs" aria-label="Signing secret" />
          <Button variant="outline" size="icon" onClick={handleCopy} aria-label={copied ? "Copiado" : "Copiar"}>
            {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-zinc-400 font-light">
          Usa esto para verificar firmas HMAC-SHA256 en cargas útiles entrantes de webhooks.
        </p>
      </div>
      <DialogFooter>
        <Button onClick={onDone}>Ya lo guardé</Button>
      </DialogFooter>
    </div>
  )
}

// ─── Add dialog ───────────────────────────────────────────────────────────────

export interface WebhookAddDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (webhook: Webhook) => void
}

export function WebhookAddDialog({ open, onClose, onCreated }: WebhookAddDialogProps) {
  const [name, setName] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [bearerToken, setBearerToken] = React.useState("")
  const [urlError, setUrlError] = React.useState<string | null>(null)
  const [selectedEvents, setSelectedEvents] = React.useState<string[]>([])
  const [wildcard, setWildcard] = React.useState(false)
  const [pauseOnHumanTakeover, setPauseOnHumanTakeover] = React.useState(true)
  const [secretExpanded, setSecretExpanded] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [signingSecret, setSigningSecret] = React.useState<string | null>(null)

  const reset = () => {
    setName(""); setUrl(""); setBearerToken(""); setUrlError(null)
    setSelectedEvents([]); setWildcard(false); setPauseOnHumanTakeover(true)
    setSecretExpanded(false)
    setSubmitting(false); setError(null); setSigningSecret(null)
  }

  const handleClose = () => { reset(); onClose() }

  const validateUrl = (val: string) => {
    if (!val) { setUrlError(null); return }
    try {
      const parsed = new URL(val)
      if (parsed.protocol !== "https:") {
        setUrlError("La URL debe usar HTTPS.")
      } else {
        setUrlError(null)
      }
    } catch {
      setUrlError("Ingresa una URL válida.")
    }
  }

  const toggleEvent = (ev: string) =>
    setSelectedEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev])

  const handleWildcard = (checked: boolean) => {
    setWildcard(checked)
    setSelectedEvents(checked ? [...ALL_EVENTS] : [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (urlError) return
    const events = wildcard ? ["*"] : selectedEvents
    if (events.length === 0) { setError("Selecciona al menos un evento."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url,
          events,
          pauseOnHumanTakeover,
          ...(bearerToken.trim() && { bearerToken: bearerToken.trim() }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join("\n") : (data.message ?? "Failed to create webhook.")
        setError(msg); return
      }
      setSigningSecret(data.signingSecret ?? null)
      onCreated(data as Webhook)
    } catch {
      setError("No se pudo comunicar con el servidor.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{signingSecret ? "Webhook creado" : "Agregar Webhook"}</DialogTitle>
        </DialogHeader>

        {signingSecret ? (
          <SecretDisplay secret={signingSecret} onDone={handleClose} />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-name" className="text-sm font-medium text-foreground">Nombre</Label>
              <Input
                id="wh-name"
                placeholder="p. ej. Alertas de producción"
                className="placeholder:text-zinc-400 placeholder:font-light"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                required
                autoFocus
              />
            </div>

            {/* URL */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-url" className="text-sm font-medium text-foreground">URL</Label>
              <Input
                id="wh-url"
                placeholder="https://your-server.com/webhook"
                className="placeholder:text-zinc-400 placeholder:font-light"
                value={url}
                onChange={(e) => { setUrl(e.target.value); validateUrl(e.target.value) }}
                required
              />
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            </div>

            {/* Optional outbound authentication */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-bearer-token" className="text-sm font-medium text-foreground">
                Token de portador <span className="text-xs font-light text-zinc-400">(opcional)</span>
              </Label>
              <Input
                id="wh-bearer-token"
                type="password"
                autoComplete="off"
                placeholder="Token Bearer del receptor"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                maxLength={4096}
              />
              <p className="text-xs font-light text-zinc-400">
                Se cifra y se envía como Authorization: Bearer en cada entrega.
              </p>
            </div>

            {/* Events */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">Eventos</Label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <Checkbox
                    checked={wildcard}
                    onCheckedChange={(v) => handleWildcard(v === true)}
                  />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">Todos (*)</span>
                </label>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                {EVENT_GROUPS.map((group) => (
                  <div key={group.label} className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{group.label}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {group.events.map((ev) => (
                        <label key={ev} className="flex items-center gap-1.5 cursor-pointer select-none">
                          <Checkbox
                            checked={selectedEvents.includes(ev)}
                            onCheckedChange={() => toggleEvent(ev)}
                            disabled={wildcard}
                          />
                          <span className="text-xs text-zinc-700 dark:text-zinc-300">{eventLabel(ev)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hand-off to a human agent */}
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="wh-pause" className="text-sm font-medium text-foreground">
                  Pausar cuando atiende un humano
                </Label>
                <Switch
                  id="wh-pause"
                  checked={pauseOnHumanTakeover}
                  onCheckedChange={setPauseOnHumanTakeover}
                />
              </div>
              <p className="text-xs font-light text-zinc-400">
                Deja de enviar los mensajes de un chat en cuanto un agente lo toma (En proceso)
                o queda reservado para un agente, para que el bot no responda encima. Se reanuda
                cuando el chat vuelve a estar Pendiente y sin reservar.
              </p>
            </div>

            {/* Custom signing secret — collapsed toggle (field not yet in DTO, shown as info) */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setSecretExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/40 rounded-lg transition-colors"
              >
                <span>Secreto de firma personalizado <span className="text-zinc-400 font-light text-xs">(opcional)</span></span>
                {secretExpanded ? <ChevronUp className="size-4 text-zinc-400" /> : <ChevronDown className="size-4 text-zinc-400" />}
              </button>
              {secretExpanded && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Se genera automáticamente un secreto de firma único. Los secretos personalizados llegarán en una versión futura.
                  </p>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-destructive whitespace-pre-line">{error}</p>}

            <DialogFooter showCloseButton>
              <Button type="submit" disabled={submitting || !!urlError}>
                {submitting ? "Creando…" : "Crear Webhook"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
