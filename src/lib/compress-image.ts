/** Browser-side resize + JPEG encode so uploads stay under Vercel's 4.5MB body limit. */
export async function compressImageForUpload(
  file: File,
  {
    maxEdge = 1440,
    quality = 0.86,
  }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
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
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    // HEIC / exotic formats — send original; caller should use small batches
    return file;
  }
}

export async function parseApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (res.status === 413) {
      throw new Error(
        "Upload too large for the server (max ~4.5MB per request). Images will be compressed and sent in smaller batches — try again.",
      );
    }
    throw new Error(
      `Server returned a non-JSON error (${res.status}). Try again; large batches are uploaded in smaller chunks.`,
    );
  }
}
