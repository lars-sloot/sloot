// Keep document text at high resolution. Never trade legibility for a byte target.
export const documentImageMaxEdge = 4096;
const quality = 0.92;
const minimumBytes = 200 * 1024;

type PreparedImage = { file: File; warning?: string };
type DecodedImage = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Safari may decode a camera format through an <img> but not ImageBitmap.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function optimizeUploadImage(file: File): Promise<PreparedImage> {
  // PDFs retain their original pages/text. Existing WebP and small images are
  // already compact: avoid repeatedly applying lossy compression on retries.
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    || file.type === "image/webp" || /\.webp$/i.test(file.name)
    || file.size < minimumBytes) return { file };
  if (!/^image\/(jpeg|png|heic|heif)$/.test(file.type)
    && !/\.(jpe?g|png|heic|heif)$/i.test(file.name)) return { file };

  let decoded: DecodedImage | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    decoded = await decodeImage(file);
    if (!decoded.width || !decoded.height) throw new Error("Empty image");
    const longestEdge = Math.max(decoded.width, decoded.height);
    const shortestEdge = Math.min(decoded.width, decoded.height);
    // Long receipts can contain much smaller text than an A4 page. Preserve
    // their pixel dimensions instead of squeezing the whole receipt to 4096px.
    const scale = longestEdge / shortestEdge > 2
      ? 1 : Math.min(1, documentImageMaxEdge / longestEdge);
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    // Transparent scans must remain readable against a white paper background.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    let blob = await encode(canvas, "image/webp");
    // Unsupported canvas encoders silently return PNG; inspect the real type.
    if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg");
    if (!blob || !["image/webp", "image/jpeg"].includes(blob.type) || !blob.size) throw new Error("Encoding failed");
    if (blob.size >= file.size * 0.9) return { file };
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") || "pakbon";
    return { file: new File([blob], `${name}.${extension}`, { type: blob.type, lastModified: file.lastModified }) };
  } catch {
    // A photo must never disappear because a device cannot compress its format.
    return { file, warning: "Een foto kon niet worden verkleind en wordt in oorspronkelijke kwaliteit opgeslagen." };
  } finally {
    decoded?.close();
    // Release large pixel buffers before processing the next camera photo.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
