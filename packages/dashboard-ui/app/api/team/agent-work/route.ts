import { cookies } from "next/headers"
import { serverGet, resolveWorkspaceId } from "@/lib/server-fetch"

export async function GET(req: Request) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const url = new URL(req.url)
  const qs = new URLSearchParams()
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  if (from) qs.set("from", from)
  if (to) qs.set("to", to)
  const { data, status } = await serverGet(
    `/workspaces/${workspaceId}/agent-work${qs.size ? `?${qs}` : ""}`,
    token,
  )
  return Response.json(data ?? {}, { status })
}
