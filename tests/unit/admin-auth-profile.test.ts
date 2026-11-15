import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-user", getIdTokenResult: vi.fn() },
  getDoc: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  setPersistence: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  sendEmailVerification: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: mocks.user }, db: {}, isFirebaseConfigured: true,
}));
vi.mock("@/lib/secure-api", () => ({ bootstrapProfile: vi.fn() }));
vi.mock("firebase/auth", async (original) => ({
  ...await original<typeof import("firebase/auth")>(),
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  setPersistence: mocks.setPersistence,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  updateProfile: mocks.updateProfile,
  sendEmailVerification: mocks.sendEmailVerification,
}));
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

  it("sends a verification email automatically on email/password sign-up", async () => {
    const newStudentUser = { uid: "new-student", email: "new@example.com", emailVerified: false };
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: newStudentUser });
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.sendEmailVerification.mockResolvedValue(undefined);
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: "New Student", email: "new@example.com", role: "student", status: "active" }),
    });

    const profile = await useAuthStore.getState().signUp("New Student", "new@example.com", "secret123");
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(newStudentUser);
    expect(profile.emailVerified).toBe(false);
  });

  it("configures Firebase session or local persistence based on rememberMe during signIn", async () => {
    const studentUser = { uid: "student-1", email: "student@example.com", emailVerified: true };
    mocks.setPersistence.mockResolvedValue(undefined);
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: studentUser });
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: "Student", email: "student@example.com", role: "student", status: "active" }),
    });

    const { browserLocalPersistence, browserSessionPersistence } = await import("firebase/auth");

    await useAuthStore.getState().signIn("student@example.com", "secret123", false);
    expect(mocks.setPersistence).toHaveBeenLastCalledWith(expect.anything(), browserSessionPersistence);

    await useAuthStore.getState().signIn("student@example.com", "secret123", true);
    expect(mocks.setPersistence).toHaveBeenLastCalledWith(expect.anything(), browserLocalPersistence);
  });
});
