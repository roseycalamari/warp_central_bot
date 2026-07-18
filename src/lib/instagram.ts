import { requireEnv } from "./paths";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphError = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

async function graphFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<T> {
  const version = process.env.META_GRAPH_VERSION || "v21.0";
  const token = requireEnv("META_ACCESS_TOKEN");
  const url = new URL(`https://graph.facebook.com/${version}${path}`);
  url.searchParams.set("access_token", token);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      url.searchParams.set(k, v);
    }
  }

  const { query: _q, ...rest } = init || {};
  const res = await fetch(url, rest);
  const data = (await res.json()) as T & GraphError;

  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message ||
        `Meta Graph API error (${res.status}) on ${path}`,
    );
  }

  return data;
}

export async function getPublishingLimit(igUserId: string) {
  return graphFetch<{
    data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>;
  }>(`/${igUserId}/content_publishing_limit`, {
    query: { fields: "quota_usage,config" },
  });
}

export async function createImageContainer(opts: {
  igUserId: string;
  imageUrl: string;
  caption: string;
}) {
  const body = new URLSearchParams({
    image_url: opts.imageUrl,
    caption: opts.caption,
    access_token: requireEnv("META_ACCESS_TOKEN"),
  });

  const version = process.env.META_GRAPH_VERSION || "v21.0";
  const res = await fetch(
    `https://graph.facebook.com/${version}/${opts.igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = (await res.json()) as { id?: string } & GraphError;
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || "Failed to create media container");
  }
  return data.id;
}

export async function waitForContainer(
  containerId: string,
  { attempts = 20, delayMs = 2000 } = {},
) {
  for (let i = 0; i < attempts; i++) {
    const status = await graphFetch<{
      status_code?: string;
      status?: string;
    }>(`/${containerId}`, {
      query: { fields: "status_code,status" },
    });

    const code = status.status_code;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(
        `Container ${containerId} failed with status ${code}: ${status.status || ""}`,
      );
    }
    await sleep(delayMs);
  }
  throw new Error(`Container ${containerId} timed out waiting for FINISHED`);
}

export async function publishContainer(opts: {
  igUserId: string;
  creationId: string;
}) {
  const body = new URLSearchParams({
    creation_id: opts.creationId,
    access_token: requireEnv("META_ACCESS_TOKEN"),
  });

  const version = process.env.META_GRAPH_VERSION || "v21.0";
  const res = await fetch(
    `https://graph.facebook.com/${version}/${opts.igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = (await res.json()) as { id?: string } & GraphError;
  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || "Failed to publish media");
  }
  return data.id;
}

export async function publishImagePost(opts: {
  imageUrl: string;
  caption: string;
}) {
  const igUserId = requireEnv("IG_USER_ID");

  const limit = await getPublishingLimit(igUserId);
  const usage = limit.data?.[0]?.quota_usage ?? 0;
  const total = limit.data?.[0]?.config?.quota_total ?? 100;
  if (usage >= total) {
    throw new Error(
      `Instagram publish quota reached (${usage}/${total} in 24h)`,
    );
  }

  const containerId = await createImageContainer({
    igUserId,
    imageUrl: opts.imageUrl,
    caption: opts.caption,
  });

  await waitForContainer(containerId);

  const mediaId = await publishContainer({
    igUserId,
    creationId: containerId,
  });

  return { containerId, mediaId, quotaUsage: usage + 1, quotaTotal: total };
}
