// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/learning/route";
import { ServiceError } from "../../server/platform";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), operation: vi.fn(), get: vi.fn() }));
vi.mock("../../server/auth", () => ({ authenticate: mocks.authenticate }));
vi.mock("../../server/config", () => ({ getServerEnv: () => ({ FIREBASE_PROJECT_ID: "existing-project" }) }));
vi.mock("../../server/firestore", () => ({ Firestore: class { get = mocks.get; } }));
vi.mock("../../server/services/LearningService", () => ({ LearningService: class { operation = mocks.operation; } }));
const request = (body: string) => new Request("http://localhost/api/learning", { method: "POST", body });
beforeEach(() => { mocks.authenticate.mockReset().mockResolvedValue("alice"); mocks.operation.mockReset().mockResolvedValue({ session: { id: "saved" } }); mocks.get.mockReset(); });

describe("Next learning route", () => {
  it("rejects unauthenticated calls before reading or dispatching operations", async () => {
    mocks.authenticate.mockRejectedValue(new ServiceError(401, "unauthenticated", "Sign in again."));
    const response = await POST(request('{}'));
    expect(response.status).toBe(401);
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it.each(['{', 'null', '[]', '{}'])("rejects malformed payload %s", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it("limits streamed body bytes, including multibyte characters", async () => {
    expect((await POST(request('é'.repeat(10001)))).status).toBe(413);
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it.each(["startLearningSession", "createFollowUpSession", "evaluatePhaseResponse", "requestSessionSupport", "finalizeScorecard", "submitLearningSession", "abandonLearningSession", "saveSessionDraft", "resumeTutorOpening", "checkLearningSessionActivity", "previewVerifiedProblem"])("keeps %s dispatch compatible", async operation => {
    const response = await POST(request(JSON.stringify({ operation, input: { requestId: "same-id" } })));
    expect(await response.json()).toEqual({ session: { id: "saved" } });
    expect(mocks.operation).toHaveBeenCalledWith(operation, { requestId: "same-id" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("preserves retryable quota errors and hides unexpected failures", async () => {
    mocks.operation.mockRejectedValueOnce(new ServiceError(429, "ai-quota", "Try later.", 60));
    const quota = await POST(request('{"operation":"startLearningSession"}'));
    expect(await quota.json()).toMatchObject({ error: { code: "ai-quota", retryable: true, retryAfter: 60 } });
    mocks.operation.mockRejectedValueOnce(new Error("private key or student content"));
    const outage = await POST(request('{"operation":"startLearningSession"}'));
    expect(outage.status).toBe(503);
    expect(await outage.text()).not.toContain("private key");
  });
  it("restricts health diagnostics to active operators", async () => {
    mocks.get.mockResolvedValue({ data: { role: "student", status: "active" } });
    expect((await POST(request('{"operation":"backendHealth"}'))).status).toBe(403);
  });
});
