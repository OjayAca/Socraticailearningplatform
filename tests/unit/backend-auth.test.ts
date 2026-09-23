// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "../../server/auth";
import { getServerEnv } from "../../server/config";
import type { Env } from "../../server/platform";

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock("../../server/firebase", () => ({ getAdminAuth: () => ({ verifyIdToken }) }));
const env = { FIREBASE_PROJECT_ID: "existing-project" } as Env;
const request = (token?: string) => new Request("https://app.example/api/learning", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
beforeEach(() => { verifyIdToken.mockReset(); vi.unstubAllEnvs(); });

describe("server authentication", () => {
  it("rejects missing tokens before calling Firebase", async () => {
    await expect(authenticate(request(), env)).rejects.toMatchObject({ status: 401 });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
  it("uses the verified UID", async () => {
    verifyIdToken.mockResolvedValue({ uid: "alice", aud: "existing-project", iss: "https://securetoken.google.com/existing-project" });
    expect(await authenticate(request("id-token"), env)).toBe("alice");
    expect(verifyIdToken).toHaveBeenCalledWith("id-token");
  });
  it.each(["auth/id-token-expired", "auth/invalid-id-token", "auth/argument-error"])("rejects %s", async code => {
    verifyIdToken.mockRejectedValue({ code });
    await expect(authenticate(request("invalid"), env)).rejects.toMatchObject({ status: 401 });
  });
  it.each([
    { uid: "alice", aud: "another-project", iss: "https://securetoken.google.com/existing-project" },
    { uid: "alice", aud: "existing-project", iss: "https://securetoken.google.com/another-project" },
    { uid: "../bob", aud: "existing-project", iss: "https://securetoken.google.com/existing-project" },
  ])("rejects mismatched claims", async claims => {
    verifyIdToken.mockResolvedValue(claims);
    await expect(authenticate(request("invalid"), env)).rejects.toMatchObject({ status: 401 });
  });
  it("reports verification outages without exposing provider errors", async () => {
    verifyIdToken.mockRejectedValue(new Error("private provider detail"));
    await expect(authenticate(request("token"), env)).rejects.toMatchObject({ status: 503, code: "auth-unavailable" });
  });
});

describe("server project configuration", () => {
  it("rejects a different backend project and emulator overrides", () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "existing-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "existing-project");
    vi.stubEnv("FIREBASE_PROJECT_ID", "another-project");
    expect(getServerEnv).toThrow("must match");
    vi.stubEnv("FIREBASE_PROJECT_ID", "existing-project");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "localhost:8080");
    expect(getServerEnv).toThrow("Emulator");
  });
});
