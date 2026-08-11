import { cookies } from "next/headers"
import { serverPost, resolveWorkspaceId } from "@/lib/server-fetch"

type Params = { params: Promise<{ conversationId: string }> }

// POST = restore an archived chat back into the inbox.
export async function POST(_req: Request, { params }: Params) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const { conversationId } = await params
  const { data, status } = await serverPost(
    `/workspaces/${workspaceId}/conversations/${conversationId}/unarchive`,
    token,
  )
  return Response.json(data ?? {}, { status })
}
