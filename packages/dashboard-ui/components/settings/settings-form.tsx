"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Building2,
  Archive, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export interface Workspace {
  id: string
  name: string
  logo?: string | null
  nameStyle?: { color?: string; size?: string; font?: string } | null
  chatRetentionResolvedDays?: number | null
  chatRetentionArchivedDays?: number | null
}

interface SettingsFormProps {
  workspace: Workspace
}

// ─── Shared card header icon ──────────────────────────────────────────────────

function SectionIcon({ icon: Icon, className = "" }: { icon: React.ElementType; className?: string }) {
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ${className}`}>
      <Icon size={17} className="text-primary" />
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function SettingsForm({ workspace }: SettingsFormProps) {
  // Workspace name state
  const [name, setName] = React.useState(workspace.name)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [nameSubmitting, setNameSubmitting] = React.useState(false)

  // Chat retention state — 0 disables the policy
  const [retentionResolvedDays, setRetentionResolvedDays] = React.useState<number>(
    workspace.chatRetentionResolvedDays ?? 0,
  )
  const [retentionArchivedDays, setRetentionArchivedDays] = React.useState<number>(
    workspace.chatRetentionArchivedDays ?? 0,
  )
  const [retentionError, setRetentionError] = React.useState<string | null>(null)
  const [retentionSubmitting, setRetentionSubmitting] = React.useState(false)

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameError(null)
    setNameSubmitting(true)
    try {
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNameError(Array.isArray(data.message) ? data.message.join(" ") : (data.message ?? "No se pudo actualizar."))
        return
      }
      toast.success("Nombre del espacio de trabajo actualizado.")
    } catch {
      setNameError("No se pudo comunicar con el servidor.")
    } finally {
      setNameSubmitting(false)
    }
  }

  const handleRetentionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRetentionError(null)
    setRetentionSubmitting(true)
    try {
      const resolved = Number(retentionResolvedDays)
      const archived = Number(retentionArchivedDays)
      if (!Number.isInteger(resolved) || resolved < 0 || resolved > 3650) {
        setRetentionError("Días para archivar resueltos debe ser un entero entre 0 y 3650.")
        return
      }
      if (!Number.isInteger(archived) || archived < 0 || archived > 3650) {
        setRetentionError("Días para eliminar archivados debe ser un entero entre 0 y 3650.")
        return
      }
      const res = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatRetentionResolvedDays: resolved,
          chatRetentionArchivedDays: archived,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRetentionError(Array.isArray(data.message) ? data.message.join(" ") : (data.message ?? "No se pudo guardar."))
        return
      }
      toast.success("Política de retención de chats guardada.")
    } catch {
      setRetentionError("No se pudo comunicar con el servidor.")
    } finally {
      setRetentionSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-primary/20 [background-image:radial-gradient(hsl(var(--primary)/0.04)_1px,transparent_1px)] [background-size:20px_20px]">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <SectionIcon icon={Building2} />
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Espacio de trabajo</CardTitle>
                <CardDescription className="text-xs text-zinc-400 font-light mt-0.5">
                  Identidad general del espacio de trabajo
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="bg-background/60 rounded-b-xl pt-4 border-t border-primary/10">
            <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workspace-name" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Building2 size={13} className="text-zinc-400" />
                  Nombre del espacio de trabajo
                </Label>
                <Input
                  id="workspace-name"
                  type="text"
                  placeholder="Mi espacio de trabajo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="placeholder:text-zinc-400 placeholder:font-light"
                />
              </div>
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
              <div>
                <Button type="submit" disabled={nameSubmitting} size="sm">
                  {nameSubmitting ? "Guardando…" : "Guardar nombre"}
                </Button>
              </div>
            </form>

          </CardContent>
      </Card>

      <Card className="border-primary/20 [background-image:radial-gradient(hsl(var(--primary)/0.04)_1px,transparent_1px)] [background-size:20px_20px]">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <SectionIcon icon={Archive} />
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-foreground">Retención de chats</CardTitle>
              <CardDescription className="text-xs text-zinc-400 font-light mt-0.5">
                Archiva y elimina conversaciones automáticamente para optimizar almacenamiento
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="bg-background/60 rounded-b-xl pt-4 border-t border-primary/10">
          <form onSubmit={handleRetentionSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retention-resolved" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Archive size={13} className="text-zinc-400" />
                Archivar chats resueltos tras (días)
              </Label>
              <Input
                id="retention-resolved"
                type="number"
                min={0}
                max={3650}
                placeholder="0 = no archivar automáticamente"
                value={retentionResolvedDays}
                onChange={(e) => setRetentionResolvedDays(Number(e.target.value))}
                className="placeholder:text-zinc-400 placeholder:font-light"
              />
              <p className="text-xs text-zinc-400 font-light">
                Los chats marcados como <strong>Solucionado</strong> se moverán a <strong>Archivados</strong> al cumplirse este tiempo.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retention-archived" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Trash2 size={13} className="text-zinc-400" />
                Eliminar chats archivados tras (días)
              </Label>
              <Input
                id="retention-archived"
                type="number"
                min={0}
                max={3650}
                placeholder="0 = no eliminar automáticamente"
                value={retentionArchivedDays}
                onChange={(e) => setRetentionArchivedDays(Number(e.target.value))}
                className="placeholder:text-zinc-400 placeholder:font-light"
              />
              <p className="text-xs text-zinc-400 font-light">
                Los chats <strong>Archivados</strong> se eliminarán permanentemente junto con sus mensajes.
              </p>
            </div>

            {retentionError && <p className="text-xs text-destructive sm:col-span-2">{retentionError}</p>}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={retentionSubmitting} size="sm">
                {retentionSubmitting ? "Guardando…" : "Guardar política de retención"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

    </div>
  )
}
