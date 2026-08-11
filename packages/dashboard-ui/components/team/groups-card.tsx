"use client"

import * as React from "react"
import { toast } from "sonner"
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export type GroupMemberOption = { userId: string; email: string; name: string | null }

type Group = {
  id: string
  name: string
  description: string | null
  members: { userId: string; email: string; name: string | null; cargo: string | null }[]
}

type Draft = { id?: string; name: string; description: string; memberIds: string[] }

/**
 * "Grupos" — operator-defined teams of agents (e.g. Soporte, Ventas).
 * Owner/admin can create groups and assign workspace members to them.
 */
export function GroupsCard({ memberOptions }: { memberOptions: GroupMemberOption[] }) {
  const [groups, setGroups] = React.useState<Group[]>([])
  const [loading, setLoading] = React.useState(true)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/team/groups")
      const data = await res.json().catch(() => [])
      setGroups(Array.isArray(data) ? data : [])
    } catch { /* keep current */ }
    finally { setLoading(false) }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) { toast.error("El grupo necesita un nombre."); return }
    setSaving(true)
    try {
      const res = draft.id
        ? await fetch(`/api/team/groups/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description: draft.description, memberIds: draft.memberIds }),
          })
        : await fetch("/api/team/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description: draft.description }),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data?.message ?? "No se pudo guardar el grupo"); return }
      // Creating: apply the chosen members with a follow-up PATCH.
      if (!draft.id && data?.id && draft.memberIds.length > 0) {
        await fetch(`/api/team/groups/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberIds: draft.memberIds }),
        }).catch(() => null)
      }
      toast.success(draft.id ? "Grupo actualizado" : "Grupo creado")
      setDraft(null)
      void load()
    } catch { toast.error("No se pudo conectar con el servidor.") }
    finally { setSaving(false) }
  }

  const remove = async (g: Group) => {
    if (!confirm(`¿Eliminar el grupo "${g.name}"?`)) return
    const res = await fetch(`/api/team/groups/${g.id}`, { method: "DELETE" })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.message ?? "No se pudo eliminar"); return }
    toast.success("Grupo eliminado")
    void load()
  }

  const toggleMember = (userId: string) => {
    setDraft((d) => {
      if (!d) return d
      const has = d.memberIds.includes(userId)
      return { ...d, memberIds: has ? d.memberIds.filter((x) => x !== userId) : [...d.memberIds, userId] }
    })
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Boxes className="size-4 text-primary" /> Grupos ({groups.length})
        </h2>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setDraft({ name: "", description: "", memberIds: [] })}>
          <Plus className="size-3.5" /> Nuevo grupo
        </Button>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">Cargando…</p>
      ) : groups.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          Aún no hay grupos. Crea uno para organizar a tus agentes (p. ej. Soporte, Ventas).
        </p>
      ) : groups.map((g) => (
        <div key={g.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{g.name}</span>
              <span className="text-xs text-muted-foreground">
                {g.members.length} miembro{g.members.length === 1 ? "" : "s"}
              </span>
            </div>
            {g.description && <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {g.members.length === 0 ? (
                <span className="text-xs text-muted-foreground">Sin miembros</span>
              ) : g.members.map((m) => (
                <span key={m.userId} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary" title={m.email}>
                  {m.name ?? m.email.split("@")[0]}{m.cargo ? ` · ${m.cargo}` : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost" size="icon" className="size-8" title="Editar"
              onClick={() => setDraft({ id: g.id, name: g.name, description: g.description ?? "", memberIds: g.members.map((m) => m.userId) })}
            >
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-destructive" title="Eliminar" onClick={() => void remove(g)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      {/* create / edit dialog */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>{draft?.id ? "Editar grupo" : "Nuevo grupo"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="group-name">Nombre</Label>
                <Input id="group-name" value={draft.name} maxLength={60} placeholder="Soporte" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="group-desc">Descripción <span className="text-muted-foreground">(opcional)</span></Label>
                <Input id="group-desc" value={draft.description} maxLength={200} placeholder="Equipo de atención al cliente" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Miembros</Label>
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {memberOptions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No hay miembros en el espacio de trabajo.</span>
                  ) : memberOptions.map((m) => (
                    <label key={m.userId} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={draft.memberIds.includes(m.userId)}
                        onChange={() => toggleMember(m.userId)}
                        className="size-3.5 accent-primary"
                      />
                      <span className="min-w-0 truncate">{m.name ?? m.email}</span>
                      {m.name && <span className="truncate text-xs text-muted-foreground">{m.email}</span>}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
