import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-user", emailVerified: false, getIdTokenResult: vi.fn() },
  getDoc: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  setPersistence: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  sendEmailVerification: vi.fn(),
  reload: vi.fn(),
  getIdToken: vi.fn(),
  signOut: vi.fn(),
  authStateCallback: null as null | ((user: unknown) => Promise<void> | void),
  onAuthStateChanged: vi.fn(),
  syncOwnEmailVerification: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({
  auth: { currentUser: mocks.user }, db: {}, isFirebaseConfigured: true,
}));
vi.mock("@/lib/secure-api", () => ({
  bootstrapProfile: vi.fn(),
  syncOwnEmailVerification: mocks.syncOwnEmailVerification,
}));
vi.mock("firebase/auth", async (original) => ({
  ...await original<typeof import("firebase/auth")>(),
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  setPersistence: mocks.setPersistence,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  updateProfile: mocks.updateProfile,
  sendEmailVerification: mocks.sendEmailVerification,
  reload: mocks.reload,
  getIdToken: mocks.getIdToken,
  signOut: mocks.signOut,
  onAuthStateChanged: mocks.onAuthStateChanged,
}));
vi.mock("firebase/firestore", async (original) => ({
  ...await original<typeof import("firebase/firestore")>(),
  doc: vi.fn(), getDoc: mocks.getDoc,
}));

import { useAuthStore } from "@/stores/auth-store";

describe("administrator profile loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncOwnEmailVerification.mockResolvedValue({ synced: true, emailVerified: false });
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

  it("forces reload followed by fresh ID token retrieval on email verification refresh and cleans OAuth storage on signOut", async () => {
    const callOrder: string[] = [];
    mocks.user.emailVerified = false;
    mocks.reload.mockImplementation(async (target: { emailVerified: boolean }) => {
      callOrder.push("reload");
      target.emailVerified = true;
    });
    mocks.getIdToken.mockImplementation(async (_target: unknown, forceRefresh: boolean) => {
      callOrder.push(`getIdToken:${String(forceRefresh)}`);
      return "refreshed-jwt";
    });

    useAuthStore.setState({
      firebaseUser: mocks.user as never,
      userProfile: { uid: "admin-user", role: "student", emailVerified: false } as never,
    });
    const verified = await useAuthStore.getState().refreshVerification();
    expect(verified).toBe(true);
    expect(callOrder).toEqual(["reload", "getIdToken:true"]);
    expect(mocks.syncOwnEmailVerification).toHaveBeenCalledWith(false);
    expect(useAuthStore.getState().userProfile?.emailVerified).toBe(true);

    const storeData = new Map<string, string>([
      ["mindguide.google.state", "state-1"],
      ["mindguide.google.result", "jwt-1"],
      ["mindguide.pending.req", "{}"],
    ]);
    vi.stubGlobal("sessionStorage", {
      get length() {
        return storeData.size;
      },
      key(index: number) {
        return Array.from(storeData.keys())[index] ?? null;
      },
      removeItem(key: string) {
        storeData.delete(key);
      },
    });
    mocks.signOut.mockResolvedValue(undefined);
    try {
      await useAuthStore.getState().signOut();
      expect(storeData.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("prevents onAuthStateChanged from racing profile creation during active signUp", async () => {
    const newStudentUser = { uid: "race-student", email: "race@example.com", emailVerified: false };
    mocks.onAuthStateChanged.mockImplementation((_auth, cb) => {
      mocks.authStateCallback = cb;
      return () => {};
    });
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: newStudentUser });
    mocks.sendEmailVerification.mockResolvedValue(undefined);
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ displayName: "Race Student", email: "race@example.com", role: "student", status: "active" }),
    });

    let listenerReadsDuringSignUp = 0;
    mocks.updateProfile.mockImplementation(async () => {
      const readsBefore = mocks.getDoc.mock.calls.length;
      await mocks.authStateCallback?.(newStudentUser);
      listenerReadsDuringSignUp = mocks.getDoc.mock.calls.length - readsBefore;
    });

    const unsubscribe = useAuthStore.getState().initialize();
    try {
      const profile = await useAuthStore.getState().signUp("Race Student", "race@example.com", "secret123");
      expect(listenerReadsDuringSignUp).toBe(0);
      expect(profile.displayName).toBe("Race Student");
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().userProfile?.uid).toBe("race-student");
    } finally {
      unsubscribe();
      mocks.authStateCallback = null;
    }
  });

  it("syncs emailVerified automatically when stored user doc is missing emailVerified", async () => {
    mocks.user.emailVerified = true;
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ role: "student", status: "active" }),
    });
    await useAuthStore.getState().reloadProfile();
    expect(mocks.syncOwnEmailVerification).toHaveBeenCalledWith(false);
  });
});
