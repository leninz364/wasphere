/**
 * Auth cookie names and lifetimes.
 *
 * Kept free of any `next/headers` import so client components can read these
 * without pulling a server-only module into the browser bundle.
 */

/** Mirrors the API's `expiresIn: '15m'` on the access token. */
export const ACCESS_TOKEN_TTL_S = 900
/** Mirrors REFRESH_TOKEN_TTL_MS in dashboard-api (7 days). */
export const REFRESH_TOKEN_TTL_S = 604800

export const ACCESS_COOKIE = "wa_access"
export const REFRESH_COOKIE = "wa_refresh"
/** Non-httpOnly companion holding the access token's expiry, in epoch ms. */
export const ACCESS_EXPIRY_COOKIE = "wa_access_exp"

export function accessExpiryValue(now = Date.now()): string {
  return String(now + ACCESS_TOKEN_TTL_S * 1000)
}
