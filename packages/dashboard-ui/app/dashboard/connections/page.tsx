import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ConnectionsPanel } from "@/components/connections/connections-panel"
import { serverGet, resolveWorkspaceId } from "@/lib/server-fetch"

type WorkspaceConnectionSettings = {
  waServerUrl?: string | null
  waServerToken?: string | null
  waServerConfigured: boolean
}

function suggestedWaServerUrl(): string {
  return process.env.WA_SERVER_INTERNAL_URL?.trim() || "http://wa-server:3001"
}

export default async function ConnectionsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("wa_access")?.value
  if (!token) redirect("/login?reason=expired")

  const { workspaceId } = await resolveWorkspaceId(token)
  if (!workspaceId) redirect("/login?reason=expired")

  const workspaceResult = await serverGet<WorkspaceConnectionSettings>(
    `/workspaces/${workspaceId}`,
    token
  )
  if (!workspaceResult.ok || !workspaceResult.data) redirect("/login?reason=expired")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Conexiones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administra servidores, agentes, API Keys, tokens y webhooks desde un solo lugar.
        </p>
      </div>
      <ConnectionsPanel
        initialWaServer={{
          url: workspaceResult.data.waServerUrl || suggestedWaServerUrl(),
          token: workspaceResult.data.waServerToken ?? "",
          configured: workspaceResult.data.waServerConfigured,
        }}
      />
    </div>
  )
}
