import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { buildDaySchedule, staggerFromNow } from "@/lib/schedule";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ posts: [], error: message }, { status: 503 });
  }
}

function parseClientTimes(raw: FormDataEntryValue | null, expected: number) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== expected) return null;
    const times = parsed.map((value) => {
      if (value == null || value === "") return null;
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    });
    if (times.every((t) => t === null)) return null;
    return times;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);
    const caption = String(form.get("caption") || "");
    const mode = String(form.get("mode") || "bulk_day");
    const dayStr = form.get("day") ? String(form.get("day")) : null;
    const startHour = Number(form.get("startHour") || 9);
    const endHour = Number(form.get("endHour") || 21);
    const everyMinutes = Number(form.get("everyMinutes") || 45);
    const batchStartIndex = Math.max(
      0,
      Number(form.get("batchStartIndex") || 0),
    );
    const batchTotal = Math.max(
      files.length,
      Number(form.get("batchTotal") || files.length),
    );
    const singleAt = form.get("scheduledAt")
      ? new Date(String(form.get("scheduledAt")))
      : null;
    const clientTimes = parseClientTimes(form.get("scheduledAts"), files.length);

    if (files.length === 0) {
      return NextResponse.json({ error: "No images uploaded" }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is not set" },
        { status: 500 },
      );
    }

    const saved: { imageUrl: string; originalName: string }[] = [];

    for (const file of files) {
      const name = file.name || "image";
      if (/\.heic$|\.heif$/i.test(name) || /heic|heif/i.test(file.type || "")) {
        return NextResponse.json(
          {
            error: `"${name}" is HEIC/HEIF. Export as JPG/PNG/WebP, then schedule again.`,
          },
          { status: 400 },
        );
      }

      let jpeg: Buffer;
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        jpeg = await sharp(buf)
          .rotate()
          .resize({
            width: 1440,
            height: 1440,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          {
            error: `Could not process "${name}". Use JPG/PNG/WebP. (${detail})`,
          },
          { status: 400 },
        );
      }

      const filename = `moodboard/${randomUUID()}.jpg`;
      let blob;
      try {
        blob = await put(filename, jpeg, {
          access: "public",
          contentType: "image/jpeg",
          addRandomSuffix: false,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `Cloud upload failed for "${name}": ${detail}` },
          { status: 500 },
        );
      }

      saved.push({ imageUrl: blob.url, originalName: name });
    }

    let batchTimes: (Date | null)[] = [];

    if (clientTimes) {
      batchTimes = clientTimes;
    } else if (mode === "draft") {
      batchTimes = saved.map(() => null);
    } else if (
      mode === "single" &&
      singleAt &&
      !Number.isNaN(singleAt.getTime())
    ) {
      batchTimes = saved.map(() => singleAt);
    } else if (mode === "stagger") {
      const allTimes = staggerFromNow(batchTotal, everyMinutes);
      batchTimes = saved.map((_, i) => allTimes[batchStartIndex + i] ?? null);
    } else {
      const day = dayStr ? new Date(`${dayStr}T12:00:00`) : new Date();
      const allTimes = buildDaySchedule({
        count: batchTotal,
        day,
        startHour,
        endHour,
      });
      batchTimes = saved.map((_, i) => allTimes[batchStartIndex + i] ?? null);
    }

    const posts = await prisma.$transaction(
      saved.map((s, i) => {
        const scheduledAt = batchTimes[i] ?? null;
        return prisma.post.create({
          data: {
            caption,
            imageUrl: s.imageUrl,
            status: scheduledAt ? "scheduled" : "draft",
            scheduledAt,
          },
        });
      }),
    );

    return NextResponse.json({
      ok: true,
      count: posts.length,
      batchStartIndex,
      batchTotal,
      posts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data: {
    caption?: string;
    status?: string;
    scheduledAt?: Date | null;
    error?: string | null;
  } = {};

  if (typeof body.caption === "string") data.caption = body.caption;
  if (typeof body.status === "string") data.status = body.status;
  if (body.scheduledAt === null) {
    data.scheduledAt = null;
    data.status = "draft";
  } else if (typeof body.scheduledAt === "string") {
    data.scheduledAt = new Date(body.scheduledAt);
    data.status = "scheduled";
    data.error = null;
  }
  if (body.retry === true) {
    data.status = "scheduled";
    data.error = null;
    if (!body.scheduledAt) {
      data.scheduledAt = new Date();
    }
  }
  if (body.unschedule === true) {
    data.scheduledAt = null;
    data.status = "draft";
    data.error = null;
  }

  const post = await prisma.post.update({ where: { id }, data });
  return NextResponse.json({ post });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const status = searchParams.get("status");

  // Bulk delete failed / draft posts to free Blob storage
  if (!id && (status === "failed" || status === "draft" || status === "cleanup")) {
    const statuses =
      status === "cleanup" ? ["failed", "draft"] : [status];
    const posts = await prisma.post.findMany({
      where: { status: { in: statuses } },
    });

    let deleted = 0;
    for (const post of posts) {
      try {
        await del(post.imageUrl);
      } catch {
        // ignore
      }
      await prisma.post.delete({ where: { id: post.id } });
      deleted += 1;
    }

    return NextResponse.json({ ok: true, deleted });
  }

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await del(post.imageUrl);
  } catch {
    // ignore missing blob
  }

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
