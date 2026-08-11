"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params.token

  const [preview, setPreview] = React.useState<{ workspaceName: string; role: string; roleName?: string } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    fetch(`/api/invites/${token}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) setError(d?.message ?? "Esta invitación es inválida o ha expirado.")
        else setPreview(d)
      })
      .catch(() => setError("No se pudo cargar esta invitación."))
      .finally(() => setLoading(false))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || password.length < 8) { toast.error("Ingresa tu correo y una contraseña (mín. 8 caracteres)."); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.message ?? "No se pudo unir."); return }
      toast.success(`Te uniste a ${data.workspace?.name ?? "el espacio de trabajo"}`)
      router.push("/dashboard/inbox")
    } catch { toast.error("No se pudo conectar con el servidor.") }
    finally { setSubmitting(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Cargando invitación…</p>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-lg font-semibold">Invitación no disponible</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Únete a {preview?.workspaceName}</h1>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Has sido invitado como <span className="font-medium">{preview?.roleName ?? preview?.role}</span>. Configura tu acceso para unirte.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" type="password" value={password} minLength={8} placeholder="mín. 8 caracteres" onChange={(e) => setPassword(e.target.value)} />
                <span className="text-xs text-muted-foreground">¿Ya tienes cuenta? Usa tu contraseña actual para vincularla.</span>
              </div>
              <Button type="submit" disabled={submitting}>{submitting ? "Uniéndote…" : "Unirse al espacio de trabajo"}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
