"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ACCESS_EXPIRY_COOKIE } from "@/lib/auth-cookie-names";

interface AuthUser {
  userId: string | null;
  email: string | null;
  name: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

/** Renew once the access token has less than this much life left. */
const RENEW_WINDOW_MS = 2 * 60 * 1000;
/** Used when the expiry stamp is missing — stays inside the 15-minute lifetime. */
const FALLBACK_INTERVAL_MS = 10 * 60 * 1000;
/** Back-off after a refresh that failed for network reasons rather than auth. */
const RETRY_DELAY_MS = 30 * 1000;
const MIN_DELAY_MS = 1000;

const REFRESH_LOCK = "wa-auth-refresh";

/**
 * Epoch-ms expiry of the access token, published by the server as a readable
 * companion to the httpOnly token cookie. Null when it isn't there.
 */
function accessTokenExpiry(): number | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${ACCESS_EXPIRY_COOKIE}=(\\d+)`)
  );
  return match ? Number(match[1]) : null;
}

type RefreshOutcome = "ok" | "expired" | "unavailable";

async function postRefresh(): Promise<RefreshOutcome> {
  // Another tab may have renewed while we waited for the lock.
  const expiry = accessTokenExpiry();
  if (expiry !== null && expiry - Date.now() > RENEW_WINDOW_MS) return "ok";
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (res.ok) return "ok";
    // Only a 401 means the refresh token itself is dead. Anything else — the
    // route reports 503 when dashboard-api is unreachable — is retryable, and
    // logging the user out over it is how a flaky link becomes a lost session.
    return res.status === 401 ? "expired" : "unavailable";
  } catch {
    return "unavailable";
  }
}

/**
 * dashboard-api rotates the refresh token on every use and revokes the old one,
 * treating a replay as theft by killing every session the user has. Two tabs
 * refreshing at the same instant would do exactly that, so serialise them.
 */
async function refreshSession(): Promise<RefreshOutcome> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return postRefresh();
  return locks.request(REFRESH_LOCK, postRefresh);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    /**
     * Schedules the next renewal from the token's real expiry rather than from
     * mount time. Anchoring to mount is what used to break this: a reload ten
     * minutes into a 15-minute token armed the timer for minute 23, leaving an
     * eight-minute hole in which every request 401s.
     */
    const schedule = (overrideDelay?: number) => {
      if (cancelled) return;
      clearTimer();
      const expiry = accessTokenExpiry();
      const delay =
        overrideDelay ??
        (expiry === null
          ? FALLBACK_INTERVAL_MS
          : Math.max(MIN_DELAY_MS, expiry - Date.now() - RENEW_WINDOW_MS));
      timerRef.current = setTimeout(run, delay);
    };

    const run = async () => {
      if (cancelled) return;
      const outcome = await refreshSession();
      if (cancelled) return;
      if (outcome === "expired") {
        window.location.href = "/login?reason=expired";
        return;
      }
      schedule(outcome === "unavailable" ? RETRY_DELAY_MS : undefined);
    };

    /**
     * Timers do not survive a sleeping machine and are throttled hard in
     * background tabs, so a token can be long dead by the time the interval
     * would have fired. Re-check whenever the tab comes back to life.
     */
    const recheck = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const expiry = accessTokenExpiry();
      if (expiry === null || expiry - Date.now() <= RENEW_WINDOW_MS) {
        void run();
      } else {
        schedule();
      }
    };

    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = (await res.json()) as AuthUser;
        setUser(data);
      })
      .catch(() => setUser(null))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    schedule();
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("online", recheck);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("online", recheck);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
