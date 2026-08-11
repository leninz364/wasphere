import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  ACCESS_COOKIE,
  ACCESS_EXPIRY_COOKIE,
  ACCESS_TOKEN_TTL_S,
  REFRESH_COOKIE,
  REFRESH_TOKEN_TTL_S,
  accessExpiryValue,
} from "@/lib/auth-cookie-names"

const API_URL = process.env.DASHBOARD_API_URL ?? "http://localhost:3000"
const SECURE = process.env.NODE_ENV === "production"

/** Renew once the access token has less than this much life left. */
const RENEW_WINDOW_MS = 60_000

type Renewed = { accessToken: string; refreshToken: string }

/**
 * Reads the `exp` claim without verifying the signature.
 *
 * This only decides *when* to renew — dashboard-api still verifies every token
 * it is handed, so a forged claim here buys nothing beyond a wasted refresh.
 */
function accessTokenExpiry(token: string | undefined): number | null {
  const payload = token?.split(".")[1]
  if (!payload) return null
  try {
    const exp = (
      JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number }
    ).exp
    return typeof exp === "number" ? exp * 1000 : null
  } catch {
    return null
  }
}

// dashboard-api rotates the refresh token on every use and revokes the old one,
// and treats a second presentation of a revoked token as theft — it then kills
// every session the user has. A single page load fires the document request and
// a handful of /api/* calls at once, all still carrying the pre-rotation cookie,
// so the rotation result is both single-flighted and remembered for a moment:
// whoever shows up late with the old token gets the same answer instead of
// replaying it against the API.
type Attempt = { value: Renewed | null; definitive: boolean }

const inflight = new Map<string, Promise<Attempt>>()
const settled = new Map<string, { value: Renewed | null; at: number }>()
const SETTLED_TTL_MS = 60_000

function prune(now: number): void {
  for (const [token, entry] of settled) {
    if (now - entry.at > SETTLED_TTL_MS) settled.delete(token)
  }
}

async function renew(refreshToken: string): Promise<Renewed | null> {
  const now = Date.now()
  prune(now)

  const previous = settled.get(refreshToken)
  if (previous) return previous.value

  const pending = inflight.get(refreshToken)
  if (pending) return (await pending).value

  const run = (async (): Promise<Attempt> => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      })
      if (!res.ok) return { value: null, definitive: true }
      const data = (await res.json()) as Partial<Renewed>
      return data.accessToken && data.refreshToken
        ? {
            value: { accessToken: data.accessToken, refreshToken: data.refreshToken },
            definitive: true,
          }
        : { value: null, definitive: true }
    } catch {
      // dashboard-api unreachable. Let the request through unauthenticated
      // rather than pretending the session ended — and don't remember this, so
      // the next request tries again instead of waiting out the cache.
      return { value: null, definitive: false }
    }
  })()

  inflight.set(refreshToken, run)
  try {
    const attempt = await run
    if (attempt.definitive) settled.set(refreshToken, { value: attempt.value, at: Date.now() })
    return attempt.value
  } finally {
    inflight.delete(refreshToken)
  }
}

/**
 * Keeps a session alive across page loads.
 *
 * The access token lives 15 minutes; the refresh token lives 7 days. Without
 * this, any request that lands after those 15 minutes — a reload, a tab woken
 * from sleep, a fetch fired from a page that has been open a while — hits the
 * API with a dead token and 401s, even though the browser is still holding a
 * perfectly valid refresh token.
 */
async function renewSession(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return NextResponse.next()

  const access = request.cookies.get(ACCESS_COOKIE)?.value
  const expiry = accessTokenExpiry(access)
  if (access && expiry !== null && expiry - Date.now() > RENEW_WINDOW_MS) {
    return NextResponse.next()
  }

  const renewed = await renew(refreshToken)
  if (!renewed) return NextResponse.next()

  // Hand the new token to the route handler / server component this request is
  // headed for, not just to the browser — this request has to succeed too.
  request.cookies.set(ACCESS_COOKIE, renewed.accessToken)
  request.cookies.set(REFRESH_COOKIE, renewed.refreshToken)
  request.cookies.set(ACCESS_EXPIRY_COOKIE, accessExpiryValue())

  const response = NextResponse.next({ request: { headers: request.headers } })
  const base = { httpOnly: true, secure: SECURE, sameSite: "lax" as const, path: "/" }
  response.cookies.set(ACCESS_COOKIE, renewed.accessToken, { ...base, maxAge: ACCESS_TOKEN_TTL_S })
  response.cookies.set(REFRESH_COOKIE, renewed.refreshToken, { ...base, maxAge: REFRESH_TOKEN_TTL_S })
  response.cookies.set(ACCESS_EXPIRY_COOKIE, accessExpiryValue(), {
    ...base,
    httpOnly: false,
    maxAge: REFRESH_TOKEN_TTL_S,
  })
  return response
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── DEMO_MODE ──────────────────────────────────────────────────────────────
  // Drop "/" into the seeded dashboard, and stamp a dummy auth cookie on every
  // dashboard/api request so the API routes don't 401 on a missing cookie
  // (the data layer ignores the token and returns seeds in demo mode).
  if (process.env.DEMO_MODE === "true") {
    // There's no real auth in demo — never strand the visitor on login/register.
    if (pathname === "/" || pathname === "/login" || pathname === "/register") {
      return NextResponse.redirect(new URL("/dashboard/overview", request.url))
    }
    const res = NextResponse.next()
    if (!request.cookies.has("wa_access")) {
      res.cookies.set("wa_access", "demo", { httpOnly: true, sameSite: "lax", path: "/" })
    }
    return res
  }

  // ── Normal mode: only the root path is routed to register/login ─────────────
  if (pathname === "/") {
    const apiUrl = process.env.DASHBOARD_API_URL ?? "http://localhost:3000"
    try {
      const res = await fetch(`${apiUrl}/auth/register-available`, {
        cache: "no-store",
      })
      if (res.ok) {
        const data: { available: boolean } = await res.json()
        if (data.available) {
          return NextResponse.redirect(new URL("/register", request.url))
        }
      }
    } catch {
      // fall through to login
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // /api/auth/* owns the cookie lifecycle itself — renewing underneath it would
  // race its own rotation.
  if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next()
  }

  return renewSession(request)
}

export const config = {
  matcher: ["/", "/login", "/register", "/dashboard/:path*", "/api/:path*"],
}
