"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ExternalLink } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ApiError } from "@/components/ui/api-error"
import { EmptyState } from "@/components/ui/empty-state"

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string
  sessionId?: string | null
  method: string
  path: string
  statusCode: number
  durationMs?: number | null
  timestamp: string
}

interface AuditLogsResponse {
  items: AuditLog[]
  total: number
  page: number
  pageSize: number
}

interface Filters {
  sessionId: string
  from: string
  to: string
  statusCode: string
}

// ─── API Reference Tab ────────────────────────────────────────────────────────

interface ApiReferenceTabProps {
  waServerUrl: string | null
}

function ApiReferenceTab({ waServerUrl }: ApiReferenceTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* WA Server URL */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-foreground">WA Server URL</Label>
        {waServerUrl ? (
          <div className="flex items-center gap-2">
            <Input value={waServerUrl} readOnly className="font-mono text-sm placeholder:text-zinc-400 placeholder:font-light" />
            <a
              href={`${waServerUrl}/api/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink className="size-3.5" />
              Ver documentación de API
            </a>
          </div>
        ) : (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">No configurado</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Las API Keys, los tokens del WA Server y los webhooks se administran en{" "}
        <a href="/dashboard/connections" className="font-medium text-primary underline underline-offset-2">
          Conexiones
        </a>
        .
      </p>
    </div>
  )
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditLogTab() {
  const [page, setPage] = React.useState(1)
  const pageSize = 50

  const [pendingFilters, setPendingFilters] = React.useState<Filters>({
    sessionId: "",
    from: "",
    to: "",
    statusCode: "",
  })
  const [appliedFilters, setAppliedFilters] = React.useState<Filters>({
    sessionId: "",
    from: "",
    to: "",
    statusCode: "",
  })

  const [items, setItems] = React.useState<AuditLog[]>([])
  const [total, setTotal] = React.useState(0)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Guard against overlapping fetches.
  const isFetchingRef = React.useRef(false)

  const fetchLogs = React.useCallback(
    async (currentPage: number, filters: Filters) => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set("page", String(currentPage))
        params.set("pageSize", String(pageSize))
        if (filters.sessionId) params.set("sessionId", filters.sessionId)
        if (filters.from) params.set("from", filters.from)
        if (filters.to) params.set("to", filters.to)
        if (filters.statusCode) params.set("statusCode", filters.statusCode)

        const res = await fetch(`/api/developer/audit-logs?${params.toString()}`)
        if (!res.ok) {
          setError("Could not load audit logs.")
          return
        }
        const data: AuditLogsResponse = await res.json()
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
      } catch {
        setError("Could not load audit logs.")
      } finally {
        setIsLoading(false)
        isFetchingRef.current = false
      }
    },
    [pageSize]
  )

  // Fetch on mount and whenever page or applied filters change.
  React.useEffect(() => {
    fetchLogs(page, appliedFilters)
  }, [page, appliedFilters, fetchLogs])

  const handleApply = () => {
    setPage(1)
    setAppliedFilters({ ...pendingFilters })
  }

  const hasNextPage = page * pageSize < total

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="al-session" className="text-sm font-medium text-foreground">ID de sesión</Label>
          <Input
            id="al-session"
            placeholder="id-sesion"
            value={pendingFilters.sessionId}
            onChange={(e) =>
              setPendingFilters((f) => ({ ...f, sessionId: e.target.value }))
            }
            className="w-40 placeholder:text-zinc-400 placeholder:font-light"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="al-status" className="text-sm font-medium text-foreground">Código de estado</Label>
          <Input
            id="al-status"
            placeholder="200"
            value={pendingFilters.statusCode}
            onChange={(e) =>
              setPendingFilters((f) => ({ ...f, statusCode: e.target.value }))
            }
            className="w-24 placeholder:text-zinc-400 placeholder:font-light"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="al-from" className="text-sm font-medium text-foreground">Desde</Label>
          <Input
            id="al-from"
            type="datetime-local"
            value={pendingFilters.from}
            onChange={(e) =>
              setPendingFilters((f) => ({ ...f, from: e.target.value }))
            }
            className="w-52 placeholder:text-zinc-400 placeholder:font-light"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="al-to" className="text-sm font-medium text-foreground">Hasta</Label>
          <Input
            id="al-to"
            type="datetime-local"
            value={pendingFilters.to}
            onChange={(e) =>
              setPendingFilters((f) => ({ ...f, to: e.target.value }))
            }
            className="w-52 placeholder:text-zinc-400 placeholder:font-light"
          />
        </div>

        <Button variant="outline" onClick={handleApply}>
          Aplicar
        </Button>
      </div>

      {/* Table */}
      {error ? (
        <ApiError
          message="No se pudieron cargar los registros de auditoría."
          onRetry={() => fetchLogs(page, appliedFilters)}
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-shimmer-mint rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState message="Sin registros de auditoría." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Marca de tiempo</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">ID de sesión</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Método</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Ruta</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Duración (ms)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((log) => (
              <TableRow key={log.id} className="hover:bg-muted/40 hover:-translate-y-px hover:shadow-sm transition-all duration-150 ease-out">
                <TableCell className="text-xs text-zinc-400 font-light tabular-nums">
                  {new Date(log.timestamp).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                  {log.sessionId ?? "—"}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {log.method}
                  </span>
                </TableCell>
                <TableCell className="max-w-xs truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">
                  {log.path}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      log.statusCode >= 500
                        ? "font-medium text-destructive"
                        : log.statusCode >= 400
                          ? "font-medium text-amber-600 dark:text-amber-400"
                          : "font-medium text-green-600 dark:text-green-400"
                    }
                  >
                    {log.statusCode}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-zinc-700 dark:text-zinc-300 tabular-nums">
                  {log.durationMs ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {!error && !isLoading && items.length > 0 && (
        <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
          <span>
            Página {page} — {total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Developer Panel ──────────────────────────────────────────────────────────

interface DeveloperPanelProps {
  waServerUrl: string | null
}

export function DeveloperPanel({ waServerUrl }: DeveloperPanelProps) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const validTabs = ["api-reference", "audit-log"] as const
  type Tab = typeof validTabs[number]
  const initialTab: Tab = (validTabs as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "api-reference"
  const [activeTab, setActiveTab] = React.useState<Tab>(initialTab)

  return (
    <Tabs
      value={activeTab}
      onValueChange={(val) =>
        setActiveTab(val as "api-reference" | "audit-log")
      }
    >
      <TabsList>
        <TabsTrigger value="api-reference">Referencia de API</TabsTrigger>
        <TabsTrigger value="audit-log">Registro de auditoría</TabsTrigger>
      </TabsList>

      <TabsContent value="api-reference" className="mt-4">
        <ApiReferenceTab waServerUrl={waServerUrl} />
      </TabsContent>

      <TabsContent value="audit-log" className="mt-4">
        <AuditLogTab />
      </TabsContent>
    </Tabs>
  )
}
