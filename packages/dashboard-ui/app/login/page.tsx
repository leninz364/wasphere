"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare } from "lucide-react";
import { APP_VERSION } from "@/lib/version";

function SessionNotice() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  if (reason === "expired") {
    return (
      <p className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300">
        Tu sesión ha expirado. Inicia sesión de nuevo.
      </p>
    );
  }

  if (reason === "logout") {
    return (
      <p className="mb-4 rounded-md border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
        Has cerrado sesión.
      </p>
    );
  }

  if (reason === "registration_locked") {
    return (
      <p className="mb-4 rounded-md border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
        El registro está cerrado en esta instancia.
      </p>
    );
  }

  return null;
}

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setError(body.message ?? "Correo o contraseña incorrectos.");
        return;
      }

      router.push("/dashboard/overview");
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
      <SessionNotice />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Contraseña</Label>
          <Link href="/forgot-password" className="text-xs text-primary hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <Button type="submit" className="w-full mt-1" disabled={loading}>
        {loading ? "Iniciando sesión…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <MessageSquare className="text-primary" size={24} />
          <span className="text-xl font-bold tracking-tight">BChat</span>
        </div>

        {/* Form */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inicia sesión en tu cuenta</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿No tienes una cuenta?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Regístrate
          </Link>
        </p>
      </div>

      {/* Footer */}
      <p className="mt-10 text-center text-xs text-muted-foreground/70">
        BChat · v{APP_VERSION}
      </p>
    </div>
  );
}
