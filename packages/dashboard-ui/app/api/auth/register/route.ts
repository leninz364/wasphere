import { cookies } from "next/headers"
import { setAuthCookies } from "@/lib/auth-cookies"

const API_BASE = process.env.DASHBOARD_API_URL ?? "http://localhost:3000"

export async function POST(request: Request) {
  let body: { email: string; password: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 })
  }

  const apiRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  }).catch(() => null)

  if (!apiRes) {
    return Response.json({ message: "Could not reach the server." }, { status: 503 })
  }

  const data = await apiRes.json().catch(() => ({}))

  if (!apiRes.ok) {
    return Response.json(data, { status: apiRes.status })
  }

  setAuthCookies(await cookies(), data.accessToken, data.refreshToken)

  return Response.json({ ok: true }, { status: 201 })
}
