import { authenticate } from "../../../../server/auth";
import { verifyAppCheckIfEnforced } from "../../../../server/app-check";
import { getServerEnv } from "../../../../server/config";
import { Firestore } from "../../../../server/firestore";
import { API_SECURITY_HEADERS, readBoundedBuffer } from "../../../../server/http-security";
import { ensure, ServiceError } from "../../../../server/platform";
import {
  authorizeAndReserveExtraction,
  extractProblemFromMedia,
  MAX_EXTRACTION_FILE_BYTES,
  releaseExtractionLock,
  validateUploadedProblemMedia,
} from "../../../../server/problem-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_REQUEST_BODY_BYTES = Math.ceil((MAX_EXTRACTION_FILE_BYTES * 4) / 3) + 64 * 1024;
const ALLOWED_SUBJECT_IDS = new Set(["quantitative-methods", "discrete-mathematics"]);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

async function parseExtractionPayload(request: Request): Promise<{
  bytes: Uint8Array;
  declaredMimeType: string;
  subjectId?: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  const rawBuffer = await readBoundedBuffer(
    request,
    MAX_REQUEST_BODY_BYTES,
    "Uploaded file must be 4 MB or smaller.",
  );

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBuffer.toString("utf8"));
    } catch {
      throw new ServiceError(400, "invalid-request", "Request must contain valid JSON.");
    }
    ensure(
      parsed && typeof parsed === "object" && !Array.isArray(parsed),
      "Invalid extraction request.",
      400,
    );
    const payload = parsed as { dataBase64?: unknown; mimeType?: unknown; subjectId?: unknown };
    ensure(
      typeof payload.dataBase64 === "string" && payload.dataBase64.length > 0,
      "A problem image or PDF file is required.",
      400,
    );
    const cleanedBase64 = payload.dataBase64.replace(/\s+/g, "");
    ensure(
      cleanedBase64.length > 0 &&
        cleanedBase64.length % 4 === 0 &&
        BASE64_PATTERN.test(cleanedBase64),
      "Invalid base64 image or PDF payload.",
      400,
    );
    ensure(
      typeof payload.mimeType === "string" && payload.mimeType.length > 0,
      "A valid file MIME type is required.",
      400,
    );
    const bytes = new Uint8Array(Buffer.from(cleanedBase64, "base64"));
    const subjectId =
      typeof payload.subjectId === "string" && ALLOWED_SUBJECT_IDS.has(payload.subjectId)
        ? payload.subjectId
        : undefined;
    return { bytes, declaredMimeType: payload.mimeType, subjectId };
  }

  let formData: FormData;
  try {
    formData = await new Response(new Uint8Array(rawBuffer), {
      headers: contentType ? { "content-type": contentType } : undefined,
    }).formData();
  } catch {
    throw new ServiceError(400, "invalid-request", "Upload a valid image or PDF file.");
  }

  const uploadedFile = formData.get("file");
  ensure(uploadedFile instanceof Blob, "A problem image or PDF file is required.", 400);
  if (uploadedFile.size > MAX_EXTRACTION_FILE_BYTES) {
    throw new ServiceError(413, "too-large", "Uploaded file must be 4 MB or smaller.");
  }
  const rawSubjectId = formData.get("subjectId");
  const subjectId =
    typeof rawSubjectId === "string" && ALLOWED_SUBJECT_IDS.has(rawSubjectId)
      ? rawSubjectId
      : undefined;
  const bytes = new Uint8Array(await uploadedFile.arrayBuffer());
  return { bytes, declaredMimeType: uploadedFile.type, subjectId };
}

/**
 * Handles authenticated image/PDF uploads to extract a mathematical problem statement.
 *
 * @param request - Incoming HTTP POST request (multipart/form-data or base64 JSON).
 * @returns JSON response containing the extracted problem or structured error.
 */
export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  try {
    const env = getServerEnv();
    const uid = await authenticate(request, env);
    await verifyAppCheckIfEnforced(request, env);

    const { bytes, declaredMimeType, subjectId } = await parseExtractionPayload(request);
    const verifiedMimeType = validateUploadedProblemMedia(bytes, declaredMimeType);

    const store = new Firestore();
    const leaseId = await authorizeAndReserveExtraction(store, env, uid);
    try {
      const extracted = await extractProblemFromMedia(env, {
        bytes,
        mimeType: verifiedMimeType,
        subjectId,
      });

      return Response.json(extracted, { headers: API_SECURITY_HEADERS });
    } finally {
      await releaseExtractionLock(store, uid, leaseId);
    }
  } catch (error) {
    const known = error instanceof ServiceError;
    const status = known ? error.status : 503;
    console.warn(
      JSON.stringify({
        event: "problem_extraction_request_failed",
        status,
        code: known ? error.code : "unavailable",
      }),
    );
    return Response.json(
      {
        error: {
          code: known ? error.code : "unavailable",
          message: known
            ? error.message
            : "The AI image reader is temporarily unavailable. You can still type your problem below.",
          retryable: status === 429 || status >= 500,
          retryAfter: known ? error.retryAfter : 0,
        },
      },
      { status, headers: API_SECURITY_HEADERS },
    );
  } finally {
    console.info(JSON.stringify({ event: "problem_extraction_timing", durationMs: Date.now() - started }));
  }
}
