/**
 * Single place that writes (and clears) the auth cookie set.
 *
 * Four route handlers mint a session — login, register, accept-invite and
 * refresh — and every one of them has to agree on names, flags and lifetimes,
 * so they all go through here. Server-side only; the names and lifetimes
 * themselves live in `auth-cookie-names` so client code can share them.
 */

import type { cookies } from "next/headers"
import {
  ACCESS_COOKIE,
  ACCESS_EXPIRY_COOKIE,
  ACCESS_TOKEN_TTL_S,
  REFRESH_COOKIE,
  REFRESH_TOKEN_TTL_S,
  accessExpiryValue,
} from "./auth-cookie-names"

const SECURE = process.env.NODE_ENV === "production"

type CookieStore = Awaited<ReturnType<typeof cookies>>

/**
 * Writes `wa_access`, `wa_refresh` and `wa_access_exp`.
 *
 * The client can't read the httpOnly access token, so without `wa_access_exp`
 * it has no way to know when the token dies and has to guess from its own mount
 * time — which is wrong after every reload. The cookie holds a timestamp only,
 * no secret, so exposing it to JS costs nothing.
 *
 * It deliberately outlives `wa_access`: once the browser drops the access
 * cookie at its maxAge, the expiry stamp is what still tells the client the
 * session needs renewing rather than re-authenticating.
 */
export function setAuthCookies(
  store: CookieStore,
  accessToken: string,
  refreshToken: string
): void {
  const base = { httpOnly: true, secure: SECURE, sameSite: "lax" as const, path: "/" }
  store.set(ACCESS_COOKIE, accessToken, { ...base, maxAge: ACCESS_TOKEN_TTL_S })
  store.set(REFRESH_COOKIE, refreshToken, { ...base, maxAge: REFRESH_TOKEN_TTL_S })
  store.set(ACCESS_EXPIRY_COOKIE, accessExpiryValue(), {
    ...base,
    httpOnly: false,
    maxAge: REFRESH_TOKEN_TTL_S,
  })
}

export function clearAuthCookies(store: CookieStore): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, ACCESS_EXPIRY_COOKIE]) {
    store.set(name, "", { maxAge: 0, path: "/" })
  }
}
