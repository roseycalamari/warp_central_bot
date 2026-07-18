import { del } from "@vercel/blob";
import { prisma } from "./db";
import { instagramMediaExists } from "./instagram";

/**
 * Removes local "posted" rows (and Blob images) when the matching
 * Instagram media no longer exists (e.g. deleted in the IG app).
 */
export async function syncDeletedFromInstagram({ limit = 40 } = {}) {
  const posted = await prisma.post.findMany({
    where: {
      status: "posted",
      igMediaId: { not: null },
    },
    orderBy: { postedAt: "asc" },
    take: limit,
  });

  const removed: string[] = [];
  const kept: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const post of posted) {
    if (!post.igMediaId) continue;

    try {
      const exists = await instagramMediaExists(post.igMediaId);
      if (exists) {
        kept.push(post.id);
        continue;
      }

      try {
        await del(post.imageUrl);
      } catch {
        // ignore missing blob
      }

      await prisma.post.delete({ where: { id: post.id } });
      removed.push(post.id);
    } catch (err) {
      errors.push({
        id: post.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    checked: posted.length,
    removed: removed.length,
    kept: kept.length,
    removedIds: removed,
    errors,
  };
}
