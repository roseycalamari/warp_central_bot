"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="panel flex flex-col gap-5 p-6">
        <div className="warp-logo">
          <span className="warp-logo-top">/warp</span>
          <span className="warp-logo-bottom">
            <span className="warp-logo-central">central</span>
            <span className="warp-logo-cursor" aria-hidden />
          </span>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Password required to open the Instagram queue.
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-pixel text-[var(--muted)]">password</span>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field text-sm"
              placeholder="••••••••"
            />
          </label>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "checking..." : "enter"}
          </button>
          {error && (
            <p className="text-xs text-[var(--danger)]">error: {error}</p>
          )}
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">
          loading...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
