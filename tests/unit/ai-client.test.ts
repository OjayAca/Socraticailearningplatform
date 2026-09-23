// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aiOperation } from "../../src/lib/ai-client";

const { auth } = vi.hoisted(() => ({ auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") } as { getIdToken: ReturnType<typeof vi.fn> } | null } }));
vi.mock("../../src/lib/firebase", () => ({ auth }));
beforeEach(() => { auth.currentUser!.getIdToken.mockResolvedValue("firebase-id-token"); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("recovers a timed-out operation without submitting the mutation twice", async () => {
  const input = { sessionId: "saved", requestId: "original-id" };
  const fetch = vi.fn().mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
    .mockResolvedValueOnce(Response.json({ status: "complete", result: { session: { id: "saved", revision: 2 } } }));
  vi.stubGlobal("fetch", fetch);
  expect(await aiOperation("evaluatePhaseResponse", input)).toEqual({ session: { id: "saved", revision: 2 } });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ operation: "getLearningOperationResult", input: { operation: "evaluatePhaseResponse", input } });
});

it("keeps the original error when saved work cannot be recovered", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"))
    .mockResolvedValueOnce(Response.json({ status: "retryable" }));
  vi.stubGlobal("fetch", fetch);
  await expect(aiOperation("evaluatePhaseResponse", { requestId: "original-id" })).rejects.toMatchObject({ code: "network-unavailable" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("bounds recovery polling while the original request remains pending", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn().mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockImplementation(async () => Response.json({ status: "pending" }));
    vi.stubGlobal("fetch", fetch);
    const pending = expect(aiOperation("evaluatePhaseResponse", { requestId: "original-id" })).rejects.toMatchObject({ code: "request-timeout" });
    await vi.runAllTimersAsync();
    await pending;
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.slice(1).every(call => JSON.parse(call[1].body).operation === "getLearningOperationResult")).toBe(true);
  } finally { vi.useRealTimers(); }
});

it("uses the same-origin route and the current Firebase token", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ session: { id: "saved" } }));
  vi.stubGlobal("fetch", fetch);
  expect(await aiOperation("resumeTutorOpening", { sessionId: "saved" })).toEqual({ session: { id: "saved" } });
  expect(fetch).toHaveBeenCalledWith("/api/learning", expect.objectContaining({
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer firebase-id-token" },
    body: JSON.stringify({ operation: "resumeTutorOpening", input: { sessionId: "saved" } }),
  }));
});

it("preserves API error details used by the learning interface", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "conflict", message: "Reload the session.", retryable: false } }, { status: 409 })));
  await expect(aiOperation("saveSessionDraft", {})).rejects.toMatchObject({ code: "conflict", message: "Reload the session.", details: { retryable: false } });
});

it("waits beyond the server's 120-second request budget", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
  await aiOperation("evaluatePhaseResponse", {});
  expect(timeout).toHaveBeenCalledWith(125000);
});

it("distinguishes a timeout from a connection failure without resending work", async () => {
  const fetch = vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  vi.stubGlobal("fetch", fetch);
  await expect(aiOperation("evaluatePhaseResponse", {})).rejects.toMatchObject({ code: "request-timeout", message: expect.stringContaining("Reload saved progress before retrying") });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("explains connection failures separately from provider errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  await expect(aiOperation("evaluatePhaseResponse", {})).rejects.toMatchObject({ code: "network-unavailable", message: expect.stringContaining("development server") });
});

it("does not mislabel a failed token refresh as an unreachable tutor", async () => {
  auth.currentUser!.getIdToken.mockRejectedValue(new Error("Token refresh failed"));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(aiOperation("evaluatePhaseResponse", {})).rejects.toMatchObject({ code: "auth-unavailable" });
  expect(fetch).not.toHaveBeenCalled();
});

it("handles a non-JSON server failure without losing the recovery guidance", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad gateway", { status: 502 })));
  await expect(aiOperation("evaluatePhaseResponse", {})).rejects.toMatchObject({ code: "invalid-server-response", message: expect.stringContaining("Your work is preserved") });
});
