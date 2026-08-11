import { cookies } from "next/headers"
import { serverGet, resolveWorkspaceId } from "@/lib/server-fetch"

type Params = { params: Promise<{ conversationId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const { conversationId } = await params
  const { data, status } = await serverGet(
    `/workspaces/${workspaceId}/conversations/${conversationId}/events`,
    token,
  )
  return Response.json(data ?? {}, { status })
}
