import { prisma } from "./db";
import { publishImagePost } from "./instagram";

async function publishOnePost(post: {
  id: string;
  imageUrl: string;
  caption: string;
}) {
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
        scheduledAt: new Date(),
        containerId: published.containerId,
        igMediaId: published.mediaId,
        error: null,
      },
    });

    return { id: post.id, ok: true as const, mediaId: published.mediaId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: "failed",
        error: message,
      },
    });
    return { id: post.id, ok: false as const, error: message };
  }
}

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

  const results = [];
  for (const post of due) {
    results.push(await publishOnePost(post));
  }

  return { processed: results.length, results };
}

/** Force-publish one post immediately (ignores scheduled time). */
export async function publishPostNow(id: string) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw new Error("Post not found");
  }
  if (post.status === "posted") {
    throw new Error("Post already published");
  }
  if (post.status === "publishing") {
    throw new Error("Post is already publishing");
  }

  return publishOnePost(post);
}
