"use client"

import * as React from "react"
import { BarChart3, Clock, MessageSquare, CheckCircle2, Headset, Trophy, FileSpreadsheet, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AgentWorkRow = {
  userId: string
  email: string
  name: string | null
  cargo: string | null
  role: string
  chatsAtendidos: number
  marcadosAtendido: number
  marcadosSolucionado: number
  marcadosPendiente: number
  mensajesEnviados: number
  avgResponseSeconds: number | null
  respuestas: number
  tasaSolucion: number | null
}

function localISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayLocalISO(): string {
  return localISO(new Date())
}

// Seconds → compact human duration: "45s", "2m 10s", "1h 5m".
function fmtDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "—"
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return s ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}

// Pretty label for the selected range, e.g. "20 jul 2026" or "1 – 20 jul 2026".
function rangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`)
  const t = new Date(`${to}T00:00:00`)
  const fmt = (d: Date) => d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" })
  return from === to ? fmt(f) : `${fmt(f)} – ${fmt(t)}`
}

// One summary KPI tile. Colors come from existing tokens — no new palette.
function Kpi({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: React.ElementType
  label: string
  value: string
  tone?: "primary" | "emerald" | "blue" | "amber"
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  }[tone]
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
        <Icon className="size-4.5" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-lg font-semibold leading-tight tabular-nums text-foreground">{value}</span>
        <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

// Quick range presets → [from, to] as local YYYY-MM-DD strings.
const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "today", label: "Hoy", range: () => [todayLocalISO(), todayLocalISO()] },
  {
    key: "7d",
    label: "7 días",
    range: () => {
      const to = new Date()
      const from = new Date(to.getTime() - 6 * 86_400_000)
      return [localISO(from), localISO(to)]
    },
  },
  {
    key: "30d",
    label: "30 días",
    range: () => {
      const to = new Date()
      const from = new Date(to.getTime() - 29 * 86_400_000)
      return [localISO(from), localISO(to)]
    },
  },
  {
    key: "month",
    label: "Este mes",
    range: () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return [localISO(from), localISO(now)]
    },
  },
]

/**
 * "Trabajo diario" — per-agent activity over a selectable date range: chats
 * taken over, attention marks, messages sent and average first-response time.
 * Data comes from the conversation_events trail plus per-agent message
 * attribution. Supports exporting a detailed report to Excel (CSV) or PDF.
 */
export function AgentWorkCard() {
  const [from, setFrom] = React.useState(todayLocalISO())
  const [to, setTo] = React.useState(todayLocalISO())
  const [rows, setRows] = React.useState<AgentWorkRow[]>([])
  const [loading, setLoading] = React.useState(true)

  // Guard against an inverted range (from after to).
  const invalidRange = from > to

  React.useEffect(() => {
    if (invalidRange) return
    let cancelled = false
    setLoading(true)
    // Local-day boundaries → ISO, so the report matches the operator's timezone.
    // `to` is inclusive: extend it to the end of that day (start of the next).
    const fromDate = new Date(`${from}T00:00:00`)
    const toDate = new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000)
    const qs = new URLSearchParams({ from: fromDate.toISOString(), to: toDate.toISOString() })
    fetch(`/api/team/agent-work?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { agents?: AgentWorkRow[] } | null) => {
        if (!cancelled) setRows(d?.agents ?? [])
      })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [from, to, invalidRange])

  const activePreset = PRESETS.find((p) => {
    const [pf, pt] = p.range()
    return pf === from && pt === to
  })?.key

  // Only agents with activity are worth showing in the ranked table.
  const active = rows.filter(
    (r) => r.chatsAtendidos || r.marcadosAtendido || r.marcadosSolucionado || r.marcadosPendiente || r.mensajesEnviados,
  )

  // Team totals for the summary tiles.
  const totals = React.useMemo(() => {
    let atendidos = 0, solucionados = 0, mensajes = 0, respSum = 0, respCount = 0
    for (const r of rows) {
      atendidos += r.chatsAtendidos
      solucionados += r.marcadosSolucionado
      mensajes += r.mensajesEnviados
      if (r.avgResponseSeconds !== null && r.respuestas > 0) {
        respSum += r.avgResponseSeconds * r.respuestas
        respCount += r.respuestas
      }
    }
    return {
      atendidos,
      solucionados,
      mensajes,
      avgResponse: respCount > 0 ? respSum / respCount : null,
    }
  }, [rows])

  // ── Exports ────────────────────────────────────────────────────────────
  const HEADERS = [
    "Agente", "Cargo", "Email", "Rol",
    "Chats atendidos", "Marcados atendido", "Solucionados", "Pendientes",
    "Tasa solución (%)", "Mensajes enviados", "Respuestas medidas",
    "Tiempo respuesta prom.", "Segundos respuesta prom.",
  ]

  const reportRows = () =>
    active.map((r) => [
      r.name ?? r.email,
      r.cargo ?? "",
      r.email,
      r.role,
      r.chatsAtendidos,
      r.marcadosAtendido,
      r.marcadosSolucionado,
      r.marcadosPendiente,
      r.tasaSolucion ?? "",
      r.mensajesEnviados,
      r.respuestas,
      fmtDuration(r.avgResponseSeconds),
      r.avgResponseSeconds ?? "",
    ])

  const fileStamp = () => (from === to ? from : `${from}_${to}`)

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = String(v ?? "")
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    lines.push(`Reporte de trabajo por agente`)
    lines.push(`Rango:;${rangeLabel(from, to)}`)
    lines.push(`Generado:;${new Date().toLocaleString("es-EC")}`)
    lines.push("")
    lines.push(`Resumen del equipo`)
    lines.push(`Chats atendidos;${totals.atendidos}`)
    lines.push(`Chats solucionados;${totals.solucionados}`)
    lines.push(`Mensajes enviados;${totals.mensajes}`)
    lines.push(`Tiempo de respuesta prom.;${fmtDuration(totals.avgResponse)}`)
    lines.push("")
    // Use ';' as the delimiter — the locale Excel expects in es-EC/ES.
    lines.push(HEADERS.map(esc).join(";"))
    for (const row of reportRows()) lines.push(row.map(esc).join(";"))
    // BOM so Excel detects UTF-8 (accents, ñ) correctly.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trabajo-agentes_${fileStamp()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    const esc = (v: unknown) =>
      String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))
    const bodyRows = reportRows()
      .map(
        (row, i) =>
          `<tr>${row
            .filter((_, ci) => ci !== 12) // drop raw-seconds helper column
            .map((cell, ci) => `<td class="${ci >= 4 ? "num" : ""}">${esc(cell === "" ? "—" : cell)}</td>`)
            .join("")}</tr>`,
      )
      .join("")
    const cols = HEADERS.filter((_, i) => i !== 12)
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Trabajo por agente — ${esc(rangeLabel(from, to))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
  .cards { display: flex; gap: 12px; margin-bottom: 22px; flex-wrap: wrap; }
  .card { border: 1px solid #e3e3e3; border-radius: 10px; padding: 10px 14px; min-width: 150px; }
  .card .v { font-size: 20px; font-weight: 700; }
  .card .l { font-size: 11px; color: #666; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e3e3e3; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #555; }
  td.num, th.num { text-align: center; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .empty { color: #888; padding: 24px; text-align: center; }
  @media print { body { margin: 12px; } @page { size: landscape; margin: 12mm; } }
</style></head><body>
  <h1>Reporte de trabajo por agente</h1>
  <div class="meta">Rango: <strong>${esc(rangeLabel(from, to))}</strong> · Generado: ${esc(new Date().toLocaleString("es-EC"))}</div>
  <div class="cards">
    <div class="card"><div class="v">${totals.atendidos}</div><div class="l">Chats atendidos</div></div>
    <div class="card"><div class="v">${totals.solucionados}</div><div class="l">Chats solucionados</div></div>
    <div class="card"><div class="v">${totals.mensajes}</div><div class="l">Mensajes enviados</div></div>
    <div class="card"><div class="v">${esc(fmtDuration(totals.avgResponse))}</div><div class="l">Resp. promedio</div></div>
  </div>
  ${
    bodyRows
      ? `<table><thead><tr>${cols
          .map((h, i) => `<th class="${i >= 4 ? "num" : ""}">${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${bodyRows}</tbody></table>`
      : `<div class="empty">Sin actividad de agentes en el rango seleccionado.</div>`
  }
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`
    const w = window.open("", "_blank")
    if (!w) {
      // Popup blocked — fall back to a data-URL download the user can print.
      const blob = new Blob([html], { type: "text/html" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `trabajo-agentes_${fileStamp()}.html`
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    w.document.write(html)
    w.document.close()
  }

  const canExport = !loading && active.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <BarChart3 className="size-4.5 text-primary" /> Trabajo por agente
          </h2>
          <p className="text-xs text-muted-foreground">
            Productividad y tiempos de respuesta del equipo en el rango seleccionado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!canExport} onClick={exportCsv}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!canExport} onClick={exportPdf}>
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Range controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { const [pf, pt] = p.range(); setFrom(pf); setTo(pt) }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                activePreset === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Desde</span>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => { if (e.target.value) setFrom(e.target.value) }}
            className="h-9 w-40 text-sm"
          />
          <span className="text-xs text-muted-foreground">Hasta</span>
          <Input
            type="date"
            value={to}
            min={from}
            max={todayLocalISO()}
            onChange={(e) => { if (e.target.value) setTo(e.target.value) }}
            className="h-9 w-40 text-sm"
          />
        </div>
      </div>

      {invalidRange && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          La fecha inicial no puede ser posterior a la final.
        </p>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Headset} tone="primary" label="Chats atendidos" value={loading ? "—" : String(totals.atendidos)} />
        <Kpi icon={CheckCircle2} tone="emerald" label="Chats solucionados" value={loading ? "—" : String(totals.solucionados)} />
        <Kpi icon={MessageSquare} tone="blue" label="Mensajes enviados" value={loading ? "—" : String(totals.mensajes)} />
        <Kpi icon={Clock} tone="amber" label="Tiempo de respuesta prom." value={loading ? "—" : fmtDuration(totals.avgResponse)} />
      </div>

      {/* Ranked table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <BarChart3 className="size-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Sin actividad en este rango</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Los chats gestionados solo por el Bot IA no cuentan como trabajo de agente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Agente</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Chats de los que se hizo cargo">Atendidos</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Chats marcados como solucionados">Solucionados</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Solucionados ÷ atendidos">Tasa</th>
                  <th className="px-3 py-2.5 text-center font-medium">Mensajes</th>
                  <th className="px-3 py-2.5 text-center font-medium" title="Tiempo promedio hasta la primera respuesta del agente">Resp. prom.</th>
                </tr>
              </thead>
              <tbody>
                {active.map((r, i) => (
                  <tr key={r.userId} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(r.name ?? r.email)}
                          {i === 0 && (
                            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                              <Trophy className="size-2.5" />
                            </span>
                          )}
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">{r.name ?? r.email}</span>
                          <span className="truncate text-[11px] text-muted-foreground">{r.cargo ?? r.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{r.chatsAtendidos}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{r.marcadosSolucionado}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {r.tasaSolucion === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">
                          {r.tasaSolucion}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{r.mensajesEnviados}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
                        {r.avgResponseSeconds !== null && <Clock className="size-3 text-muted-foreground" />}
                        {fmtDuration(r.avgResponseSeconds)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
