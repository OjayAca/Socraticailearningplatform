import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../helpers/memory-learning-store";
import type { Env } from "../../server/platform";
import {
  authorizeAndReserveExtraction,
  detectMediaMimeType,
  extractProblemFromMedia,
  MAX_EXTRACTION_FILE_BYTES,
  validateUploadedProblemMedia,
} from "../../server/problem-extractor";
import { POST } from "../../app/api/learning/extract-problem/route";
import { prepareProblemMediaFile } from "@/lib/media/problem-media";

const VALID_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const VALID_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const VALID_WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const VALID_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

let db: MemoryStore;
let env: Env;

vi.mock("../../server/auth", () => ({
  authenticate: vi.fn(async (request: Request) => {
    if (request.headers.get("Authorization") !== "Bearer valid-token") {
      throw Object.assign(new Error("Sign in required"), { status: 401, code: "unauthenticated" });
    }
    return "student-1";
  }),
}));

vi.mock("../../server/config", () => ({
  getServerEnv: () => env,
}));

vi.mock("../../server/firestore", () => ({
  Firestore: vi.fn(function () {
    return db;
  }),
}));

describe("problem-extractor unit and route tests", () => {
  beforeEach(() => {
    db = new MemoryStore();
    env = {
      FIREBASE_PROJECT_ID: "socratic-ai-a7765",
      GEMINI_API_KEY: "test-key",
      GEMINI_MODEL: "gemini-2.5-flash-lite",
      AI_ENABLED: "true",
      AI_FREE_TIER_CONFIRMED: "true",
      GEMINI_RPM: "15",
      GEMINI_TPM: "250000",
      GEMINI_RPD: "500",
    };
    db.put("users/student-1", { status: "active" });
    db.put("system_settings/privacy", { currentConsentVersion: "v1" });
    db.put("policy_documents/v1", { status: "active", aiProcessingVersion: "gemini-free-v1" });
    db.put("users/student-1/consents/v1", { version: "v1" });
    db.put("system_settings/pilot", { state: "open", enabledTopicIds: ["quantitative-methods-functions"] });
    db.put("pilot_roster/student-1", { status: "admitted" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects magic bytes and validates supported MIME types", () => {
    expect(detectMediaMimeType(VALID_PNG_BYTES)).toBe("image/png");
    expect(detectMediaMimeType(VALID_JPEG_BYTES)).toBe("image/jpeg");
    expect(detectMediaMimeType(VALID_WEBP_BYTES)).toBe("image/webp");
    expect(detectMediaMimeType(VALID_PDF_BYTES)).toBe("application/pdf");
    expect(detectMediaMimeType(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();

    expect(validateUploadedProblemMedia(VALID_PNG_BYTES, "image/png")).toBe("image/png");
    expect(() => validateUploadedProblemMedia(VALID_PNG_BYTES, "application/pdf")).toThrow(
      /Unsupported file format/,
    );
    expect(() => validateUploadedProblemMedia(new Uint8Array(0), "image/png")).toThrow(/empty/);
    expect(() =>
      validateUploadedProblemMedia(new Uint8Array(MAX_EXTRACTION_FILE_BYTES + 1), "image/png"),
    ).toThrow(/4 MB/);
  });

  it("validates client-side files with prepareProblemMediaFile", async () => {
    const validPng = new File([VALID_PNG_BYTES], "problem.png", { type: "image/png" });
    expect(await prepareProblemMediaFile(validPng)).toBe(validPng);

    const emptyFile = new File([], "empty.png", { type: "image/png" });
    await expect(prepareProblemMediaFile(emptyFile)).rejects.toThrow(/empty/);

    const badMime = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(prepareProblemMediaFile(badMime)).rejects.toThrow(/Unsupported file format/);
  });

  it("extracts problem text and optional LaTeX via Gemini and strips orphan LaTeX", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    detected: true,
                    problemText: "Given f(x) = [math], find f(3).",
                    problemLatex: "x^{2}+2x+1",
                    confidence: "high",
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractProblemFromMedia(env, {
      bytes: VALID_PNG_BYTES,
      mimeType: "image/png",
      subjectId: "quantitative-methods",
    });

    expect(result).toEqual({
      detected: true,
      problemText: "Given f(x) = [math], find f(3).",
      problemLatex: "x^{2}+2x+1",
      confidence: "high",
    });

    // When problemText does not contain [math], problemLatex should be omitted so verifyOwnProblem succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    detected: true,
                    problemText: "Find the mean of 4, 8, and 12.",
                    problemLatex: "4, 8, 12",
                    confidence: "high",
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const plainResult = await extractProblemFromMedia(env, {
      bytes: VALID_JPEG_BYTES,
      mimeType: "image/jpeg",
    });
    expect(plainResult).toEqual({
      detected: true,
      problemText: "Find the mean of 4, 8, and 12.",
      confidence: "high",
    });
  });

  it("enforces consent, pilot readiness, and shared quota reservation on the POST route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    detected: true,
                    problemText: "Given f(x) = 2x + 3, find f(5).",
                    confidence: "high",
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/learning/extract-problem", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataBase64: Buffer.from(VALID_PNG_BYTES).toString("base64"),
          mimeType: "image/png",
          subjectId: "quantitative-methods",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({
      detected: true,
      problemText: "Given f(x) = 2x + 3, find f(5).",
      confidence: "high",
    });

    const quotaDoc = await db.get("ai_usage/shared");
    expect(quotaDoc.data?.requests).toBe(1);

    // Revoking consent blocks extraction with 403
    db.put("users/student-1/consents/v1", null);
    await expect(authorizeAndReserveExtraction(db, env, "student-1")).rejects.toThrow(
      /Read and acknowledge the current learning privacy notice/,
    );
  });

  it("enforces extraction lock with TTL expiry takeover and per-user extraction rate limits", async () => {
    // Active unexpired lock rejects with 409
    db.put("ai_locks/student-1_extract", { leaseId: "active-lease", expiresAt: Date.now() + 60_000 });
    await expect(authorizeAndReserveExtraction(db, env, "student-1")).rejects.toMatchObject({
      status: 409,
    });

    // Expired lock is safely taken over
    db.put("ai_locks/student-1_extract", { leaseId: "crashed-lease", expiresAt: Date.now() - 1 });
    const leaseId = await authorizeAndReserveExtraction(db, env, "student-1");
    expect(leaseId).toBeTruthy();
    const lockAfter = await db.get("ai_locks/student-1_extract");
    expect(lockAfter.data?.leaseId).toBe(leaseId);
    expect(lockAfter.data?.expiresAt).toBeGreaterThan(Date.now());

    // Release lock and verify per-user RPM cap (default 3/min)
    db.put("ai_locks/student-1_extract", { leaseId, expiresAt: 0 });
    await authorizeAndReserveExtraction(db, env, "student-1");
    db.put("ai_locks/student-1_extract", null);
    await authorizeAndReserveExtraction(db, env, "student-1");
    db.put("ai_locks/student-1_extract", null);
    await expect(authorizeAndReserveExtraction(db, env, "student-1")).rejects.toMatchObject({
      status: 429,
      code: "ai-quota",
    });
  });

  it("preserves safe \\displaystyle LaTeX while stripping dangerous \\style/\\htmlData/\\def commands", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      detected: true,
                      problemText: "Given f(x) = [math], find f(2).",
                      problemLatex: "\\displaystyle \\frac{x^{2}+1}{2}",
                      confidence: "high",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      detected: true,
                      problemText: "Given f(x) = [math], find f(2).\u0007",
                      problemLatex: "\\style{color:red}{x^2} + \\htmlData{x=1}{2}",
                      confidence: "high",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const safeResult = await extractProblemFromMedia(env, {
      bytes: VALID_PNG_BYTES,
      mimeType: "image/png",
    });
    expect(safeResult.problemLatex).toBe("\\displaystyle \\frac{x^{2}+1}{2}");

    const strippedResult = await extractProblemFromMedia(env, {
      bytes: VALID_PNG_BYTES,
      mimeType: "image/png",
    });
    expect(strippedResult.problemText).toBe("Given f(x) = [math], find f(2).");
    expect(strippedResult.problemLatex).toBeUndefined();
    expect(strippedResult.warning).toContain("Unsupported LaTeX formatting commands were removed");
  });

  it("rejects invalid base64 payloads and oversized chunked multipart streams", async () => {
    const badBase64Response = await POST(
      new Request("http://localhost/api/learning/extract-problem", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataBase64: "not valid base64!!!",
          mimeType: "image/png",
        }),
      }),
    );
    expect(badBase64Response.status).toBe(400);

    const oversizedChunkStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_EXTRACTION_FILE_BYTES * 2));
        controller.close();
      },
    });
    const chunkedResponse = await POST(
      new Request("http://localhost/api/learning/extract-problem", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "multipart/form-data; boundary=testboundary",
        },
        body: oversizedChunkStream,
        duplex: "half",
      } as RequestInit),
    );
    expect(chunkedResponse.status).toBe(413);
  });

  it("retries transient network resets during extraction before succeeding", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      detected: true,
                      problemText: "Given f(x) = 2x + 3, find f(5).",
                      confidence: "high",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const pending = extractProblemFromMedia(env, {
        bytes: VALID_PNG_BYTES,
        mimeType: "image/png",
      });
      await vi.runAllTimersAsync();
      await expect(pending).resolves.toMatchObject({
        detected: true,
        problemText: "Given f(x) = 2x + 3, find f(5).",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
