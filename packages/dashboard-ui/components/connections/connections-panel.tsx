"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MessageCircle,
  Plug,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react"
import { ApiKeysTab } from "@/components/developer/api-keys-tab"
import { WebhooksTab } from "@/components/webhooks/webhooks-tab"
import { ApiError } from "@/components/ui/api-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Session = {
  id: string
  status: string
  phoneNumber?: string | null
  name?: string | null
}

type AdminApiAddress = {
  kind: "local" | "lan" | "tailscale" | "public" | "detected"
  label: string
  url: string
  description: string
  recommended: boolean
}

type Connection = {
  id: string
  provider: "generic" | "n8n" | "other"
  name: string
  endpointUrl: string
  events: string[]
  isActive: boolean
  webhookHealthy: boolean
  apiKeyHealthy: boolean
  healthy: boolean
  failureCount: number
  lastDeliveredAt: string | null
  lastFailedAt: string | null
  hasBearerToken: boolean
  key: {
    id: string
    prefix: string
    isActive: boolean
    permissions: string[]
    sessionId: string | null
    lastUsedAt: string | null
  } | null
}

type StatusData = {
  workspace: {
    id: string
    name: string
    waServerConfigured: boolean
    waServerUrl: string | null
  }
  adminApi: { reachable: boolean; url: string; urls: AdminApiAddress[] }
  whatsapp: {
    reachable: boolean
    sessions: Session[]
    connectedSessions: number
  }
  apiKeys: { active: number; total: number }
  connections: Connection[]
}

type Credentials = {
  apiKey: string | null
  keyAlreadyExisted?: boolean
  apiKeyVerified?: boolean
  adminApiUrl: string
  workspaceId: string
  sessionId: string
}

type WaServerSettings = {
  url: string
  token: string
  configured: boolean
}

type WaTestResult = { ok: boolean; message: string } | null

function displayDate(value: string | null): string {
  if (!value) return "Sin actividad"
  return new Date(value).toLocaleString()
}

const API_KEY_PLACEHOLDER = "wsk_PENDIENTE_GENERA_UNA_CLAVE"

type AgentConfig = {
  adminApiUrl: string
  workspaceId: string
  sessionId: string
  apiKey: string | null
}

function replyEndpoint(config: AgentConfig): string {
  return `${config.adminApiUrl}/workspaces/${config.workspaceId}/conversations`
}

/**
 * Ready-to-paste setup for n8n. Every value is resolved — no placeholders the
 * operator has to substitute by hand, except the API key when it is not being
 * revealed in this render (it is only ever shown once, at creation).
 */
function n8nConfigText(config: AgentConfig): string {
  const key = config.apiKey ?? API_KEY_PLACEHOLDER
  const endpoint = replyEndpoint(config)
  const webhookData = "$('Webhook').item.json.body.data"
  return [
    "########  1. NODO WEBHOOK  (recibe los mensajes de WhatsApp)  ########",
    "",
    "HTTP Method      POST",
    "Respond          Immediately",
    "Authentication   Header Auth",
    "  Header Name    Authorization",
    "  Header Value   Bearer <el token que pegaste en BritelBot>",
    "",
    "Activa el workflow y copia su Production URL (contiene /webhook/).",
    "NO uses la URL /webhook-test/: solo vive mientras pulsas 'Execute workflow'.",
    "",
    "",
    "########  2. NODO HTTP REQUEST  (responde por WhatsApp)  ########",
    "",
    "Method   POST",
    `URL      ${endpoint}`,
    "",
    "Headers",
    `  Authorization   Bearer ${key}`,
    "  Content-Type    application/json",
    "",
    "Body (JSON, con expresiones de n8n)",
    'El nodo receptor debe llamarse "Webhook". Si lo renombraste, cambia ese nombre en la expresion "to".',
    "{",
    `  "sessionId": "${config.sessionId}",`,
    `  "to": "={{ String(${webhookData}.senderPn || ${webhookData}.senderJid || ${webhookData}.from).split('@')[0].replace(/\\D/g, '') }}",`,
    '  "text": "={{ $json.output }}"',
    "}",
    "",
    "",
    "########  3. PRUEBA RÁPIDA DESDE TERMINAL  ########",
    "",
    `curl -X POST "${endpoint}" \\`,
    `  -H "Authorization: Bearer ${key}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '{"sessionId":"${config.sessionId}","to":"593999999999","text":"Hola desde n8n"}'`,
    "",
    "",
    "########  VARIABLES  ########",
    "",
    `BRITELBOT_API_URL=${config.adminApiUrl}`,
    `BRITELBOT_API_KEY=${key}`,
    `BRITELBOT_WORKSPACE_ID=${config.workspaceId}`,
    `BRITELBOT_SESSION_ID=${config.sessionId}`,
  ].join("\n")
}

function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
      {copied ? "Copiado" : label}
    </Button>
  )
}

function StatusCard({
  title,
  detail,
  ok,
  icon: Icon,
}: {
  title: string
  detail: string
  ok: boolean
  icon: React.ElementType
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="size-4" />
          </span>
          <CardTitle>{title}</CardTitle>
        </div>
        <CardAction>
          <Badge
            variant={ok ? "secondary" : "destructive"}
            className={ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : ""}
          >
            {ok ? <CheckCircle2 /> : <XCircle />}
            {ok ? "OK" : "Revisar"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      </CardContent>
    </Card>
  )
}

export function ConnectionsPanel({ initialWaServer }: { initialWaServer: WaServerSettings }) {
  const [data, setData] = React.useState<StatusData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [testingId, setTestingId] = React.useState<string | null>(null)
  const [rotatingId, setRotatingId] = React.useState<string | null>(null)
  const [name, setName] = React.useState("AGENTE IA")
  const [endpointUrl, setEndpointUrl] = React.useState("")
  const [hookToken, setHookToken] = React.useState("")
  const [showToken, setShowToken] = React.useState(false)
  const [sessionId, setSessionId] = React.useState("")
  const [adminApiUrl, setAdminApiUrl] = React.useState("")
  const [credentials, setCredentials] = React.useState<Credentials | null>(null)
  const [waServerUrl, setWaServerUrl] = React.useState(initialWaServer.url)
  const [waServerToken, setWaServerToken] = React.useState(initialWaServer.token)
  const [waServerConfigured, setWaServerConfigured] = React.useState(initialWaServer.configured)
  const [showWaServerToken, setShowWaServerToken] = React.useState(false)
  const [waServerSaving, setWaServerSaving] = React.useState(false)
  const [waServerTesting, setWaServerTesting] = React.useState(false)
  const [waServerError, setWaServerError] = React.useState<string | null>(null)
  const [waServerTest, setWaServerTest] = React.useState<WaTestResult>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/connections/ai-agent", { cache: "no-store" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message ?? "No se pudieron cargar las conexiones.")
      const next = body as StatusData
      setData(next)
      setError(null)
      setAdminApiUrl((current) => {
        if (current && next.adminApi.urls.some((address) => address.url === current)) return current
        return next.adminApi.urls.find((address) => address.recommended)?.url ?? next.adminApi.url
      })
      if (!sessionId) {
        const preferred =
          next.whatsapp.sessions.find((session) => session.status === "connected") ??
          next.whatsapp.sessions[0]
        if (preferred) setSessionId(preferred.id)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar las conexiones.")
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  React.useEffect(() => {
    void refresh()
    // The initial load intentionally runs once. Session selection is initialized
    // from the response and later refreshes are triggered explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generateN8nToken = () => {
    const bytes = new Uint8Array(32)
    window.crypto.getRandomValues(bytes)
    setHookToken(Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""))
    setShowToken(true)
  }

  const testWaServer = async () => {
    setWaServerTesting(true)
    setWaServerTest(null)
    try {
      const response = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: waServerUrl, token: waServerToken }),
      })
      const body = await response.json().catch(() => ({}))
      setWaServerTest({
        ok: Boolean(body.ok),
        message: body.message ?? "No se pudo probar el WA Server.",
      })
    } catch {
      setWaServerTest({ ok: false, message: "No se pudo comunicar con el panel." })
    } finally {
      setWaServerTesting(false)
    }
  }

  const saveWaServer = async (event: React.FormEvent) => {
    event.preventDefault()
    setWaServerSaving(true)
    setWaServerError(null)
    try {
      const response = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waServerUrl, waServerToken }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = Array.isArray(body.message)
          ? body.message.join(" ")
          : body.message ?? "No se pudo guardar el WA Server."
        throw new Error(message)
      }
      setWaServerConfigured(true)
      toast.success("Conexión con WA Server guardada.")
      await refresh()
    } catch (cause) {
      setWaServerError(cause instanceof Error ? cause.message : "No se pudo guardar el WA Server.")
    } finally {
      setWaServerSaving(false)
    }
  }

  const editConnection = (connection: Connection) => {
    setName(connection.name)
    setEndpointUrl(connection.endpointUrl)
    if (connection.key?.sessionId) setSessionId(connection.key.sessionId)
    setHookToken("")
    setCredentials(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const connect = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setCredentials(null)
    try {
      const normalizedEndpoint = endpointUrl.trim()
      const response = await fetch("/api/connections/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          provider: "n8n",
          name,
          endpointUrl: normalizedEndpoint,
          hookToken,
          sessionId,
          adminApiUrl,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message ?? "No se pudo guardar la conexión.")
      setCredentials(body.credentials as Credentials)
      setHookToken("")
      if (body.test?.success) {
        toast.success(
          body.credentials?.apiKeyVerified
            ? `Clave verificada y webhook HTTP ${body.test.statusCode ?? 200}.`
            : `Webhook HTTP ${body.test.statusCode ?? 200}; esperando el primer uso de la API key.`
        )
      } else {
        toast.warning(
          `La configuración se guardó, pero el agente no respondió correctamente${
            body.test?.statusCode ? ` (HTTP ${body.test.statusCode})` : ""
          }.`
        )
      }
      await refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No se pudo guardar la conexión.")
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async (connection: Connection) => {
    setTestingId(connection.id)
    try {
      const response = await fetch("/api/connections/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", webhookId: connection.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.success) {
        throw new Error(
          body.statusCode
            ? `El agente respondió HTTP ${body.statusCode}.`
            : body.message ?? body.error ?? "El agente no respondió."
        )
      }
      toast.success(`Conexión verificada: HTTP ${body.statusCode ?? 200}.`)
      await refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No se pudo probar la conexión.")
    } finally {
      setTestingId(null)
    }
  }

  const rotateKey = async (connection: Connection) => {
    if (!connection.key) return
    if (
      !window.confirm(
        "Se creará una clave adicional. La clave actual seguirá funcionando hasta que la elimines. ¿Deseas continuar?"
      )
    ) return
    setRotatingId(connection.key.id)
    try {
      const response = await fetch("/api/connections/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rotate",
          keyId: connection.key.id,
          webhookId: connection.id,
          adminApiUrl,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message ?? "No se pudo crear la clave adicional.")
      setCredentials({
        apiKey: body.apiKey,
        adminApiUrl: body.adminApiUrl,
        workspaceId: body.workspaceId,
        sessionId: connection.key.sessionId ?? "",
        apiKeyVerified: body.apiKeyVerified,
      })
      toast.success("Clave adicional verificada y vinculada. La anterior continúa funcionando.")
      await refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No se pudo crear la clave adicional.")
    } finally {
      setRotatingId(null)
    }
  }

  const disconnect = async (connection: Connection) => {
    if (
      !window.confirm(
        `Se eliminarán el webhook y la clave de "${connection.name}". ¿Deseas continuar?`
      )
    ) return
    try {
      const response = await fetch("/api/connections/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnect",
          webhookId: connection.id,
          keyId: connection.key?.id ?? "",
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message ?? "No se pudo eliminar la conexión.")
      toast.success("Conexión eliminada.")
      setCredentials(null)
      await refresh()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No se pudo eliminar la conexión.")
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Verificando servicios…
      </div>
    )
  }

  if (error && !data) return <ApiError message={error} onRetry={() => void refresh()} />
  if (!data) return null

  const connectedSessions = data.whatsapp.sessions.filter(
    (session) => session.status === "connected"
  )
  const existingNamedConnection = data.connections.some(
    (connection) =>
      connection.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()
  )
  const hookTokenRequired = !existingNamedConnection
  // The configuration is always derivable from what is already on screen, so it
  // stays visible after the one-time credential reveal. Only the API key itself
  // is unavailable on later renders.
  const activeConfig: AgentConfig = {
    adminApiUrl: credentials?.adminApiUrl ?? adminApiUrl,
    workspaceId: credentials?.workspaceId ?? data.workspace.id,
    sessionId: credentials?.sessionId || sessionId,
    apiKey: credentials?.apiKey ?? null,
  }
  const configText = n8nConfigText(activeConfig)
  const configReady = Boolean(activeConfig.adminApiUrl && activeConfig.sessionId)

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardHeader>
          <CardTitle>Qué credencial usa cada conexión</CardTitle>
          <CardDescription>
            Son tres credenciales diferentes. No se pueden intercambiar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-sm font-medium">WA_TOKEN</p>
            <p className="mt-1 text-xs text-muted-foreground">
              BritelBot → WA Server mediante <code>X-Api-Token</code>.
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-sm font-medium">Token del agente</p>
            <p className="mt-1 text-xs text-muted-foreground">
              BritelBot → webhook del agente mediante <code>Bearer</code>.
            </p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-sm font-medium">API Key wsk_</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Agente → Admin API de BritelBot mediante <code>Bearer</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="wa-server-title">
        <div>
          <h2 id="wa-server-title" className="text-lg font-semibold">1. WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Conexión interna entre BritelBot y el servidor de WhatsApp.
          </p>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <Smartphone className="size-5" />
              </span>
              <div>
                <CardTitle>WA Server</CardTitle>
                <CardDescription>URL interna y token exclusivo del servidor de WhatsApp.</CardDescription>
              </div>
            </div>
            <CardAction>
              <Badge
                variant={waServerConfigured ? "secondary" : "destructive"}
                className={waServerConfigured ? "bg-green-500/10 text-green-700 dark:text-green-400" : ""}
              >
                {waServerConfigured ? <CheckCircle2 /> : <CircleAlert />}
                {waServerConfigured ? "Configurado" : "Pendiente"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveWaServer} className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="wa-server-url">URL interna del WA Server</Label>
                <Input
                  id="wa-server-url"
                  type="url"
                  value={waServerUrl}
                  onChange={(event) => {
                    setWaServerUrl(event.target.value)
                    setWaServerTest(null)
                  }}
                  placeholder="http://wa-server:3001"
                  className="font-mono"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Docker: <code>http://wa-server:3001</code>. Instalación local:{" "}
                  <code>http://127.0.0.1:3001</code>.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="wa-server-token">Token del WA Server (WA_TOKEN)</Label>
                <div className="relative">
                  <Input
                    id="wa-server-token"
                    type={showWaServerToken ? "text" : "password"}
                    value={waServerToken}
                    onChange={(event) => {
                      setWaServerToken(event.target.value)
                      setWaServerTest(null)
                    }}
                    placeholder={
                      waServerConfigured
                        ? "Ya configurado; pega WA_TOKEN para cambiarlo o probarlo"
                        : "Pega WA_TOKEN"
                    }
                    autoComplete="off"
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWaServerToken((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showWaServerToken ? "Ocultar token del WA Server" : "Mostrar token del WA Server"}
                  >
                    {showWaServerToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Por seguridad el valor guardado no se vuelve a mostrar. No es una API Key{" "}
                  <code>wsk_</code> ni el token del agente.
                </p>
              </div>

              {waServerError && (
                <p className="text-xs text-destructive md:col-span-2">{waServerError}</p>
              )}
              {waServerTest && (
                <div
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs md:col-span-2 ${
                    waServerTest.ok
                      ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300"
                      : "border-destructive/30 bg-destructive/5 text-destructive"
                  }`}
                >
                  {waServerTest.ok
                    ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                    : <XCircle className="mt-0.5 size-3.5 shrink-0" />}
                  <span>{waServerTest.message}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={waServerSaving || !waServerUrl.trim() || !waServerToken.trim()}
                >
                  {waServerSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {waServerSaving ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void testWaServer()}
                  disabled={waServerTesting || !waServerUrl.trim() || !waServerToken.trim()}
                >
                  {waServerTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                  {waServerTesting ? "Probando…" : "Probar conexión"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="services-title">
        <div>
          <h2 id="services-title" className="text-lg font-semibold">2. Estado de servicios</h2>
          <p className="text-sm text-muted-foreground">
            Comprueba qué parte de la integración necesita atención.
          </p>
        </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="Admin API"
          detail={`${data.adminApi.urls.length} direcciones disponibles`}
          ok={data.adminApi.reachable}
          icon={Server}
        />
        <StatusCard
          title="API Keys"
          detail={`${data.apiKeys.active} activa${data.apiKeys.active === 1 ? "" : "s"}`}
          ok={data.apiKeys.active > 0 || data.connections.length === 0}
          icon={KeyRound}
        />
        <StatusCard
          title="WA Server"
          detail={`${data.whatsapp.connectedSessions} sesión${
            data.whatsapp.connectedSessions === 1 ? "" : "es"
          } conectada${data.whatsapp.connectedSessions === 1 ? "" : "s"}`}
          ok={data.whatsapp.reachable && data.whatsapp.connectedSessions > 0}
          icon={Smartphone}
        />
      </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="agent-title">
        <div>
          <h2 id="agent-title" className="text-lg font-semibold">3. Agente IA y n8n</h2>
          <p className="text-sm text-muted-foreground">
            Crea en conjunto el webhook de entrada y la API Key para responder por WhatsApp.
          </p>
        </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <Bot className="size-5" />
              </span>
              <div>
                <CardTitle>Conectar n8n</CardTitle>
                <CardDescription>
                  Solo necesitas la Production URL del Webhook, su token y una sesión de
                  WhatsApp.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={connect} className="grid gap-4">
              <div className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Antes de empezar, en n8n</p>
                  <a
                    href="/templates/wasphere-n8n-webhook.json"
                    download
                    className="rounded-md border border-blue-300 bg-white px-2 py-1 font-medium hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:hover:bg-blue-900"
                  >
                    Descargar workflow base
                  </a>
                </div>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Crea un nodo Webhook con método POST y respuesta inmediata.</li>
                  <li>Configura Header Auth con el token que generes aquí abajo.</li>
                  <li>
                    <strong>Activa el workflow</strong> y copia su Production URL.
                  </li>
                  <li>Pégala aquí y pulsa “Conectar y probar”.</li>
                </ol>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="agent-name">Nombre</Label>
                <Input
                  id="agent-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="N8N"
                  maxLength={64}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="agent-url">Production URL del Webhook de n8n</Label>
                <Input
                  id="agent-url"
                  type="url"
                  value={endpointUrl}
                  onChange={(event) => setEndpointUrl(event.target.value)}
                  placeholder="https://n8n.example.com/webhook/wasphere-whatsapp"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Debe contener <code>/webhook/</code>. No uses <code>/webhook-test/</code>:
                  esa URL solo vive mientras pulsas “Execute workflow” y expira enseguida.
                </p>
              </div>

              <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/[0.035] p-3">
                <Label htmlFor="agent-token">
                  Token compartido del Webhook de n8n{" "}
                  <span className="font-normal text-muted-foreground">
                    {existingNamedConnection
                      ? "(déjalo vacío para conservarlo)"
                      : "(obligatorio)"}
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="agent-token"
                    type={showToken ? "text" : "password"}
                    value={hookToken}
                    onChange={(event) => setHookToken(event.target.value)}
                    placeholder="Token configurado en Header Auth"
                    autoComplete="off"
                    className="pr-10"
                    required={hookTokenRequired}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={generateN8nToken}>
                    <KeyRound className="size-3.5" />
                    Generar token seguro
                  </Button>
                  {hookToken && (
                    <CopyButton value={`Bearer ${hookToken}`} label="Copiar valor Header Auth" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  En el nodo Webhook selecciona <strong>Header Auth</strong>: nombre{" "}
                  <code>Authorization</code> y valor <code>Bearer &lt;token&gt;</code>. Aquí pega
                  solamente el token, sin la palabra Bearer.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="agent-session">Sesión de WhatsApp</Label>
                <select
                  id="agent-session"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                  required
                >
                  <option value="">Selecciona una sesión</option>
                  {data.whatsapp.sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.name || session.id}
                      {session.phoneNumber ? ` · ${session.phoneNumber}` : ""}
                      {session.status !== "connected" ? ` · ${session.status}` : ""}
                    </option>
                  ))}
                </select>
                {connectedSessions.length === 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <CircleAlert className="size-3.5" />
                    Primero conecta una sesión desde{" "}
                    <Link href="/dashboard/sessions" className="underline">
                      Sesiones
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="agent-britelbot-url">
                  Dirección de BritelBot visible para el agente
                </Label>
                <select
                  id="agent-britelbot-url"
                  value={adminApiUrl}
                  onChange={(event) => {
                    setAdminApiUrl(event.target.value)
                    setCredentials((current) =>
                      current ? { ...current, adminApiUrl: event.target.value } : current
                    )
                  }}
                  className="h-9 rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 dark:bg-input/30"
                  required
                >
                  {data.adminApi.urls.map((address) => (
                    <option key={address.url} value={address.url}>
                      {address.label}{address.recommended ? " · Recomendada" : ""} — {address.url}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {data.adminApi.urls.find((address) => address.url === adminApiUrl)?.description}
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                BritelBot creará una clave limitada a esta sesión, habilitará únicamente{" "}
                <code>message.received</code> y probará el endpoint automáticamente.
              </div>

              <Button
                type="submit"
                disabled={
                  saving ||
                  !endpointUrl ||
                  !sessionId ||
                  (hookTokenRequired && !hookToken.trim())
                }
                className="gap-2 sm:w-fit"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                {saving ? "Guardando y probando…" : "Conectar y probar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-4 text-primary" />
              Configuración para el agente
            </CardTitle>
            <CardDescription>
              Valores reales de este espacio de trabajo, listos para pegar. Se mantienen
              visibles aunque recargues la página.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!configReady ? (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
                <ShieldCheck className="mb-3 size-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">Falta elegir sesión y dirección</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Selecciona una sesión de WhatsApp y la dirección visible para el agente;
                  la configuración completa aparecerá aquí.
                </p>
              </div>
            ) : (
              <>
                {credentials?.apiKey ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    La API Key va incluida abajo. Guárdala ahora: por seguridad no volverá a
                    mostrarse.
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Todo está completo salvo la API Key, que solo se muestra una vez. Pulsa
                    “Conectar y probar” o “Crear otra clave” para obtener una y reemplazar{" "}
                    <code>{API_KEY_PLACEHOLDER}</code>.
                  </div>
                )}
                <pre className="max-h-96 overflow-auto whitespace-pre rounded-lg bg-zinc-950 p-4 text-xs leading-6 text-zinc-100">
                  {configText}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <CopyButton value={configText} label="Copiar todo" />
                  <CopyButton value={replyEndpoint(activeConfig)} label="Copiar URL de respuesta" />
                  {credentials?.apiKey && (
                    <CopyButton
                      value={`Bearer ${credentials.apiKey}`}
                      label="Copiar Authorization"
                    />
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Agentes configurados</CardTitle>
          <CardDescription>
            Estado combinado del webhook y la API Key de cada agente.
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {data.connections.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay agentes configurados.
            </div>
          ) : (
            <div className="grid gap-3">
              {data.connections.map((connection) => (
                <div
                  key={connection.id}
                  className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{connection.name}</p>
                      <Badge variant="outline">
                        {connection.provider === "n8n" ? "n8n" : "Webhook"}
                      </Badge>
                      <Badge
                        variant={connection.healthy ? "secondary" : "destructive"}
                        className={
                          connection.healthy
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : ""
                        }
                      >
                        {connection.healthy ? <CheckCircle2 /> : <CircleAlert />}
                        {connection.healthy ? "Conectado" : "Revisar"}
                      </Badge>
                      <Badge
                        variant={connection.webhookHealthy ? "secondary" : "destructive"}
                        className={
                          connection.webhookHealthy
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : ""
                        }
                      >
                        {connection.webhookHealthy ? <CheckCircle2 /> : <CircleAlert />}
                        Webhook {connection.webhookHealthy ? "OK" : "con error"}
                      </Badge>
                      <Badge
                        variant={connection.apiKeyHealthy ? "secondary" : "outline"}
                        className={
                          connection.apiKeyHealthy
                            ? "bg-green-500/10 text-green-700 dark:text-green-400"
                            : ""
                        }
                      >
                        {connection.apiKeyHealthy ? <CheckCircle2 /> : <CircleAlert />}
                        API key {connection.apiKeyHealthy ? "en uso" : "sin uso"}
                      </Badge>
                      <Badge variant="outline">message.received</Badge>
                    </div>
                    <p
                      className="mt-1 truncate font-mono text-xs text-muted-foreground"
                      title={connection.endpointUrl}
                    >
                      {connection.endpointUrl}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Key vinculada: {connection.key ? `${connection.key.prefix}…` : "pendiente"}
                      </span>
                      <span>
                        Sesión: {connection.key?.sessionId ?? "seleccionar al completar"}
                      </span>
                      <span>
                        Último uso API: {displayDate(connection.key?.lastUsedAt ?? null)}
                      </span>
                      <span>Última entrega: {displayDate(connection.lastDeliveredAt)}</span>
                      {connection.failureCount > 0 && (
                        <span className="text-destructive">
                          Fallos consecutivos: {connection.failureCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void testConnection(connection)}
                      disabled={testingId === connection.id}
                      className="gap-1.5"
                    >
                      {testingId === connection.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Plug className="size-3.5" />
                      )}
                      Probar webhook
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editConnection(connection)}
                      className="gap-1.5"
                    >
                      <Settings2 className="size-3.5" />
                      {connection.key ? "Editar" : "Completar"}
                    </Button>
                    {connection.key && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void rotateKey(connection)}
                        disabled={rotatingId === connection.key.id}
                        className="gap-1.5"
                      >
                        {rotatingId === connection.key.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        Crear otra clave
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void disconnect(connection)}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <details open className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-muted p-2">
              <Settings2 className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">4. APIs, tokens y webhooks</p>
              <p className="text-xs text-muted-foreground">
                Credenciales de BritelBot, endpoints y webhooks genéricos.
              </p>
            </div>
          </div>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3 sm:col-span-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Server className="size-4 text-primary" />
                Direcciones del Admin API para el agente
              </p>
              <div className="mt-3 grid gap-2">
                {data.adminApi.urls.map((address) => (
                  <div
                    key={address.url}
                    className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium">{address.label}</p>
                        {address.recommended && (
                          <Badge
                            variant="secondary"
                            className="bg-green-500/10 text-green-700 dark:text-green-400"
                          >
                            Recomendada
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-foreground">
                        {address.url}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {address.description}
                      </p>
                    </div>
                    <CopyButton value={address.url} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-3 sm:col-span-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-primary" />
                ID del espacio de trabajo
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 text-xs">
                  {data.workspace.id}
                </code>
                <CopyButton value={data.workspace.id} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Se usa junto con una API Key <code>wsk_</code> para llamar al Admin API.
              </p>
            </div>
          </div>
          <Tabs defaultValue="api-keys">
            <TabsList>
              <TabsTrigger value="api-keys">
                <KeyRound className="size-3.5" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="webhooks">
                <Webhook className="size-3.5" />
                Webhooks
              </TabsTrigger>
            </TabsList>
            <TabsContent value="api-keys" className="mt-4">
              <ApiKeysTab />
            </TabsContent>
            <TabsContent value="webhooks" className="mt-4">
              <WebhooksTab />
            </TabsContent>
          </Tabs>
        </div>
      </details>
    </div>
  )
}
