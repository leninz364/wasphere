"use client"

import * as React from "react"
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

export interface WebhookEditDialogProps {
  webhook: Webhook | null
  open: boolean
  onClose: () => void
  onUpdated: (webhook: Webhook) => void
}

export function WebhookEditDialog({ webhook, open, onClose, onUpdated }: WebhookEditDialogProps) {
  const [name, setName] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [urlError, setUrlError] = React.useState<string | null>(null)
  const [selectedEvents, setSelectedEvents] = React.useState<string[]>([])
  const [wildcard, setWildcard] = React.useState(false)
  const [isActive, setIsActive] = React.useState(true)
  const [pauseOnHumanTakeover, setPauseOnHumanTakeover] = React.useState(true)
  const [useBearerAuth, setUseBearerAuth] = React.useState(false)
  const [bearerToken, setBearerToken] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!webhook) return
    setName(webhook.name)
    setUrl(webhook.url)
    setUrlError(null)
    setIsActive(webhook.isActive)
    setPauseOnHumanTakeover(webhook.pauseOnHumanTakeover)
    setUseBearerAuth(webhook.hasBearerToken)
    setBearerToken("")
    setError(null)
    if (webhook.events.length === 1 && webhook.events[0] === "*") {
      setWildcard(true)
      setSelectedEvents([...ALL_EVENTS])
    } else {
      setWildcard(false)
      setSelectedEvents(webhook.events)
    }
  }, [webhook])

  const validateUrl = (val: string) => {
    if (!val) { setUrlError(null); return }
    try {
      const parsed = new URL(val)
      setUrlError(parsed.protocol !== "https:" ? "La URL debe usar HTTPS." : null)
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
    if (!webhook) return
    setError(null)
    if (urlError) return
    const events = wildcard ? ["*"] : selectedEvents
    if (events.length === 0) { setError("Selecciona al menos un evento."); return }
    if (useBearerAuth && !webhook.hasBearerToken && !bearerToken.trim()) {
      setError("Ingresa el token de portador."); return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          url,
          events,
          isActive,
          pauseOnHumanTakeover,
          ...(bearerToken.trim() && { bearerToken: bearerToken.trim() }),
          clearBearerToken: !useBearerAuth && webhook.hasBearerToken,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join("\n") : (data.message ?? "No se pudo actualizar el webhook.")
        setError(msg); return
      }
      onUpdated(data as Webhook)
      onClose()
    } catch {
      setError("No se pudo comunicar con el servidor.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!webhook) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Webhook</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-wh-name" className="text-sm font-medium text-foreground">Nombre</Label>
            <Input
              id="edit-wh-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              required
              className="placeholder:text-zinc-400 placeholder:font-light"
            />
          </div>

          {/* URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-wh-url" className="text-sm font-medium text-foreground">URL</Label>
            <Input
              id="edit-wh-url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); validateUrl(e.target.value) }}
              required
              className="placeholder:text-zinc-400 placeholder:font-light"
            />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>

          {/* Optional outbound authentication */}
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-wh-bearer-enabled" className="text-sm font-medium text-foreground">
                Autenticación Bearer
              </Label>
              <Switch
                id="edit-wh-bearer-enabled"
                checked={useBearerAuth}
                onCheckedChange={setUseBearerAuth}
              />
            </div>
            {useBearerAuth && (
              <>
                <Input
                  id="edit-wh-bearer-token"
                  type="password"
                  autoComplete="off"
                  placeholder={webhook.hasBearerToken ? "Dejar en blanco para mantener el token almacenado" : "Token Bearer del receptor"}
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  maxLength={4096}
                />
                <p className="text-xs font-light text-zinc-400">
                  El token se guarda cifrado y nunca se devuelve al navegador.
                </p>
              </>
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-wh-active" className="text-sm font-medium text-foreground">Activo</Label>
            <Switch id="edit-wh-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Hand-off to a human agent */}
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-wh-pause" className="text-sm font-medium text-foreground">
                Pausar cuando atiende un humano
              </Label>
              <Switch
                id="edit-wh-pause"
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

          {/* Events */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">Eventos</Label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <Checkbox checked={wildcard} onCheckedChange={(v) => handleWildcard(v === true)} />
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

          {error && <p className="text-xs text-destructive whitespace-pre-line">{error}</p>}

          <DialogFooter showCloseButton>
            <Button type="submit" disabled={submitting || !!urlError}>
              {submitting ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
