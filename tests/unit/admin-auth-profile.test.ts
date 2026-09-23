import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-user", getIdTokenResult: vi.fn() },
  getDoc: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: mocks.user }, db: {}, isFirebaseConfigured: true,
}));
vi.mock("@/lib/secure-api", () => ({ bootstrapProfile: vi.fn() }));
vi.mock("firebase/firestore", async (original) => ({
  ...await original<typeof import("firebase/firestore")>(),
  doc: vi.fn(), getDoc: mocks.getDoc,
}));

import { useAuthStore } from "@/stores/auth-store";

describe("administrator profile loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ firebaseUser: mocks.user as never, userProfile: null, error: null });
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: "admin", status: "active" }) });
    mocks.user.getIdTokenResult.mockResolvedValue({ claims: { role: "admin" } });
  });

  it("refreshes administrator claims before exposing the profile to routes", async () => {
    const profile = await useAuthStore.getState().reloadProfile();
    expect(mocks.user.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(profile.role).toBe("admin");
    expect(useAuthStore.getState().userProfile?.role).toBe("admin");
  });

  it("blocks a legacy teacher profile with an actionable migration error", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: "teacher" }) });
    await expect(useAuthStore.getState().reloadProfile()).rejects.toThrow("needs to be migrated");
    expect(useAuthStore.getState().userProfile).toBeNull();
  });

  it("blocks an admin profile without the required token claim", async () => {
    mocks.user.getIdTokenResult.mockResolvedValue({ claims: {} });
    await expect(useAuthStore.getState().reloadProfile()).rejects.toThrow("sign-in claim is missing");
    expect(useAuthStore.getState().userProfile).toBeNull();
  });

  it("does not refresh administrator claims for student profiles", async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: "student", status: "active" }) });
    expect((await useAuthStore.getState().reloadProfile()).role).toBe("student");
    expect(mocks.user.getIdTokenResult).not.toHaveBeenCalled();
  });
});
