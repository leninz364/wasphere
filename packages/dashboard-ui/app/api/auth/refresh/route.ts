import { cookies } from "next/headers";
import { serverPost } from "@/lib/server-fetch";
import { clearAuthCookies, setAuthCookies } from "@/lib/auth-cookies";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("wa_refresh")?.value;

  if (!refreshToken) {
    return new Response(null, { status: 401 });
  }

  const { ok, status, data } = await serverPost<{ accessToken: string; refreshToken: string }>(
    "/auth/refresh",
    "",
    { refreshToken }
  );

  if (!ok || !data?.accessToken || !data?.refreshToken) {
    // 502 means dashboard-api was unreachable, not that the session is invalid.
    // Clearing cookies there would turn a network blip into a forced logout, so
    // report it as a retryable failure and leave the session alone.
    if (status === 502) {
      return new Response(null, { status: 503 });
    }
    clearAuthCookies(cookieStore);
    return new Response(null, { status: 401 });
  }

  // The API rotates the refresh token on every refresh and revokes the old one.
  // Persist the new value, or the next refresh sends a revoked token and the
  // reuse-detection path logs the user out everywhere.
  setAuthCookies(cookieStore, data.accessToken, data.refreshToken);

  return new Response(null, { status: 200 });
}
