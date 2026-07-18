"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const load = useCallback(async () => {
    const res = await fetch("/api/posts");
    const data = await res.json();
    setPosts(data.posts || []);
    setLoading(false);
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
      setMessage("Pick at least one image.");
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

      setMessage(`Queued ${data.count} image${data.count === 1 ? "" : "s"}.`);
      setFiles(null);
      const input = document.getElementById("images") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
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
          ? `Processed ${data.processed} due post(s).`
          : "Nothing due right now.",
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Publish failed");
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10 md:px-8 md:py-14">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-xs tracking-[0.22em] text-[var(--muted)] uppercase">
            Instagram queue
          </p>
          <h1
            className="text-4xl leading-none font-bold tracking-tight md:text-6xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Warp Central
          </h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            Drop moodboard images in. The bot spaces them through the day and
            posts to Instagram automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Stat label="Scheduled" value={stats.scheduled} />
          <Stat label="Posted" value={stats.posted} />
          <Stat label="Failed" value={stats.failed} />
        </div>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <form
          onSubmit={onUpload}
          className="flex flex-col gap-5 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)]/80 p-6 backdrop-blur"
        >
          <div>
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              Queue images
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Upload up to 20+ JPEGs/PNGs. We convert to Instagram-ready JPEG.
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg-soft)]/60 px-4 py-10 text-center transition hover:border-[var(--accent)]">
            <span className="text-sm font-medium">Select moodboard images</span>
            <span className="text-xs text-[var(--muted)]">
              {files?.length
                ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                : "PNG, JPG, WEBP — multi-select OK"}
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

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-[var(--muted)]">Caption (same for this batch)</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Optional caption / hashtags"
              className="resize-y rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
            />
          </label>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm text-[var(--muted)]">Schedule mode</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["bulk_day", "Spread across a day"],
                  ["stagger", "Every N minutes from now"],
                  ["draft", "Save as drafts"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium transition"
                  style={{
                    background:
                      mode === value ? "var(--accent)" : "var(--bg-soft)",
                    color:
                      mode === value ? "var(--accent-ink)" : "var(--ink)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "bulk_day" && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Day">
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                  />
                </Field>
                <Field label="Start hour">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={startHour}
                    onChange={(e) => setStartHour(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                  />
                </Field>
                <Field label="End hour">
                  <input
                    type="number"
                    min={1}
                    max={23}
                    value={endHour}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                  />
                </Field>
              </div>
            )}

            {mode === "stagger" && (
              <Field label="Minutes between posts">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={everyMinutes}
                  onChange={(e) => setEveryMinutes(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                />
              </Field>
            )}
          </fieldset>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={uploading}
              className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-50"
            >
              {uploading ? "Queuing…" : "Add to queue"}
            </button>
            <button
              type="button"
              onClick={() => void runPublishNow()}
              disabled={publishing}
              className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-medium hover:border-[var(--accent)] disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish due now"}
            </button>
          </div>

          {message && (
            <p className="text-sm text-[var(--accent)]">{message}</p>
          )}
        </form>

        <aside className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)]/60 p-6">
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            How it runs
          </h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--muted)]">
            <li>
              Deploy to Vercel and add env vars (see README)
            </li>
            <li>
              Point a free cron (cron-job.org) at{" "}
              <code className="text-[var(--ink)]">/api/publish</code> every minute
            </li>
            <li>
              Upload ~20 images → they spread across the day and post automatically
            </li>
            <li>Meta limit: 100 API posts / 24h — 20/day is fine</li>
          </ol>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Photos live on Vercel Blob (public HTTPS). Your queue lives in Postgres.
            No laptop left on, no ngrok.
          </p>
        </aside>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Queue
          </h2>
          <div className="flex flex-wrap gap-2">
            {(["all", "scheduled", "posted", "failed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="rounded-full px-3 py-1 text-xs capitalize"
                style={{
                  background: filter === f ? "var(--bg-soft)" : "transparent",
                  border: `1px solid ${filter === f ? "var(--accent)" : "var(--line)"}`,
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No posts in this view yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((post) => (
              <article
                key={post.id}
                className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]"
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
                      className="text-[10px] font-semibold tracking-wide uppercase"
                      style={{ color: STATUS_COLOR[post.status] || "var(--muted)" }}
                    >
                      {post.status}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {formatWhen(post.scheduledAt)}
                    </span>
                  </div>
                  {post.caption ? (
                    <p className="line-clamp-2 text-xs text-[var(--muted)]">
                      {post.caption}
                    </p>
                  ) : null}
                  {post.error ? (
                    <p className="line-clamp-3 text-[10px] text-[var(--danger)]">
                      {post.error}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    {post.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => void retryPost(post.id)}
                        className="text-[10px] font-medium text-[var(--accent)]"
                      >
                        Retry
                      </button>
                    )}
                    {post.status !== "posted" && post.status !== "publishing" && (
                      <button
                        type="button"
                        onClick={() => void deletePost(post.id)}
                        className="text-[10px] font-medium text-[var(--muted)] hover:text-[var(--danger)]"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[88px] rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2">
      <div className="text-[10px] tracking-wider text-[var(--muted)] uppercase">
        {label}
      </div>
      <div
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display), sans-serif" }}
      >
        {value}
      </div>
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
    <label className="flex flex-col gap-1.5 text-xs text-[var(--muted)]">
      <span>{label}</span>
      {children}
    </label>
  );
}
