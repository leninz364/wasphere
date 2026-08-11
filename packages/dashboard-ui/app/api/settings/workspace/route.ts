import { cookies } from "next/headers"
import { serverGet, serverPatch, resolveWorkspaceId } from "@/lib/server-fetch"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })

  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!

  const { data, status } = await serverGet<{ id: string; [key: string]: unknown }>(
    `/workspaces/${workspaceId}`,
    token
  )
  if (!data) return Response.json({ message: "No workspace found" }, { status })

  return Response.json(data)
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get("wa_access")?.value
  if (!token) return Response.json({ message: "Unauthorized" }, { status: 401 })

  let body: {
    waServerUrl?: string
    waServerToken?: string
    name?: string
    logo?: string
    nameColor?: string
    nameSize?: string
    nameFont?: string
    chatRetentionResolvedDays?: number | null
    chatRetentionArchivedDays?: number | null
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 })
  }

  const { workspaceId, wsError } = await resolveWorkspaceId(token)
  if (!workspaceId) return wsError!

  if (body.waServerUrl !== undefined || body.waServerToken !== undefined) {
    const { data, status } = await serverPatch(`/workspaces/${workspaceId}/wa-server`, token, {
      waServerUrl: body.waServerUrl,
      waServerToken: body.waServerToken,
    })
    return Response.json(data ?? { message: "Upstream error" }, { status })
  }

  if (
    body.logo !== undefined ||
    body.name !== undefined ||
    body.nameColor !== undefined ||
    body.nameSize !== undefined ||
    body.nameFont !== undefined
  ) {
    const { data, status } = await serverPatch(`/workspaces/${workspaceId}/branding`, token, {
      logo: body.logo,
      name: body.name,
      nameColor: body.nameColor,
      nameSize: body.nameSize,
      nameFont: body.nameFont,
    })
    return Response.json(data ?? { message: "Upstream error" }, { status })
  }

  if (
    body.chatRetentionResolvedDays !== undefined ||
    body.chatRetentionArchivedDays !== undefined
  ) {
    const { data, status } = await serverPatch(`/workspaces/${workspaceId}/chat-retention`, token, {
      chatRetentionResolvedDays: body.chatRetentionResolvedDays,
      chatRetentionArchivedDays: body.chatRetentionArchivedDays,
    })
    return Response.json(data ?? { message: "Upstream error" }, { status })
  }

  return Response.json({ message: "Nothing to update" }, { status: 400 })
}
