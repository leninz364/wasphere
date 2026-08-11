import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SettingsForm, type Workspace } from "@/components/settings/settings-form"
import { LogoBrandingCard } from "@/components/settings/logo-branding-card"

import { serverGet } from "@/lib/server-fetch"

async function fetchWorkspace(token: string): Promise<{ workspace: Workspace; workspaceId: string } | null> {
  const list = await serverGet<Array<{ id: string }> | { workspaces: Array<{ id: string }> }>("/workspaces", token)
  if (!list.ok || !list.data) return null
  const workspaces = Array.isArray(list.data) ? list.data : (list.data.workspaces ?? [])
  const workspaceId = workspaces[0]?.id
  if (!workspaceId) return null

  const detail = await serverGet<Workspace>(`/workspaces/${workspaceId}`, token)
  if (!detail.ok || !detail.data) return null
  return { workspace: detail.data, workspaceId }
}

export default async function SettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("wa_access")?.value ?? ""

  if (!token) redirect("/login?reason=expired")

  const result = await fetchWorkspace(token)

  if (!result) {
    redirect("/login?reason=expired")
  }

  const { workspace } = result

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personaliza el espacio de trabajo y la conservación de los chats.
        </p>
      </div>
      <SettingsForm workspace={workspace} />
      <LogoBrandingCard
        initialLogo={workspace.logo}
        initialName={workspace.name}
        initialNameStyle={workspace.nameStyle}
      />
    </div>
  )
}
