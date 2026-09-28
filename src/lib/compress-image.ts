/** Browser-side resize + JPEG encode so uploads stay under Vercel's 4.5MB body limit. */

const SUPPORTED_RE = /^(image\/(jpeg|jpg|png|webp|gif|bmp|avif))$/i;

export function isLikelyUnsupportedImage(file: File) {
  const name = file.name || "";
  const type = file.type || "";
  if (/\.heic$|\.heif$/i.test(name)) return true;
  if (/heic|heif/i.test(type)) return true;
  if (type && !type.startsWith("image/")) return true;
  if (type && !SUPPORTED_RE.test(type) && !type.startsWith("image/")) return true;
  return false;
}

export async function compressImageForUpload(
  file: File,
  {
    maxEdge = 1440,
    quality = 0.86,
  }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (isLikelyUnsupportedImage(file)) {
    throw new Error(
      `"${file.name}" looks like HEIC/unsupported. Export as JPG/PNG/WebP and try again.`,
    );
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error(`Could not process "${file.name}"`);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) {
      throw new Error(`Could not compress "${file.name}" to JPEG`);
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch (err) {
    if (err instanceof Error && err.message.includes("HEIC")) throw err;
    if (err instanceof Error && err.message.includes("Could not")) throw err;
    throw new Error(
      `Could not read "${file.name}". Use JPG, PNG, or WebP (not HEIC).`,
    );
  }
}

/** Pack files into request batches that stay under Vercel's ~4.5MB limit. */
export function packUploadBatches(files: File[], maxBytes = 3.5 * 1024 * 1024) {
  const batches: File[][] = [];
  let current: File[] = [];
  let bytes = 0;

  for (const file of files) {
    if (file.size > maxBytes) {
      throw new Error(
        `"${file.name}" is still too large after compression (${Math.round(file.size / 1024 / 1024)}MB). Try a smaller image.`,
      );
    }
    if (current.length > 0 && (bytes + file.size > maxBytes || current.length >= 3)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function parseApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (res.status === 401) {
      throw new Error("Session expired — log in again, then retry.");
    }
    if (res.status === 413) {
      throw new Error(
        "Upload too large for the server (max ~4.5MB per request). Try fewer/smaller images.",
      );
    }
    throw new Error(
      `Server returned a non-JSON error (${res.status}). Try again with fewer images.`,
    );
  }
}
