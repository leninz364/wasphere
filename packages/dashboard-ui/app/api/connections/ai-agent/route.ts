import { cookies } from "next/headers"
import {
  resolveWorkspaceId,
  serverDelete,
  serverGet,
  serverPatch,
  serverPost,
} from "@/lib/server-fetch"

type ApiKey = {
  id: string
  name: string
  keyPrefix: string
  permissions: string[]
  sessionId: string | null
  isActive: boolean
  lastUsedAt: string | null
}

type Webhook = {
  id: string
  apiKeyId: string | null
  provider: "generic" | "n8n" | "other"
  name: string
  url: string
  events: string[]
  isActive: boolean
  retryMax: number
  failureCount: number
  lastDeliveredAt: string | null
  lastFailedAt: string | null
  hasBearerToken: boolean
}

type Session = {
  id: string
  status: string
  phoneNumber?: string | null
  name?: string | null
}

type Workspace = {
  id: string
  name: string
  waServerConfigured: boolean
  waServerUrl?: string | null
}

type UpstreamResult<T> = {
  data: T | null
  status: number
  ok: boolean
}

type AdminApiAddress = {
  kind: "local" | "lan" | "tailscale" | "public" | "detected"
  label: string
  url: string
  description: string
  recommended: boolean
}

const AGENT_PERMISSIONS = ["messages:send", "messages:read", "sessions:read"]

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function listFrom<T>(data: T[] | { sessions?: T[] } | null): T[] {
  if (Array.isArray(data)) return data
  return data?.sessions ?? []
}

function messageFrom(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const value = (data as { message?: unknown }).message
  if (Array.isArray(value)) return value.join("\n")
  return typeof value === "string" ? value : fallback
}

// Host port the Admin API is published on. DASHBOARD_API_PUBLIC_PORT overrides it
// when the API sits behind a proxy on a different port; otherwise fall back to the
// compose-level DASHBOARD_API_PORT so the generated URLs match the real mapping.
function adminApiPort(): string {
  return (
    process.env.DASHBOARD_API_PUBLIC_PORT?.trim() ||
    process.env.DASHBOARD_API_PORT?.trim() ||
    "3000"
  )
}

function detectedAdminApiUrl(request: Request): string {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  if (forwardedProto) url.protocol = `${forwardedProto}:`
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  if (forwardedHost) {
    const forwardedUrl = new URL(`${url.protocol}//${forwardedHost}`)
    url.hostname = forwardedUrl.hostname
  }
  url.port = adminApiPort()
  url.pathname = ""
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}

function publicAdminApiUrls(request: Request): AdminApiAddress[] {
  const port = adminApiPort()
  const candidates: Omit<AdminApiAddress, "recommended">[] = [
    {
      kind: "local",
      label: "Este equipo (localhost)",
      url: `http://127.0.0.1:${port}`,
      description: "Úsala solamente si el agente IA corre en este mismo equipo.",
    },
  ]

  const lan = process.env.DASHBOARD_API_LAN_URL?.trim()
  if (lan) {
    candidates.push({
      kind: "lan",
      label: "Red local (LAN)",
      url: lan,
      description: "Para agentes conectados a la misma red local.",
    })
  }

  const tailscale = process.env.DASHBOARD_API_TAILSCALE_URL?.trim()
  if (tailscale) {
    candidates.push({
      kind: "tailscale",
      label: "Tailscale",
      url: tailscale,
      description: "Recomendada para un agente remoto conectado al mismo tailnet.",
    })
  }

  const configured = process.env.DASHBOARD_API_PUBLIC_URL?.trim()
  if (configured) {
    candidates.push({
      kind: "public",
      label: "URL pública configurada",
      url: configured,
      description: "Para agentes externos que acceden mediante dominio o IP pública.",
    })
  }

  const detected = detectedAdminApiUrl(request)
  const detectedHostname = new URL(detected).hostname.toLocaleLowerCase()
  if (!["dashboard-ui", "localhost", "127.0.0.1"].includes(detectedHostname)) {
    candidates.push({
      kind: "detected",
      label: "Dirección detectada",
      url: detected,
      description: "Dirección calculada desde el navegador actual.",
    })
  }

  const unique = candidates
    .map((candidate) => ({ ...candidate, url: candidate.url.replace(/\/+$/, "") }))
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.url.toLocaleLowerCase() === candidate.url.toLocaleLowerCase()) ===
        index
    )

  const preferredKind = unique.some((candidate) => candidate.kind === "tailscale")
    ? "tailscale"
    : unique.some((candidate) => candidate.kind === "lan")
      ? "lan"
      : unique.some((candidate) => candidate.kind === "public")
        ? "public"
        : unique[0]?.kind

  return unique.map((candidate) => ({
    ...candidate,
    recommended: candidate.kind === preferredKind,
  }))
}

function selectedAdminApiUrl(request: Request, requested?: unknown): string {
  const addresses = publicAdminApiUrls(request)
  const requestedUrl = typeof requested === "string" ? requested.replace(/\/+$/, "") : ""
  const selected = addresses.find(
    (address) => address.url.toLocaleLowerCase() === requestedUrl.toLocaleLowerCase()
  )
  return selected?.url ?? addresses.find((address) => address.recommended)?.url ?? addresses[0].url
}

async function authContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get("wa_access")?.value
  if (!token) {
    return {
      token: null,
      workspaceId: null,
      error: Response.json({ message: "Unauthorized" }, { status: 401 }),
    }
  }
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  return { token, workspaceId, error: workspaceId ? null : wsError }
}

async function loadConnectionData(token: string, workspaceId: string) {
  const [workspaceResult, keysResult, webhooksResult, sessionsResult] = await Promise.all([
    serverGet<Workspace>(`/workspaces/${workspaceId}`, token),
    serverGet<ApiKey[]>(`/workspaces/${workspaceId}/api-keys`, token),
    serverGet<Webhook[]>(`/workspaces/${workspaceId}/webhooks`, token),
    serverGet<Session[] | { sessions: Session[] }>(
      `/workspaces/${workspaceId}/proxy/api/sessions`,
      token
    ),
  ])

  return {
    workspaceResult,
    keysResult,
    webhooksResult,
    sessionsResult,
    keys: Array.isArray(keysResult.data) ? keysResult.data : [],
    webhooks: Array.isArray(webhooksResult.data) ? webhooksResult.data : [],
    sessions: listFrom(sessionsResult.data),
  }
}

function pairedConnections(keys: ApiKey[], webhooks: Webhook[]) {
  return webhooks
    .map((webhook) => {
      const key =
        keys.find((candidate) => candidate.id === webhook.apiKeyId) ??
        keys.find((candidate) => normalizeName(candidate.name) === normalizeName(webhook.name))
      const lastAttemptFailed =
        Boolean(webhook.lastFailedAt) &&
        (!webhook.lastDeliveredAt ||
          new Date(webhook.lastFailedAt!).getTime() > new Date(webhook.lastDeliveredAt).getTime())
      return {
        id: webhook.id,
        provider: webhook.provider,
        name: webhook.name,
        endpointUrl: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive && Boolean(key?.isActive),
        webhookHealthy:
          webhook.isActive &&
          webhook.events.length === 1 &&
          webhook.events[0] === "message.received" &&
          !lastAttemptFailed,
        apiKeyHealthy: Boolean(key?.isActive && key.lastUsedAt),
        healthy:
          webhook.isActive &&
          Boolean(key?.isActive) &&
          Boolean(key?.lastUsedAt) &&
          webhook.events.length === 1 &&
          webhook.events[0] === "message.received" &&
          !lastAttemptFailed,
        failureCount: webhook.failureCount,
        lastDeliveredAt: webhook.lastDeliveredAt,
        lastFailedAt: webhook.lastFailedAt,
        hasBearerToken: webhook.hasBearerToken,
        key: key
          ? {
              id: key.id,
              prefix: key.keyPrefix,
              isActive: key.isActive,
              permissions: key.permissions,
              sessionId: key.sessionId,
              lastUsedAt: key.lastUsedAt,
            }
          : null,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

export async function GET(request: Request) {
  const { token, workspaceId, error } = await authContext()
  if (!token || !workspaceId) return error!

  const data = await loadConnectionData(token, workspaceId)
  const required = [
    data.workspaceResult,
    data.keysResult,
    data.webhooksResult,
    data.sessionsResult,
  ] as UpstreamResult<unknown>[]
  const failed = required.find((result) => !result.ok)
  if (failed) {
    return Response.json(
      { message: messageFrom(failed.data, "No se pudo cargar el estado de las conexiones.") },
      { status: failed.status }
    )
  }

  const workspace = data.workspaceResult.data!
  const adminApiAddresses = publicAdminApiUrls(request)
  const recommendedAddress =
    adminApiAddresses.find((address) => address.recommended) ?? adminApiAddresses[0]
  return Response.json({
    workspace: {
      id: workspaceId,
      name: workspace.name,
      waServerConfigured: workspace.waServerConfigured,
      waServerUrl: workspace.waServerUrl ?? null,
    },
    adminApi: {
      reachable: true,
      url: recommendedAddress.url,
      urls: adminApiAddresses,
    },
    whatsapp: {
      reachable: data.sessionsResult.ok,
      sessions: data.sessions,
      connectedSessions: data.sessions.filter((session) => session.status === "connected").length,
    },
    apiKeys: {
      active: data.keys.filter((key) => key.isActive).length,
      total: data.keys.length,
    },
    connections: pairedConnections(data.keys, data.webhooks),
  })
}

export async function POST(request: Request) {
  const { token, workspaceId, error } = await authContext()
  if (!token || !workspaceId) return error!

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return Response.json({ message: "Solicitud inválida." }, { status: 400 })

  const action = typeof body.action === "string" ? body.action : "connect"
  const adminApiUrl = selectedAdminApiUrl(request, body.adminApiUrl)

  if (action === "test") {
    const webhookId = typeof body.webhookId === "string" ? body.webhookId : ""
    if (!webhookId) return Response.json({ message: "Falta el webhook." }, { status: 400 })
    const result = await serverPost<{ success: boolean; statusCode?: number; error?: string }>(
      `/workspaces/${workspaceId}/webhooks/${webhookId}/test`,
      token
    )
    return Response.json(result.data ?? { message: "No se pudo probar la conexión." }, {
      status: result.status,
    })
  }

  if (action === "rotate") {
    const keyId = typeof body.keyId === "string" ? body.keyId : ""
    const webhookId = typeof body.webhookId === "string" ? body.webhookId : ""
    if (!keyId || !webhookId) {
      return Response.json({ message: "Falta la clave de API o el webhook." }, { status: 400 })
    }
    const result = await serverPost<{ id: string; key: string; keyPrefix: string }>(
      `/workspaces/${workspaceId}/api-keys/${keyId}/rotate`,
      token
    )
    if (!result.ok || !result.data) {
      return Response.json(
        { message: messageFrom(result.data, "No se pudo crear la clave adicional.") },
        { status: result.status }
      )
    }
    const verification = await serverPost<{ valid: boolean }>(
      `/workspaces/${workspaceId}/api-keys/${result.data.id}/verify`,
      token,
      { key: result.data.key }
    )
    if (!verification.ok || !verification.data?.valid) {
      await serverDelete(`/workspaces/${workspaceId}/api-keys/${result.data.id}`, token)
      return Response.json(
        { message: "La clave fue creada, pero no superó la verificación interna." },
        { status: 502 }
      )
    }
    const link = await serverPatch(
      `/workspaces/${workspaceId}/webhooks/${webhookId}`,
      token,
      { apiKeyId: result.data.id }
    )
    if (!link.ok) {
      await serverDelete(`/workspaces/${workspaceId}/api-keys/${result.data.id}`, token)
      return Response.json(
        { message: messageFrom(link.data, "No se pudo vincular la clave con el agente.") },
        { status: link.status }
      )
    }
    return Response.json({
      apiKey: result.data.key,
      keyPrefix: result.data.keyPrefix,
      apiKeyVerified: true,
      adminApiUrl,
      workspaceId,
    })
  }

  if (action === "disconnect") {
    const webhookId = typeof body.webhookId === "string" ? body.webhookId : ""
    const keyId = typeof body.keyId === "string" ? body.keyId : ""
    if (!webhookId) {
      return Response.json({ message: "Falta el identificador del webhook." }, { status: 400 })
    }
    const webhookDelete = await serverDelete(
      `/workspaces/${workspaceId}/webhooks/${webhookId}`,
      token
    )
    if (!webhookDelete.ok) {
      return Response.json(
        { message: messageFrom(webhookDelete.data, "No se pudo eliminar el webhook.") },
        { status: webhookDelete.status }
      )
    }
    if (keyId) {
      const keyDelete = await serverDelete(`/workspaces/${workspaceId}/api-keys/${keyId}`, token)
      if (!keyDelete.ok) {
        return Response.json(
          {
            message:
              "El webhook se eliminó, pero no fue posible eliminar la clave. Revísala en Configuración avanzada.",
          },
          { status: keyDelete.status }
        )
      }
    }
    return Response.json({ success: true })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const provider = typeof body.provider === "string" ? body.provider.trim() : "n8n"
  const endpointUrl = typeof body.endpointUrl === "string" ? body.endpointUrl.trim() : ""
  const hookToken = typeof body.hookToken === "string" ? body.hookToken.trim() : ""
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
  if (!name || name.length > 64) {
    return Response.json({ message: "Escribe un nombre de hasta 64 caracteres." }, { status: 400 })
  }
  if (!["n8n", "other"].includes(provider)) {
    return Response.json({ message: "Selecciona un tipo de conexión válido." }, { status: 400 })
  }
  if (!sessionId) {
    return Response.json({ message: "Selecciona una sesión de WhatsApp." }, { status: 400 })
  }
  let endpoint: URL
  try {
    endpoint = new URL(endpointUrl)
  } catch {
    return Response.json({ message: "La URL del agente no es válida." }, { status: 400 })
  }
  if (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") {
    return Response.json({ message: "La URL del agente debe usar HTTPS." }, { status: 400 })
  }
  if (provider === "n8n") {
    const normalizedPath = endpoint.pathname.replace(/\/+$/, "")
    if (normalizedPath.includes("/webhook-test/") || normalizedPath.endsWith("/webhook-test")) {
      return Response.json(
        {
          message:
            "Usa la Production URL de n8n (/webhook/...), no la Test URL (/webhook-test/...).",
        },
        { status: 400 }
      )
    }
    if (!normalizedPath.includes("/webhook/")) {
      return Response.json(
        { message: "La URL de n8n debe ser la Production URL que contiene /webhook/." },
        { status: 400 }
      )
    }
  }

  const current = await loadConnectionData(token, workspaceId)
  const failed = [current.keysResult, current.webhooksResult, current.sessionsResult].find(
    (result) => !result.ok
  )
  if (failed) {
    return Response.json(
      { message: messageFrom(failed.data, "No se pudo preparar la conexión.") },
      { status: failed.status }
    )
  }
  if (!current.sessions.some((session) => session.id === sessionId)) {
    return Response.json({ message: "La sesión seleccionada ya no existe." }, { status: 400 })
  }

  const existingKey = current.keys.find((key) => normalizeName(key.name) === normalizeName(name))
  const existingWebhook = current.webhooks.find(
    (webhook) => normalizeName(webhook.name) === normalizeName(name)
  )
  if (provider === "n8n" && !hookToken && !existingWebhook?.hasBearerToken) {
    return Response.json(
      { message: "Pega el token configurado en Header Auth del Webhook de n8n." },
      { status: 400 }
    )
  }

  let keyId = existingKey?.id ?? ""
  let rawApiKey: string | null = null
  let createdKey = false

  if (existingKey) {
    const updated = await serverPatch(
      `/workspaces/${workspaceId}/api-keys/${existingKey.id}`,
      token,
      {
        name,
        permissions: AGENT_PERMISSIONS,
        sessionId,
      }
    )
    if (!updated.ok) {
      return Response.json(
        { message: messageFrom(updated.data, "No se pudo actualizar la clave del agente.") },
        { status: updated.status }
      )
    }
    if (!existingKey.lastUsedAt) {
      const replacement = await serverPost<{ id: string; key: string }>(
        `/workspaces/${workspaceId}/api-keys/${existingKey.id}/rotate`,
        token
      )
      if (!replacement.ok || !replacement.data) {
        return Response.json(
          { message: messageFrom(replacement.data, "No se pudo crear una clave verificable.") },
          { status: replacement.status }
        )
      }
      keyId = replacement.data.id
      rawApiKey = replacement.data.key
      createdKey = true
    }
  } else {
    const created = await serverPost<{ id: string; key: string }>(
      `/workspaces/${workspaceId}/api-keys`,
      token,
      {
        name,
        permissions: AGENT_PERMISSIONS,
        sessionId,
      }
    )
    if (!created.ok || !created.data) {
      return Response.json(
        { message: messageFrom(created.data, "No se pudo crear la clave del agente.") },
        { status: created.status }
      )
    }
    keyId = created.data.id
    rawApiKey = created.data.key
    createdKey = true
  }

  if (rawApiKey) {
    const verification = await serverPost<{ valid: boolean }>(
      `/workspaces/${workspaceId}/api-keys/${keyId}/verify`,
      token,
      { key: rawApiKey }
    )
    if (!verification.ok || !verification.data?.valid) {
      if (createdKey) {
        await serverDelete(`/workspaces/${workspaceId}/api-keys/${keyId}`, token)
      }
      return Response.json(
        { message: "La clave del agente no superó la verificación interna." },
        { status: 502 }
      )
    }
  }

  const webhookPayload: Record<string, unknown> = {
    apiKeyId: keyId,
    provider,
    name,
    url: endpoint.toString(),
    events: ["message.received"],
    retryMax: 3,
    isActive: true,
  }
  if (hookToken) webhookPayload.bearerToken = hookToken

  const webhookResult = existingWebhook
    ? await serverPatch<Webhook>(
        `/workspaces/${workspaceId}/webhooks/${existingWebhook.id}`,
        token,
        webhookPayload
      )
    : await serverPost<Webhook>(
        `/workspaces/${workspaceId}/webhooks`,
        token,
        webhookPayload
      )

  if (!webhookResult.ok || !webhookResult.data) {
    if (createdKey) {
      await serverDelete(`/workspaces/${workspaceId}/api-keys/${keyId}`, token)
    }
    return Response.json(
      { message: messageFrom(webhookResult.data, "No se pudo guardar el webhook del agente.") },
      { status: webhookResult.status }
    )
  }

  const webhookId = webhookResult.data.id
  const test = await serverPost<{ success: boolean; statusCode?: number; error?: string }>(
    `/workspaces/${workspaceId}/webhooks/${webhookId}/test`,
    token
  )

  return Response.json({
    success: true,
    test: test.data ?? { success: false, error: "No se recibió respuesta del agente." },
    credentials: {
      apiKey: rawApiKey,
      keyAlreadyExisted: !rawApiKey,
      apiKeyVerified: rawApiKey ? true : Boolean(existingKey?.lastUsedAt),
      adminApiUrl,
      workspaceId,
      sessionId,
      provider,
    },
    connection: {
      id: webhookId,
      keyId,
      name,
      endpointUrl: endpoint.toString(),
      provider,
    },
  })
}
