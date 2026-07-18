import { prisma } from "./db";
import { publishImagePost } from "./instagram";

export async function publishDuePosts({ limit = 2 } = {}) {
  const now = new Date();

  const due = await prisma.post.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  const results: Array<{
    id: string;
    ok: boolean;
    mediaId?: string;
    error?: string;
  }> = [];

  for (const post of due) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "publishing",
        attempts: { increment: 1 },
        error: null,
      },
    });

    try {
      const published = await publishImagePost({
        imageUrl: post.imageUrl,
        caption: post.caption || "",
      });

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "posted",
          postedAt: new Date(),
          containerId: published.containerId,
          igMediaId: published.mediaId,
          error: null,
        },
      });

      results.push({ id: post.id, ok: true, mediaId: published.mediaId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "failed",
          error: message,
        },
      });
      results.push({ id: post.id, ok: false, error: message });
    }
  }

  return { processed: results.length, results };
}
