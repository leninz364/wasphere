"use client"

import * as React from "react"
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/
const META_DOCS = "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"

type Provider = "baileys" | "meta"

interface NewSession {
  id: string
  status: string
  metaSetup?: {
    callbackUrl: string
    verifyToken: string
  }
  [key: string]: unknown
}

export interface NewSessionDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (session: NewSession) => void
}

const PROVIDERS: { value: Provider; title: string; tradeoff: string }[] = [
  {
    value: "baileys",
    title: "Baileys",
    tradeoff: "No oficial · gratis · escanea un QR. Funciones completas: grupos, encuestas, todos los medios.",
  },
  {
    value: "meta",
    title: "Meta Cloud API",
    tradeoff: "Oficial · pago por conversación · sin riesgo de bloqueo. Plantillas y botones; sin grupos/encuestas.",
  },
]

function generateVerifyToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function NewSessionDialog({ open, onClose, onCreated }: NewSessionDialogProps) {
  const [provider, setProvider] = React.useState<Provider>("baileys")
  const [sessionId, setSessionId] = React.useState("")
  const [proxy, setProxy] = React.useState("")

  const [phoneNumberId, setPhoneNumberId] = React.useState("")
  const [accessToken, setAccessToken] = React.useState("")
  const [wabaId, setWabaId] = React.useState("")
  const [verifyToken, setVerifyToken] = React.useState("")
  const [appSecret, setAppSecret] = React.useState("")

  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [serverError, setServerError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const [test, setTest] = React.useState<{ state: "idle" | "testing" | "ok" | "error"; message?: string }>({ state: "idle" })
  const [copied, setCopied] = React.useState(false)
  const [verifyCopied, setVerifyCopied] = React.useState(false)
  const [webhookBase, setWebhookBase] = React.useState<string | null>(null)
  const [metaEnabled, setMetaEnabled] = React.useState<boolean | null>(null)

  const isMeta = provider === "meta"
  const metaReady = metaEnabled === true && Boolean(webhookBase?.startsWith("https://"))

  // Pull the wa-server's public URL so we can show the real callback URL.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch("/api/meta/webhook-base")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setWebhookBase(typeof d?.base === "string" ? d.base : null)
        setMetaEnabled(d?.enabled === true)
      })
      .catch(() => {
        if (!cancelled) {
          setWebhookBase(null)
          setMetaEnabled(false)
        }
      })
    setVerifyToken((current) => current || generateVerifyToken())
    return () => { cancelled = true }
  }, [open])

  const reset = () => {
    setProvider("baileys")
    setSessionId("")
    setProxy("")
    setPhoneNumberId("")
    setAccessToken("")
    setWabaId("")
    setVerifyToken(generateVerifyToken())
    setAppSecret("")
    setValidationError(null)
    setServerError(null)
    setSubmitting(false)
    setTest({ state: "idle" })
    setCopied(false)
    setVerifyCopied(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const callbackBase = webhookBase ?? "https://<your-wa-server>"
  const callbackUrl = `${callbackBase}/api/meta/webhook/${sessionId || "<session-id>"}`

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const copyVerifyToken = async () => {
    try {
      await navigator.clipboard.writeText(verifyToken)
      setVerifyCopied(true)
      setTimeout(() => setVerifyCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const testConnection = async () => {
    setTest({ state: "testing" })
    try {
      const res = await fetch("/api/sessions/meta-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId, accessToken }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setTest({ state: "ok", message: data.verifiedName ? `Verificado: ${data.verifiedName}` : "Conexión correcta" })
      } else {
        setTest({ state: "error", message: data.error ?? data.message ?? "La conexión falló" })
      }
    } catch {
      setTest({ state: "error", message: "No se pudo conectar con el servidor." })
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setValidationError(null)
    setServerError(null)

    if (!SESSION_ID_REGEX.test(sessionId)) {
      setValidationError("El ID de sesión debe tener 1–64 caracteres: letras, números, guiones y guiones bajos.")
      return
    }
    if (isMeta && !metaReady) {
      setValidationError("Meta Cloud API requiere habilitar el proveedor y configurar una URL pública HTTPS.")
      return
    }
    if (isMeta && (!phoneNumberId.trim() || !accessToken.trim() || !appSecret.trim())) {
      setValidationError("Phone Number ID, Access Token y App Secret son obligatorios para Meta Cloud API.")
      return
    }

    if (isMeta && test.state !== "ok") {
      setValidationError("Prueba las credenciales correctamente antes de crear la sesión.")
      return
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { id: sessionId }
      if (isMeta) {
        body.provider = "meta"
        body.metaPhoneNumberId = phoneNumberId.trim()
        body.metaAccessToken = accessToken.trim()
        if (wabaId.trim()) body.metaWabaId = wabaId.trim()
        if (verifyToken.trim()) body.metaVerifyToken = verifyToken.trim()
        if (appSecret.trim()) body.metaAppSecret = appSecret.trim()
      } else if (proxy.trim()) {
        body.proxy = proxy.trim()
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? (data.message as string[]).join("\n")
          : (data.message ?? "No se pudo crear la sesión.")
        setServerError(msg)
        return
      }
      const created = data as NewSession
      if (isMeta) created.metaSetup = { callbackUrl, verifyToken }
      reset()
      onCreated(created)
    } catch {
      setServerError("No se pudo conectar con el servidor.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent
        showCloseButton
        className={cn("max-h-[88vh] overflow-y-auto", isMeta ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        <DialogHeader>
          <DialogTitle>Nueva sesión</DialogTitle>
          <DialogDescription>Elige un motor y conecta un número de WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Provider — two side-by-side cards */}
          <RadioGroup
            value={provider}
            onValueChange={(v) => setProvider(v as Provider)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {PROVIDERS.map((p) => (
              <label
                key={p.value}
                htmlFor={`provider-${p.value}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3.5 transition-colors hover:bg-muted/40 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
              >
                <RadioGroupItem id={`provider-${p.value}`} value={p.value} className="mt-0.5" />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">{p.title}</span>
                  <span className="text-xs text-muted-foreground leading-snug">{p.tradeoff}</span>
                </span>
              </label>
            ))}
          </RadioGroup>

          {/* Session ID */}
          <Field id="session-id" label="ID de sesión">
            <Input
              id="session-id"
              placeholder="my-session-1"
              className="placeholder:text-zinc-400 placeholder:font-light"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              autoFocus
            />
            {validationError && <p className="text-xs text-destructive">{validationError}</p>}
          </Field>

          {provider === "baileys" ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <Field id="proxy-url" label={<>URL de proxy <span className="text-zinc-400 font-light">(opcional)</span></>}>
                <Input
                  id="proxy-url"
                  placeholder="socks5://10.0.0.5:1080"
                  className="placeholder:text-zinc-400 placeholder:font-light"
                  value={proxy}
                  onChange={(e) => setProxy(e.target.value)}
                />
              </Field>
              {serverError && <p className="text-xs text-destructive whitespace-pre-line">{serverError}</p>}
              <DialogFooter showCloseButton>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creando…" : "Crear sesión"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col gap-5">
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-snug">
                Ingresa tus credenciales de Meta Cloud API, prueba la conexión y luego crea la sesión.
                Después de crearla, pega la URL de callback de abajo en la configuración de webhooks de tu app de Meta.{" "}
                <a href={META_DOCS} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                  Guía de configuración de Meta <ExternalLink className="size-3" />
                </a>
              </p>

              {metaEnabled === false && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Meta Cloud API está desactivado en este servidor. Define <code>META_PROVIDER_ENABLED=true</code> y reconstruye los servicios.
                </p>
              )}
              {metaEnabled === true && !webhookBase?.startsWith("https://") && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Falta una URL pública HTTPS. Define <code>WA_SERVER_PUBLIC_URL=https://tu-dominio</code> antes de crear la sesión.
                </p>
              )}

              {/* Credentials — two columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                <Field id="meta-pnid" label="Phone Number ID">
                  <Input id="meta-pnid" placeholder="123456789012345" className="placeholder:text-zinc-400 placeholder:font-light" value={phoneNumberId} onChange={(e) => { setPhoneNumberId(e.target.value); setTest({ state: "idle" }) }} />
                </Field>
                <Field id="meta-token" label="Access Token permanente" className="sm:col-span-2">
                  <Input id="meta-token" type="password" autoComplete="off" placeholder="EAAG…" className="placeholder:text-zinc-400 placeholder:font-light" value={accessToken} onChange={(e) => { setAccessToken(e.target.value); setTest({ state: "idle" }) }} />
                </Field>
                <Field id="meta-secret" label="App Secret" className="sm:col-span-2">
                  <Input id="meta-secret" type="password" autoComplete="off" placeholder="para verificar la firma del webhook" className="placeholder:text-zinc-400 placeholder:font-light" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
                </Field>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-sm font-medium text-foreground">Validar</Label>
                  <div className="flex h-9 items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={test.state === "testing" || !phoneNumberId.trim() || !accessToken.trim()}>
                      {test.state === "testing" && <Loader2 className="size-3.5 animate-spin" />}
                      Probar conexión
                    </Button>
                    {test.state === "ok" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-500"><Check className="size-3.5" /> {test.message}</span>
                    )}
                    {test.state === "error" && <span className="text-xs text-destructive leading-tight">{test.message}</span>}
                  </div>
                </div>
              </div>

              <details className="rounded-md border border-input px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground">Opciones avanzadas</summary>
                <div className="mt-3">
                  <Field id="meta-waba" label={<>WABA ID <span className="text-zinc-400 font-light">(solo plantillas y Flows)</span></>}>
                    <Input id="meta-waba" placeholder="987654321098765" className="placeholder:text-zinc-400 placeholder:font-light" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
                  </Field>
                </div>
              </details>

              {/* Callback URL — full width */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm font-medium text-foreground">URL de callback del webhook</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-input bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">{callbackUrl}</code>
                  <Button type="button" variant="outline" size="icon" onClick={copyCallback} aria-label="Copiar URL de callback">
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <Label className="mt-2 text-sm font-medium text-foreground">Verify Token generado</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-input bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">{verifyToken}</code>
                  <Button type="button" variant="outline" size="icon" onClick={copyVerifyToken} aria-label="Copiar Verify Token">
                    {verifyCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {webhookBase ? (
                    <>Después de crear la sesión, pega ambos valores en Meta y suscríbete al campo <code>messages</code>. Volverán a mostrarse una sola vez en el paso final.</>
                  ) : (
                    <>Configura <code>WA_SERVER_PUBLIC_URL</code> con una URL HTTPS pública para continuar.</>
                  )}
                </p>
              </div>

              {serverError && <p className="text-xs text-destructive whitespace-pre-line">{serverError}</p>}
              <DialogFooter showCloseButton>
                <Button type="button" onClick={() => handleSubmit()} disabled={submitting || !metaReady || test.state !== "ok" || !appSecret.trim()}>
                  {submitting ? "Creando…" : "Crear sesión"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id, label, className, children,
}: {
  id?: string
  label: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">{label}</Label>
      {children}
    </div>
  )
}
