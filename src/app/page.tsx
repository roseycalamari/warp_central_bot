"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light";

type Post = {
  id: string;
  caption: string;
  imageUrl: string;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--muted)",
  scheduled: "var(--warn)",
  publishing: "var(--accent)",
  posted: "var(--ok)",
  failed: "var(--danger)",
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [mode, setMode] = useState<"bulk_day" | "stagger" | "draft">("bulk_day");
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(21);
  const [everyMinutes, setEveryMinutes] = useState(45);
  const [files, setFiles] = useState<FileList | null>(null);
  const [filter, setFilter] = useState<"all" | "scheduled" | "posted" | "failed">(
    "all",
  );
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme | null) ||
      "dark";
    setTheme(current);
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("warp-theme", next);
    } catch {
      // ignore
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  const stats = useMemo(() => {
    const counts = { scheduled: 0, posted: 0, failed: 0, draft: 0 };
    for (const p of posts) {
      if (p.status in counts) counts[p.status as keyof typeof counts]++;
    }
    return counts;
  }, [posts]);

  const visible = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, filter]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setMessage("error: no images selected");
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("images", f));
      form.set("caption", caption);
      form.set("mode", mode);
      form.set("day", day);
      form.set("startHour", String(startHour));
      form.set("endHour", String(endHour));
      form.set("everyMinutes", String(everyMinutes));

      const res = await fetch("/api/posts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setMessage(`ok: queued ${data.count} image${data.count === 1 ? "" : "s"}`);
      setFiles(null);
      const input = document.getElementById("images") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (err) {
      setMessage(
        `error: ${err instanceof Error ? err.message : "Upload failed"}`,
      );
    } finally {
      setUploading(false);
    }
  }

  async function runPublishNow() {
    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/publish/manual", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setMessage(
        data.processed
          ? `ok: processed ${data.processed} due post(s)`
          : "ok: nothing due right now",
      );
      await load();
    } catch (err) {
      setMessage(
        `error: ${err instanceof Error ? err.message : "Publish failed"}`,
      );
    } finally {
      setPublishing(false);
    }
  }

  async function retryPost(id: string) {
    await fetch("/api/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, retry: true }),
    });
    await load();
  }

  async function deletePost(id: string) {
    if (!confirm("Remove this post from the queue?")) return;
    await fetch(`/api/posts?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="scanlines" aria-hidden />
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 md:gap-10 md:py-10">
        <header className="panel flex flex-col gap-6 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <WarpLogo />
            <ThemeToggle theme={theme} onChange={applyTheme} />
          </div>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              <span className="text-[var(--accent)]">$</span> queue moodboard
              images · auto-schedule · post to instagram
            </p>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Stat label="scheduled" value={stats.scheduled} />
              <Stat label="posted" value={stats.posted} />
              <Stat label="failed" value={stats.failed} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] pt-4 status-bar">
            <span>
              status<span className="text-[var(--accent)]">:</span> online
            </span>
            <span className="hidden sm:inline">|</span>
            <span>
              target<span className="text-[var(--accent)]">:</span> @warp.central
            </span>
            <span className="hidden sm:inline">|</span>
            <span className="inline-flex items-center gap-1">
              mode
              <span className="text-[var(--accent)]">:</span> {theme}
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={onUpload} className="panel flex flex-col gap-5 p-5 sm:p-6">
            <div>
              <SectionTitle path="/queue" label="ingest images" />
              <p className="mt-2 text-xs text-[var(--muted)] sm:text-sm">
                Multi-select photos. Converted to Instagram JPEG automatically.
              </p>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-10 text-center transition hover:border-[var(--accent)] active:border-[var(--accent)]">
              <span className="label-pixel text-[var(--accent)]">
                // drop zone
              </span>
              <span className="text-sm font-medium">
                {files?.length
                  ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                  : "tap / click to select images"}
              </span>
              <span className="text-[11px] text-[var(--muted)]">
                png · jpg · webp · works on phone too
              </span>
              <input
                id="images"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => setFiles(e.target.files)}
              />
            </label>

            <label className="flex flex-col gap-2 text-xs">
              <span className="label-pixel text-[var(--muted)]">caption</span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="// optional caption / hashtags"
                className="field resize-y text-sm"
              />
            </label>

            <fieldset className="grid gap-3">
              <legend className="mb-1 label-pixel text-[var(--muted)]">
                schedule mode
              </legend>
              <p className="text-xs text-[var(--muted)] sm:text-sm">
                Choose how the selected photos get timed for Instagram.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["bulk_day", "spread day"],
                    ["stagger", "every n min"],
                    ["draft", "drafts"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`chip ${mode === value ? "chip-active" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "bulk_day" && (
                <>
                  <p className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                    Spaces your photos evenly across one day — e.g. 20 photos
                    from 9:00 to 21:00. Best for a full content day.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="day">
                      <input
                        type="date"
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                        className="field text-sm"
                      />
                    </Field>
                    <Field label="start_hour">
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={startHour}
                        onChange={(e) => setStartHour(Number(e.target.value))}
                        className="field text-sm"
                      />
                    </Field>
                    <Field label="end_hour">
                      <input
                        type="number"
                        min={1}
                        max={23}
                        value={endHour}
                        onChange={(e) => setEndHour(Number(e.target.value))}
                        className="field text-sm"
                      />
                    </Field>
                  </div>
                </>
              )}

              {mode === "stagger" && (
                <>
                  <p className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                    Starts soon, then posts one after another every N minutes.
                    Good for a quick test or a short burst.
                  </p>
                  <Field label="minutes between posts">
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={everyMinutes}
                      onChange={(e) => setEveryMinutes(Number(e.target.value))}
                      className="field text-sm"
                    />
                  </Field>
                </>
              )}

              {mode === "draft" && (
                <p className="border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                  Saves photos without a publish time. You can schedule them
                  later.
                </p>
              )}
            </fieldset>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={uploading} className="btn-primary">
                {uploading ? "queuing..." : "add to queue"}
              </button>
              <button
                type="button"
                onClick={() => void runPublishNow()}
                disabled={publishing}
                className="btn-ghost"
              >
                {publishing ? "publishing..." : "publish due now"}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-[var(--muted)]">
              <strong className="text-[var(--ink)]">Add to queue</strong> only
              saves/schedules.{" "}
              <strong className="text-[var(--ink)]">Publish due now</strong>{" "}
              sends anything whose time has already arrived (or wait for the
              automatic cron timer).
            </p>

            {message && (
              <p
                className={`border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-xs ${
                  message.startsWith("error")
                    ? "text-[var(--danger)]"
                    : "text-[var(--ok)]"
                }`}
              >
                {message}
              </p>
            )}
          </form>

          <aside className="panel flex flex-col gap-4 p-5 sm:p-6">
            <SectionTitle path="/sys" label="how it works" />
            <div className="space-y-3 text-xs leading-relaxed text-[var(--muted)] sm:text-sm">
              <p>
                <span className="font-pixel text-[var(--accent)]">01</span> You
                upload photos here (phone or computer). They get saved in cloud
                storage (Vercel Blob).
              </p>
              <p>
                <span className="font-pixel text-[var(--accent)]">02</span> You
                choose when each one should go live. The schedule is saved in
                our database (Postgres).
              </p>
              <p>
                <span className="font-pixel text-[var(--accent)]">03</span> Every
                minute, a free timer (cron) checks: “is anything due?”
              </p>
              <p>
                <span className="font-pixel text-[var(--accent)]">04</span> If
                yes, Meta’s Instagram API posts it to @warp.central
                automatically.
              </p>
            </div>
            <div className="mt-auto border-t border-[var(--line)] pt-4 text-[11px] leading-relaxed text-[var(--muted)]">
              You don’t leave a laptop on. Meta allows up to 100 posts / day —
              ~20 is safe.
            </div>
          </aside>
        </section>

        <section className="panel flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle path="/queue" label="buffer" />
            <div className="flex flex-wrap gap-2">
              {(["all", "scheduled", "posted", "failed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`chip ${filter === f ? "chip-active" : ""}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--muted)]">loading...</p>
          ) : visible.length === 0 ? (
            <p className="border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              // empty buffer — upload to begin
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {visible.map((post) => (
                <article
                  key={post.id}
                  className="overflow-hidden border border-[var(--line)] bg-[var(--bg)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="font-pixel text-[10px] tracking-wide uppercase sm:text-xs"
                        style={{
                          color: STATUS_COLOR[post.status] || "var(--muted)",
                        }}
                      >
                        {post.status}
                      </span>
                      <span className="font-pixel text-[10px] text-[var(--muted)] sm:text-xs">
                        {formatWhen(post.scheduledAt)}
                      </span>
                    </div>
                    {post.caption ? (
                      <p className="line-clamp-2 text-[11px] text-[var(--muted)]">
                        {post.caption}
                      </p>
                    ) : null}
                    {post.error ? (
                      <p className="line-clamp-3 text-[10px] text-[var(--danger)]">
                        {post.error}
                      </p>
                    ) : null}
                    <div className="flex gap-3">
                      {post.status === "failed" && (
                        <button
                          type="button"
                          onClick={() => void retryPost(post.id)}
                          className="font-pixel text-xs tracking-wide text-[var(--accent)] uppercase"
                        >
                          retry
                        </button>
                      )}
                      {post.status !== "posted" &&
                        post.status !== "publishing" && (
                          <button
                            type="button"
                            onClick={() => void deletePost(post.id)}
                            className="font-pixel text-xs tracking-wide text-[var(--muted)] uppercase hover:text-[var(--danger)]"
                          >
                            rm
                          </button>
                        )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="status-bar pb-4 text-center">
          /warp <span className="font-pixel">central</span>
          <span className="cursor-blink ml-1 inline-block h-2.5 w-[2px] align-middle bg-[var(--accent)]" />
        </footer>
      </main>
    </>
  );
}

function WarpLogo() {
  return (
    <div className="warp-logo" aria-label="/warp central">
      <span className="warp-logo-top">/warp</span>
      <span className="warp-logo-bottom">
        <span className="warp-logo-central">central</span>
        <span className="warp-logo-cursor" aria-hidden />
      </span>
    </div>
  );
}

function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        onClick={() => onChange("dark")}
        aria-pressed={theme === "dark"}
      >
        <span className={theme === "dark" ? "active" : undefined}>dark</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("light")}
        aria-pressed={theme === "light"}
      >
        <span className={theme === "light" ? "active" : undefined}>light</span>
      </button>
    </div>
  );
}

function SectionTitle({ path, label }: { path: string; label: string }) {
  return (
    <h2 className="section-title">
      <span className="section-title-path">{path}</span>
      <span className="section-title-label">{label}</span>
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[72px] border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2 sm:px-3">
      <div className="stat-label">{label}</div>
      <div className="stat-value mt-1 sm:text-2xl">{value}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-pixel text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
