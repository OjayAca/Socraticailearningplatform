// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "../../server/platform";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  authenticateIdentity: vi.fn(),
  verifyToken: vi.fn(),
  appCheckEnforced: "false",
  syncSingle: vi.fn(),
  syncAll: vi.fn(),
  getAdminAuth: vi.fn(),
  getAdminFirestore: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIME"),
}));

vi.mock("../../server/auth", () => ({
  authenticate: mocks.authenticate,
  authenticateIdentity: mocks.authenticateIdentity,
}));
vi.mock("../../server/config", () => ({
  getServerEnv: () => ({
    FIREBASE_PROJECT_ID: "existing-project",
    APP_CHECK_ENFORCED: mocks.appCheckEnforced,
  }),
}));
vi.mock("../../server/firebase", () => ({
  getAdminAppCheck: () => ({ verifyToken: mocks.verifyToken }),
  getAdminAuth: mocks.getAdminAuth,
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: mocks.serverTimestamp },
}));

import {
  syncAllUsersEmailVerification,
  syncSingleUserEmailVerification,
} from "../../server/email-verification-sync";

function makeFakeFirestore(options: {
  actorDoc?: { exists: boolean; data?: Record<string, unknown> };
  userDocs?: Array<{ id: string; data: Record<string, unknown> }>;
  singleDoc?: { exists: boolean; data?: Record<string, unknown> };
}) {
  const updatedRecords: Array<{ id: string; data: Record<string, unknown> }> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const batchCommits: number[] = [];

  const createSnapshot = (id: string, data: Record<string, unknown> | undefined, exists: boolean) => ({
    id,
    exists,
    data: () => data,
    get: (field: string) => (data ? data[field] : undefined),
    ref: {
      id,
      update: vi.fn(async (payload: Record<string, unknown>) => {
        updatedRecords.push({ id, data: payload });
      }),
    },
  });

  const firestore = {
    doc: vi.fn((path: string) => {
      const uid = path.split("/").at(-1) ?? "";
      return {
        get: vi.fn(async () => {
          if (options.singleDoc && uid === "target-user") {
            return createSnapshot(uid, options.singleDoc.data, options.singleDoc.exists);
          }
          if (options.actorDoc) {
            return createSnapshot(uid, options.actorDoc.data, options.actorDoc.exists);
          }
          return createSnapshot(uid, undefined, false);
        }),
        update: vi.fn(async (payload: Record<string, unknown>) => {
          updatedRecords.push({ id: uid, data: payload });
        }),
      };
    }),
    collection: vi.fn((name: string) => {
      if (name === "users") {
        const docs = (options.userDocs ?? []).map((entry) =>
          createSnapshot(entry.id, entry.data, true),
        );
        return { get: vi.fn(async () => ({ docs })) };
      }
      if (name === "audit_logs") {
        return {
          doc: vi.fn(() => ({
            set: vi.fn(async (payload: Record<string, unknown>) => {
              auditLogs.push(payload);
            }),
          })),
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
    batch: vi.fn(() => {
      const pending: Array<{ id: string; data: Record<string, unknown> }> = [];
      return {
        update: vi.fn((ref: { id: string }, data: Record<string, unknown>) => {
          pending.push({ id: ref.id, data });
        }),
        commit: vi.fn(async () => {
          batchCommits.push(pending.length);
          updatedRecords.push(...pending);
        }),
      };
    }),
  };

  return { firestore: firestore as never, updatedRecords, auditLogs, batchCommits };
}

describe("email verification sync service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appCheckEnforced = "false";
    mocks.verifyToken.mockResolvedValue({ appId: "app-1" });
  });

  it("skips writes when user doc is missing or already synced, and updates when missing/changed", async () => {
    const missing = makeFakeFirestore({ singleDoc: { exists: false } });
    await expect(
      syncSingleUserEmailVerification("target-user", true, missing.firestore),
    ).resolves.toEqual({ synced: false, emailVerified: true });
    expect(missing.updatedRecords).toHaveLength(0);

    const same = makeFakeFirestore({
      singleDoc: { exists: true, data: { emailVerified: true } },
    });
    await expect(
      syncSingleUserEmailVerification("target-user", true, same.firestore),
    ).resolves.toEqual({ synced: false, emailVerified: true });
    expect(same.updatedRecords).toHaveLength(0);

    const unsynced = makeFakeFirestore({
      singleDoc: { exists: true, data: { role: "student" } },
    });
    await expect(
      syncSingleUserEmailVerification("target-user", true, unsynced.firestore),
    ).resolves.toEqual({ synced: true, emailVerified: true });
    expect(unsynced.updatedRecords).toEqual([
      { id: "target-user", data: { emailVerified: true, updatedAt: "SERVER_TIME" } },
    ]);
  });

  it("rejects non-admin or inactive callers from bulk sync", async () => {
    const studentActor = makeFakeFirestore({
      actorDoc: { exists: true, data: { role: "student", status: "active" } },
    });
    await expect(
      syncAllUsersEmailVerification("student-1", {
        firestore: studentActor.firestore,
        auth: { getUsers: vi.fn() } as never,
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });

    const suspendedAdmin = makeFakeFirestore({
      actorDoc: { exists: true, data: { role: "admin", status: "suspended" } },
    });
    await expect(
      syncAllUsersEmailVerification("admin-1", {
        firestore: suspendedAdmin.firestore,
        auth: { getUsers: vi.fn() } as never,
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("chunks >100 UIDs across Firebase Auth getUsers calls, skips unchanged docs, and records an audit log", async () => {
    const userDocs = Array.from({ length: 105 }, (_, index) => ({
      id: `user-${index}`,
      data: index === 0 ? { emailVerified: true } : { role: "student" },
    }));
    const fake = makeFakeFirestore({
      actorDoc: { exists: true, data: { role: "admin", status: "active" } },
      userDocs,
    });

    const getUsers = vi.fn(async (identifiers: Array<{ uid: string }>) => ({
      users: identifiers
        .filter((item) => item.uid !== "user-104")
        .map((item) => ({
          uid: item.uid,
          emailVerified: item.uid !== "user-1",
        })),
      notFound: identifiers.filter((item) => item.uid === "user-104"),
    }));

    const result = await syncAllUsersEmailVerification("admin-1", {
      firestore: fake.firestore,
      auth: { getUsers } as never,
    });

    expect(getUsers).toHaveBeenCalledTimes(2);
    expect(getUsers.mock.calls[0][0]).toHaveLength(100);
    expect(getUsers.mock.calls[1][0]).toHaveLength(5);
    expect(result.checked).toBe(105);
    expect(result.alreadySynced).toBe(1);
    expect(result.updated).toBe(103);
    expect(result.verified).toBe(103);
    expect(result.unverified).toBe(1);
    expect(result.missingInAuth).toBe(1);
    expect(result.statuses["user-1"]).toBe(false);
    expect(result.statuses["user-2"]).toBe(true);
    expect(fake.auditLogs).toHaveLength(1);
    expect(fake.auditLogs[0]).toMatchObject({
      actorId: "admin-1",
      action: "adminSyncEmailVerification",
      target: "users",
    });
  });

  it("maps Firebase Auth IAM permission failures to an actionable 503 error", async () => {
    const fake = makeFakeFirestore({
      actorDoc: { exists: true, data: { role: "admin", status: "active" } },
      userDocs: [{ id: "user-1", data: { role: "student" } }],
    });
    const getUsers = vi.fn().mockRejectedValue({
      code: "auth/insufficient-permission",
      message: "Missing firebaseauth.users.get",
    });

    await expect(
      syncAllUsersEmailVerification("admin-1", {
        firestore: fake.firestore,
        auth: { getUsers } as never,
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "auth-admin-permission-required",
    });
  });
});

describe("verification sync API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appCheckEnforced = "false";
    mocks.verifyToken.mockResolvedValue({ appId: "app-1" });
  });

  it("POST /api/auth/sync-verification syncs from verified identity without requiring verified email", async () => {
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      get: () => undefined,
    });
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    mocks.getAdminFirestore.mockReturnValue({
      doc: () => ({ get: mockGet, update: mockUpdate }),
    });
    mocks.authenticateIdentity.mockResolvedValue({
      uid: "student-1",
      emailVerified: false,
      isAdminClaim: false,
      isOperator: false,
    });

    const { POST } = await import("../../app/api/auth/sync-verification/route");
    const response = await POST(
      new Request("http://localhost/api/auth/sync-verification", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ synced: true, emailVerified: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("POST /api/auth/sync-verification enforces App Check when APP_CHECK_ENFORCED is true", async () => {
    mocks.appCheckEnforced = "true";
    mocks.authenticateIdentity.mockResolvedValue({
      uid: "student-1",
      emailVerified: true,
      isAdminClaim: false,
      isOperator: false,
    });

    const { POST } = await import("../../app/api/auth/sync-verification/route");
    const response = await POST(
      new Request("http://localhost/api/auth/sync-verification", { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });

  it("POST /api/admin/sync-verification enforces admin auth and hides unexpected internal errors", async () => {
    mocks.authenticate.mockRejectedValueOnce(
      new ServiceError(403, "email-unverified", "Verify your email address before continuing."),
    );
    const { POST } = await import("../../app/api/admin/sync-verification/route");

    const forbidden = await POST(
      new Request("http://localhost/api/admin/sync-verification", { method: "POST" }),
    );
    expect(forbidden.status).toBe(403);

    mocks.authenticate.mockResolvedValueOnce("admin-1");
    mocks.getAdminFirestore.mockImplementationOnce(() => {
      throw new Error("internal secret stack");
    });
    const failed = await POST(
      new Request("http://localhost/api/admin/sync-verification", { method: "POST" }),
    );
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("internal secret");
  });
});
