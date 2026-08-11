import { cookies } from "next/headers";
import { clearAuthCookies } from "@/lib/auth-cookies";

const API_BASE = process.env.DASHBOARD_API_URL ?? "http://localhost:3000";

export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("wa_access")?.value;

  // Best-effort logout call to dashboard-api (clears server-side state if any).
  if (accessToken) {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {
      // Ignore network errors — cookies are cleared regardless.
    });
  }

  clearAuthCookies(cookieStore);

  return new Response(null, { status: 200 });
}
