import { cookies } from "next/headers"
import { serverPatch, serverDelete, resolveWorkspaceId } from "@/lib/server-fetch"

type Params = { params: Promise<{ groupId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { groupId } = await params
  let body: unknown
  try { body = await req.json() } catch { return Response.json({ message: "Invalid body" }, { status: 400 }) }
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const { data, status } = await serverPatch(`/workspaces/${workspaceId}/groups/${groupId}`, token, body)
  return Response.json(data ?? { message: "Upstream error" }, { status })
}

export async function DELETE(_req: Request, { params }: Params) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { groupId } = await params
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const { data, status } = await serverDelete(`/workspaces/${workspaceId}/groups/${groupId}`, token)
  return Response.json(data ?? { message: "Upstream error" }, { status })
}
