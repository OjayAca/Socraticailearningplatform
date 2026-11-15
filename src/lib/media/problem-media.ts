export const SUPPORTED_PROBLEM_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

type SupportedProblemMediaMimeType = (typeof SUPPORTED_PROBLEM_MEDIA_MIME_TYPES)[number];

const MAX_RAW_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_UPLOAD_MEDIA_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const COMPRESSION_THRESHOLD_BYTES = 800 * 1024;

function isSupportedProblemMediaType(
  mimeType: string,
): mimeType is SupportedProblemMediaMimeType {
  return (SUPPORTED_PROBLEM_MEDIA_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Validates and optionally compresses an uploaded or captured problem media file
 * before sending it to the extraction endpoint.
 *
 * @param file - User-selected or camera-captured File.
 * @returns Validated (and if applicable, resized/compressed) File ready for upload.
 */
export async function prepareProblemMediaFile(file: File): Promise<File> {
  if (!file || file.size <= 0) {
    throw new Error("The selected file is empty. Choose a valid image or PDF.");
  }

  if (!isSupportedProblemMediaType(file.type)) {
    throw new Error("Unsupported file format. Upload a PNG, JPG, WEBP image, or a PDF document.");
  }

  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_MEDIA_BYTES) {
      throw new Error("PDF files must be 4 MB or smaller.");
    }
    return file;
  }

  if (file.size > MAX_RAW_IMAGE_BYTES) {
    throw new Error("Image files must be 15 MB or smaller.");
  }

  if (file.size > COMPRESSION_THRESHOLD_BYTES) {
    const compressed = await tryCompressImageFile(file);
    if (compressed && compressed.size <= MAX_UPLOAD_MEDIA_BYTES) {
      return compressed;
    }
  }

  if (file.size > MAX_UPLOAD_MEDIA_BYTES) {
    throw new Error("Image file is too large (maximum 4 MB). Try taking a closer photo or cropping the image.");
  }

  return file;
}

async function tryCompressImageFile(file: File): Promise<File | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const longestEdge = Math.max(bitmap.width, bitmap.height);
      const scale = longestEdge > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestEdge : 1;
      const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) return null;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.85);
      });
      if (!blob) return null;

      const baseName = file.name.replace(/\.[^.]+$/, "") || "problem-photo";
      return new File([blob], `${baseName}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    } finally {
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
    }
  } catch {
    return null;
  }
}
