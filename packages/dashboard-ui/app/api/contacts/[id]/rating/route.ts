import { cookies } from "next/headers"
import { serverGet, serverPatch, resolveWorkspaceId } from "@/lib/server-fetch"

// GET /api/contacts/:id/rating  -> { avg, count, myRating }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const { data, status } = await serverGet(`/workspaces/${workspaceId}/contacts/${id}/rating`, token)
  return Response.json(data ?? { avg: null, count: 0, myRating: null }, { status })
}

// PATCH /api/contacts/:id/rating  { rating: 0-5 }  -> { avg, count, myRating }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 })
  }
  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!
  const { data, status } = await serverPatch(`/workspaces/${workspaceId}/contacts/${id}/rating`, token, body)
  return Response.json(data ?? { message: "Upstream error" }, { status })
}
