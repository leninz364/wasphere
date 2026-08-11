"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2, Copy, Check, Link2, Pencil, Plus, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AgentWorkCard } from "@/components/team/agent-work-card"
import { GroupsCard } from "@/components/team/groups-card"

type Member = {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  cedula: string | null
  cargo: string | null
  name: string | null
  role: "OWNER" | "ADMIN" | "MEMBER"
  customRoleId: string | null
  roleName: string
  capabilities: string[]
  joinedAt: string
}

type ProfileDraft = {
  userId: string
  email: string
  firstName: string
  lastName: string
  cedula: string
  cargo: string
}
type Invite = { id: string; role: string; roleName: string; createdAt: string; expiresAt: string }
type Role = { id: string; name: string; capabilities: string[]; memberCount: number }

// Must match CAPABILITIES in dashboard-api/src/lib/capabilities.ts.
const CAP_LABELS: Record<string, string> = {
  inbox: "Bandeja",
  contacts: "Contactos",
  messages: "Mensajes",
  sessions: "Sesiones",
  webhooks: "Webhooks",
  api_keys: "Claves de API",
  settings: "Configuración",
}
const ALL_CAPS = Object.keys(CAP_LABELS)

const ADMIN = "ADMIN"

export default function TeamPage() {
  const [members, setMembers] = React.useState<Member[]>([])
  const [invites, setInvites] = React.useState<Invite[]>([])
  const [roles, setRoles] = React.useState<Role[]>([])
  const [myRole, setMyRole] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [inviteRole, setInviteRole] = React.useState<string>("")
  const [inviteEmail, setInviteEmail] = React.useState<string>("")
  const [creating, setCreating] = React.useState(false)
  const [newLink, setNewLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  // Role editor dialog
  const [editingRole, setEditingRole] = React.useState<{ id?: string; name: string; capabilities: string[] } | null>(null)
  const [savingRole, setSavingRole] = React.useState(false)

  // Agent profile dialog (nombre, apellido, cédula, cargo)
  const [editingProfile, setEditingProfile] = React.useState<ProfileDraft | null>(null)
  const [savingProfile, setSavingProfile] = React.useState(false)

  const load = React.useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true)
    try {
      const [mr, m, i, r] = await Promise.all([
        fetch("/api/team/my-role").then((x) => x.json()).catch(() => ({})),
        fetch("/api/team/members").then((x) => x.json()).catch(() => []),
        fetch("/api/team/invites").then((x) => x.json()).catch(() => []),
        fetch("/api/team/roles").then((x) => x.json()).catch(() => []),
      ])
      setMyRole(mr?.role ?? null)
      setMembers(Array.isArray(m) ? m : [])
      setInvites(Array.isArray(i) ? i : [])
      setRoles(Array.isArray(r) ? r : [])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const isOwner = myRole === "OWNER"
  const canManage = myRole === "OWNER" || myRole === "ADMIN"

  // Default the invite picker to the first custom role once roles load.
  React.useEffect(() => {
    if (!inviteRole && roles.length > 0) setInviteRole(roles[0].id)
  }, [roles, inviteRole])

  const createInvite = async () => {
    if (!inviteRole) { toast.error("Primero elige un rol."); return }
    const email = inviteEmail.trim()
    setCreating(true); setNewLink(null)
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { role: inviteRole, email } : { role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.message ?? "No se pudo crear la invitación"); return }
      const link = data.token ? `${window.location.origin}/invite/${data.token}` : data.inviteUrl
      setNewLink(link)
      if (data.emailed) toast.success(`Invitación enviada por correo a ${email}.`)
      else if (email) toast.message("Enlace de invitación creado — el correo no se pudo enviar, comparte el enlace de abajo.")
      setInviteEmail("")
      void load(true)
    } catch { toast.error("No se pudo conectar con el servidor.") }
    finally { setCreating(false) }
  }

  const copyLink = async () => {
    if (!newLink) return
    await navigator.clipboard.writeText(newLink).catch(() => null)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const assignRole = async (userId: string, role: string) => {
    const res = await fetch(`/api/team/members/${userId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.message ?? "No se pudo cambiar el rol"); return }
    toast.success("Rol actualizado"); void load(true)
  }

  const saveProfile = async () => {
    if (!editingProfile) return
    setSavingProfile(true)
    try {
      const res = await fetch(`/api/team/members/${editingProfile.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editingProfile.firstName,
          lastName: editingProfile.lastName,
          cedula: editingProfile.cedula,
          cargo: editingProfile.cargo,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.message ?? "No se pudo guardar el perfil"); return }
      toast.success("Perfil actualizado")
      setEditingProfile(null)
      void load(true)
    } catch { toast.error("No se pudo conectar con el servidor.") }
    finally { setSavingProfile(false) }
  }

  const removeMember = async (userId: string, email: string) => {
    if (!confirm(`¿Quitar a ${email} del espacio de trabajo?`)) return
    const res = await fetch(`/api/team/members/${userId}`, { method: "DELETE" })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.message ?? "No se pudo quitar"); return }
    toast.success("Miembro eliminado"); void load(true)
  }

  const revokeInvite = async (id: string) => {
    const res = await fetch(`/api/team/invites/${id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("No se pudo revocar"); return }
    void load(true)
  }

  // ── Roles ────────────────────────────────────────────────────────────────
  const saveRole = async () => {
    if (!editingRole) return
    if (!editingRole.name.trim()) { toast.error("Ponle un nombre al rol."); return }
    setSavingRole(true)
    try {
      const body = JSON.stringify({ name: editingRole.name.trim(), capabilities: editingRole.capabilities })
      const res = editingRole.id
        ? await fetch(`/api/team/roles/${editingRole.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/team/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.message ?? "No se pudo guardar el rol"); return }
      toast.success(editingRole.id ? "Rol actualizado" : "Rol creado")
      setEditingRole(null); void load(true)
    } catch { toast.error("No se pudo conectar con el servidor.") }
    finally { setSavingRole(false) }
  }

  const deleteRole = async (role: Role) => {
    if (!confirm(`¿Eliminar el rol "${role.name}"?`)) return
    const res = await fetch(`/api/team/roles/${role.id}`, { method: "DELETE" })
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.message ?? "No se pudo eliminar"); return }
    toast.success("Rol eliminado"); void load(true)
  }

  const toggleDraftCap = (cap: string) => {
    setEditingRole((prev) => prev && ({
      ...prev,
      capabilities: prev.capabilities.includes(cap) ? prev.capabilities.filter((c) => c !== cap) : [...prev.capabilities, cap],
    }))
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>

  // Agents (MEMBER) can open the Team section but only see the daily-work
  // report — no invites, roles, members management or groups.
  if (!canManage) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Equipo</h1>
          <p className="text-sm text-muted-foreground">Rendimiento diario del equipo.</p>
        </div>
        <AgentWorkCard />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Equipo</h1>

      {/* Invite */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Invitar a un compañero</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Rol</Label>
            <select id="role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="h-9 min-w-[200px] rounded-md border border-input bg-transparent px-3 text-sm">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              {isOwner && <option value={ADMIN}>Administrador (acceso total)</option>}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inviteEmail">Correo <span className="text-muted-foreground">(opcional)</span></Label>
            <Input id="inviteEmail" type="email" placeholder="teammate@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="h-9 min-w-[220px]" />
          </div>
          <Button onClick={() => void createInvite()} disabled={creating || !inviteRole}>
            <Link2 className="mr-1.5 size-4" /> {creating ? "Generando…" : inviteEmail.trim() ? "Enviar invitación" : "Generar enlace de invitación"}
          </Button>
        </div>
        {newLink && (
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-input bg-muted/40 px-2.5 py-2 text-xs">{newLink}</code>
            <Button variant="outline" size="icon" onClick={copyLink}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Agrega un correo para enviar la invitación directamente, o déjalo en blanco para solo generar un enlace. Expira en 7 días. La persona se une con el rol que elijas y define su propia contraseña.</p>
      </div>

      {/* Roles */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">Roles</h2>
          {isOwner && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditingRole({ name: "", capabilities: ["inbox", "contacts"] })}>
              <Plus className="size-3.5" /> Nuevo rol
            </Button>
          )}
        </div>

        {/* System Owner/Admin tiers (always full access, not editable) */}
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <Shield className="size-4 shrink-0 text-amber-500" />
          <span className="text-sm font-medium">Propietario y administrador</span>
          <span className="text-xs text-muted-foreground">Acceso total — todas las secciones</span>
        </div>

        {roles.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Aún no hay roles personalizados.{isOwner ? " Crea uno para definir qué pueden hacer los agentes." : ""}</p>
        ) : roles.map((r) => (
          <div key={r.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.memberCount} miembro{r.memberCount === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.capabilities.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Sin acceso</span>
                ) : r.capabilities.map((c) => (
                  <span key={c} className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">{CAP_LABELS[c] ?? c}</span>
                ))}
              </div>
            </div>
            {isOwner && (
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditingRole({ id: r.id, name: r.name, capabilities: r.capabilities })} title="Editar">
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => void deleteRole(r)} title="Eliminar">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Invitaciones pendientes ({invites.length})</h2>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
              <span className="text-sm">Invitación de {i.roleName}</span>
              <span className="text-xs text-muted-foreground">expira {new Date(i.expiresAt).toLocaleDateString()}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void revokeInvite(i.id)}>Revocar</Button>
            </div>
          ))}
        </div>
      )}

      {/* Members */}
      <div className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-2.5 text-sm font-semibold">Miembros ({members.length})</h2>
        {members.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold">
              {(m.name ?? m.email)[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{m.name ?? m.email}</span>
                {m.cargo && <span className="shrink-0 rounded-full bg-primary/5 px-2 py-0.5 text-[10px] text-primary">{m.cargo}</span>}
              </div>
              {m.name && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
            </div>
            <Button
              variant="ghost" size="icon" className="size-8 shrink-0" title="Editar perfil"
              onClick={() => setEditingProfile({
                userId: m.userId,
                email: m.email,
                firstName: m.firstName ?? "",
                lastName: m.lastName ?? "",
                cedula: m.cedula ?? "",
                cargo: m.cargo ?? "",
              })}
            >
              <Pencil className="size-4" />
            </Button>
            {m.role === "OWNER" ? (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600">Propietario</span>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={m.role === "ADMIN" ? ADMIN : (m.customRoleId ?? "")}
                  onChange={(e) => void assignRole(m.userId, e.target.value)}
                  disabled={myRole === "ADMIN" && m.role === "ADMIN"}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs disabled:opacity-50"
                >
                  {/* Show the current value even if it's an unknown/none role */}
                  {m.role === "MEMBER" && !m.customRoleId && <option value="">Sin rol</option>}
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  {isOwner && <option value={ADMIN}>Administrador</option>}
                </select>
                <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => void removeMember(m.userId, m.email)} disabled={myRole === "ADMIN" && m.role === "ADMIN"}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Agent groups */}
      <GroupsCard
        memberOptions={members.map((m) => ({ userId: m.userId, email: m.email, name: m.name }))}
      />

      {/* Daily work report */}
      <AgentWorkCard />

      {/* Agent profile dialog */}
      <Dialog open={!!editingProfile} onOpenChange={(o) => !o && setEditingProfile(null)}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>Perfil del agente</DialogTitle></DialogHeader>
          {editingProfile && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">{editingProfile.email}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pf-first">Nombre</Label>
                  <Input id="pf-first" value={editingProfile.firstName} maxLength={60} placeholder="María" onChange={(e) => setEditingProfile({ ...editingProfile, firstName: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pf-last">Apellido</Label>
                  <Input id="pf-last" value={editingProfile.lastName} maxLength={60} placeholder="Pérez" onChange={(e) => setEditingProfile({ ...editingProfile, lastName: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pf-cedula">Cédula</Label>
                  <Input id="pf-cedula" value={editingProfile.cedula} maxLength={20} placeholder="1712345678" onChange={(e) => setEditingProfile({ ...editingProfile, cedula: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pf-cargo">Cargo</Label>
                  <Input id="pf-cargo" value={editingProfile.cargo} maxLength={60} placeholder="Agente de soporte" onChange={(e) => setEditingProfile({ ...editingProfile, cargo: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => void saveProfile()} disabled={savingProfile}>
              {savingProfile ? "Guardando…" : "Guardar perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role editor dialog */}
      <Dialog open={!!editingRole} onOpenChange={(o) => !o && setEditingRole(null)}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingRole?.id ? "Editar rol" : "Nuevo rol"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-name">Nombre del rol</Label>
              <Input id="role-name" value={editingRole?.name ?? ""} maxLength={40} placeholder="ej. Soporte, Ventas, Desarrollador"
                onChange={(e) => setEditingRole((p) => p && ({ ...p, name: e.target.value }))} autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Permisos</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_CAPS.map((cap) => {
                  const on = editingRole?.capabilities.includes(cap) ?? false
                  return (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => toggleDraftCap(cap)}
                      className={[
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        on ? "border-primary/40 bg-primary/10 text-primary" : "border-input hover:bg-muted",
                      ].join(" ")}
                    >
                      <span className={["flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"].join(" ")}>
                        {on && <Check className="size-3" />}
                      </span>
                      {CAP_LABELS[cap]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingRole(null)}>Cancelar</Button>
            <Button onClick={() => void saveRole()} disabled={savingRole}>{savingRole ? "Guardando…" : "Guardar rol"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
