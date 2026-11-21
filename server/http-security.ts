import "server-only";
import { ServiceError } from "./platform";

/** Standard defensive HTTP headers for all JSON/API responses. */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/**
 * Streams a request body up to a strict byte ceiling, protecting against oversized or chunked payloads.
 *
 * @param request - Incoming HTTP request.
 * @param maxBytes - Maximum permitted payload size in bytes.
 * @param tooLargeMessage - User-facing error message returned with HTTP 413 when exceeded.
 * @returns The buffered request body bytes.
 */
export async function readBoundedBuffer(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string,
): Promise<Buffer> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new ServiceError(413, "too-large", tooLargeMessage);
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new ServiceError(400, "invalid-request", "A request body is required.");
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ServiceError(413, "too-large", tooLargeMessage);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}
