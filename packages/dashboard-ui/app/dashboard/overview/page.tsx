import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Smartphone, MessageSquare, ShieldCheck, Zap, BarChart2, ActivitySquare } from "lucide-react"

const ICON_CLASS = "size-[18px] text-primary"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ApiError } from "@/components/ui/api-error"
import { cn } from "@/lib/utils"
import { AnimatedStatCard } from "@/components/overview/animated-stat-card"
import { AnimatedBarChart } from "@/components/overview/animated-bar-chart"
import { DonutChart } from "@/components/overview/donut-chart"
import { ActivityFeed, type ActivityItem } from "@/components/overview/activity-feed"
import { AgentWorkCard } from "@/components/team/agent-work-card"

import { serverGet } from "@/lib/server-fetch"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Workspace {
  id: string
  name: string
  waServerConfigured: boolean
  waServerUrl?: string | null
}

interface Session {
  id: string
  status: string
  phoneNumber?: string | null
}

interface Stats {
  messages24h: { count: number; previousDayCount: number }
  successRate24h: { percentage: number; failed: number }
  eventsToday: { count: number; byType: Record<string, number> }
  messages7d: Array<{ date: string; count: number }>
  recentActivity: ActivityItem[]
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function fetchWorkspaces(token: string): Promise<Workspace[] | null> {
  const { ok, data } = await serverGet<Workspace[] | { workspaces: Workspace[] }>("/workspaces", token)
  if (!ok || !data) return null
  return Array.isArray(data) ? data : (data.workspaces ?? [])
}

async function fetchSessions(workspaceId: string, token: string): Promise<Session[] | null> {
  const { ok, data } = await serverGet<Session[] | { sessions: Session[] }>(
    `/workspaces/${workspaceId}/proxy/api/sessions`, token
  )
  if (!ok || !data) return null
  return Array.isArray(data) ? data : (data.sessions ?? [])
}

async function fetchHealthOk(workspaceId: string, token: string): Promise<boolean> {
  const { ok } = await serverGet(`/workspaces/${workspaceId}/proxy/api/health`, token)
  return ok
}

async function fetchStats(workspaceId: string, token: string): Promise<Stats | null> {
  const { ok, data } = await serverGet<Stats>(`/workspaces/${workspaceId}/stats`, token)
  return ok ? data : null
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const cookieStore = await cookies()
  let token = cookieStore.get("wa_access")?.value ?? ""

  if (!token) redirect("/login?reason=expired")

  let workspaces = await fetchWorkspaces(token)

  if (workspaces === null) {
    redirect("/login?reason=expired")
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Resumen</h1>
        <div className="rounded-xl border bg-muted/30 px-6 py-10 text-center">
          <p className="text-base font-medium text-foreground">Sin espacio de trabajo configurado</p>
          <p className="text-sm text-zinc-400 mt-1">Crea un espacio de trabajo para comenzar.</p>
        </div>
      </div>
    )
  }

  const workspace = workspaces[0]

  const [sessions, serverOnline, stats] = await Promise.all([
    workspace.waServerConfigured
      ? fetchSessions(workspace.id, token)
      : Promise.resolve(null),
    workspace.waServerConfigured
      ? fetchHealthOk(workspace.id, token)
      : Promise.resolve(false),
    fetchStats(workspace.id, token),
  ])

  // Session counts
  const sessionList: Session[] = sessions ?? []
  const connected = sessionList.filter((s) => s.status === "connected").length
  const qrPending = sessionList.filter((s) =>
    ["qr_ready", "connecting"].includes(s.status),
  ).length
  const offline = sessionList.filter((s) =>
    ["disconnected", "logged_out", "failed", "qr_expired"].includes(s.status),
  ).length
  const total = sessionList.length

  // 24h trend label
  const diff = stats
    ? Math.abs(stats.messages24h.count - stats.messages24h.previousDayCount)
    : 0
  const trend24h: "up" | "down" | "neutral" =
    stats && stats.messages24h.count > stats.messages24h.previousDayCount
      ? "up"
      : stats && stats.messages24h.count < stats.messages24h.previousDayCount
        ? "down"
        : "neutral"
  const trendLabel =
    trend24h === "up"
      ? `↑ +${diff} respecto a ayer`
      : trend24h === "down"
        ? `↓ ${diff} menos que ayer`
        : "Igual que ayer"

  // Donut chart data (top 6 by type)
  const byTypeEntries = stats
    ? Object.entries(stats.eventsToday.byType)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
    : []

  // 7-day sparkline values for messages card
  const sparkline7d = stats?.messages7d.map((d) => d.count) ?? []

  // Recent activity
  const recentActivity: ActivityItem[] = stats?.recentActivity.slice(0, 8) ?? []

  const allZero =
    stats !== null &&
    stats.messages7d.every((d) => d.count === 0) &&
    stats.eventsToday.count === 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{workspace.name}</h1>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Resumen del espacio de trabajo</p>
        </div>
        {workspace.waServerConfigured && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              serverOnline
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                serverOnline
                  ? "bg-green-500 animate-status-connected"
                  : "bg-red-500",
              )}
            />
            Servidor WA: {serverOnline ? "En línea" : "Desconectado"}
          </span>
        )}
      </div>

      {/* WA Server not configured warning */}
      {!workspace.waServerConfigured && (
        <Card className="border-amber-400/30 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Servidor WA no configurado.{" "}
              <Link
                href="/dashboard/settings"
                className="font-medium underline underline-offset-2"
              >
                Ve a Configuración
              </Link>{" "}
              para agregar la URL y el token de tu servidor.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Row 1 — 4 metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <AnimatedStatCard
          title="Sesiones"
          value={`${connected} / ${total}`}
          sub={`${qrPending} pendientes · ${offline} desconectadas`}
          trend="neutral"
          icon={<Smartphone className={ICON_CLASS} />}
        />
        <AnimatedStatCard
          title="Mensajes (24h)"
          value={stats ? stats.messages24h.count.toLocaleString() : "—"}
          targetCount={stats?.messages24h.count}
          sub={stats ? trendLabel : undefined}
          trend={stats ? trend24h : undefined}
          icon={<MessageSquare className={ICON_CLASS} />}
          sparkline={sparkline7d.length >= 2 ? sparkline7d : undefined}
        />
        <AnimatedStatCard
          title="Tasa de éxito"
          value={stats ? `${stats.successRate24h.percentage}%` : "—"}
          targetCount={stats?.successRate24h.percentage}
          suffix="%"
          sub={stats ? `${stats.successRate24h.failed} fallidos hoy` : undefined}
          trend={
            stats
              ? stats.successRate24h.percentage >= 95
                ? "up"
                : stats.successRate24h.percentage < 80
                  ? "down"
                  : "neutral"
              : undefined
          }
          icon={<ShieldCheck className={ICON_CLASS} />}
        />
        <AnimatedStatCard
          title="Eventos de hoy"
          value={stats ? stats.eventsToday.count.toLocaleString() : "—"}
          targetCount={stats?.eventsToday.count}
          sub={
            stats
              ? `en ${Object.keys(stats.eventsToday.byType).length} tipos`
              : undefined
          }
          trend="neutral"
          icon={<Zap className={ICON_CLASS} />}
        />
      </div>

      {/* Agent performance — response times, chats attended & solved */}
      <AgentWorkCard />

      {/* Error banners */}
      {sessions === null && workspace.waServerConfigured && (
        <ApiError message="No se pudieron cargar las sesiones. Revisa la conexión al servidor WA en Configuración." />
      )}
      {stats === null && (
        <ApiError message="No se pudieron cargar las estadísticas. La API del panel puede no estar disponible." />
      )}

      {/* Empty state for new workspaces */}
      {allZero && (
        <div className="rounded-xl border bg-muted/30 px-6 py-10 text-center">
          <p className="text-base font-medium text-foreground">Aún no hay actividad</p>
          <p className="text-sm text-zinc-400 mt-1">
            Envía tu primer mensaje para llenar este panel.
          </p>
        </div>
      )}

      {/* Row 2 — 7-day bar chart */}
      {stats && stats.messages7d.length > 0 && !allZero && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-primary" />
              <CardTitle className="text-base font-medium text-foreground">
                Mensajes — últimos 7 días
              </CardTitle>
            </div>
            <p className="text-xs text-zinc-400 font-light">Volumen diario de mensajes</p>
          </CardHeader>
          <CardContent>
            <AnimatedBarChart data={stats.messages7d} />
          </CardContent>
        </Card>
      )}

      {/* Row 3 — Donut by type + recent activity */}
      {stats && !allZero && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <ActivitySquare size={16} className="text-primary" />
                <CardTitle className="text-base font-medium text-foreground">
                  Por tipo de mensaje
                </CardTitle>
              </div>
              <p className="text-xs text-zinc-400 font-light">Los 6 tipos más enviados hoy</p>
            </CardHeader>
            <CardContent>
              <DonutChart data={byTypeEntries} />
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-primary" />
                <CardTitle className="text-base font-medium text-foreground">
                  Actividad reciente
                </CardTitle>
              </div>
              <p className="text-xs text-zinc-400 font-light">Últimas 8 solicitudes a la API</p>
            </CardHeader>
            <CardContent className="pb-2">
              <ActivityFeed items={recentActivity} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fallback activity section when stats failed but sessions loaded */}
      {stats === null && sessions !== null && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-foreground">
                Por tipo de mensaje
              </CardTitle>
              <p className="text-xs text-zinc-500">Los 6 tipos más enviados hoy</p>
            </CardHeader>
            <CardContent>
              <DonutChart data={[]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-foreground">
                Actividad reciente
              </CardTitle>
              <p className="text-xs text-zinc-500">Últimas 8 solicitudes a la API</p>
            </CardHeader>
            <CardContent className="pb-2">
              <ActivityFeed items={[]} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
