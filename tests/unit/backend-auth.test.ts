// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, authenticateIdentity } from "../../server/auth";
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
  it("uses the verified UID without revocation lookup by default, and enables checkRevoked when AUTH_CHECK_REVOKED=true", async () => {
    verifyIdToken.mockResolvedValue({ uid: "alice", aud: "existing-project", iss: "https://securetoken.google.com/existing-project", email_verified: true });
    expect(await authenticate(request("id-token"), env)).toBe("alice");
    expect(verifyIdToken).toHaveBeenCalledWith("id-token", false);

    verifyIdToken.mockClear();
    expect(await authenticate(request("id-token"), { ...env, AUTH_CHECK_REVOKED: "true" })).toBe("alice");
    expect(verifyIdToken).toHaveBeenCalledWith("id-token", true);
  });
  it("rejects unverified or missing-claim student email tokens while allowing verified or operator/admin accounts", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "unverified-student",
      aud: "existing-project",
      iss: "https://securetoken.google.com/existing-project",
      email_verified: false,
    });
    await expect(authenticate(request("unverified-token"), env)).rejects.toMatchObject({
      status: 403,
      code: "email-unverified",
    });

    verifyIdToken.mockResolvedValueOnce({
      uid: "missing-verified-claim-student",
      aud: "existing-project",
      iss: "https://securetoken.google.com/existing-project",
    });
    await expect(authenticate(request("missing-claim-token"), env)).rejects.toMatchObject({
      status: 403,
      code: "email-unverified",
    });

    verifyIdToken.mockResolvedValueOnce({
      uid: "admin-uid",
      aud: "existing-project",
      iss: "https://securetoken.google.com/existing-project",
      email_verified: false,
      role: "admin",
    });
    expect(await authenticate(request("admin-token"), env)).toBe("admin-uid");
  });
  it.each(["auth/id-token-expired", "auth/invalid-id-token", "auth/argument-error", "auth/id-token-revoked", "auth/user-disabled"])("rejects %s", async code => {
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
  it("extracts identity metadata without rejecting unverified student tokens", async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: "pending-student",
      aud: "existing-project",
      iss: "https://securetoken.google.com/existing-project",
      email_verified: false,
    });
    await expect(authenticateIdentity(request("pending-token"), env)).resolves.toEqual({
      uid: "pending-student",
      emailVerified: false,
      isAdminClaim: false,
      isOperator: false,
    });
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
