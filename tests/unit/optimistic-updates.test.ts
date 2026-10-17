import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { uid: "student-1" }, updateDoc: vi.fn(), setDoc: vi.fn(), updateProfile: vi.fn(), onSnapshot: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: { currentUser: mocks.user }, db: {}, isFirebaseConfigured: true, firebaseSetupMessage: "Firebase is not configured" }));
vi.mock("@/lib/secure-api", () => ({ bootstrapProfile: vi.fn() }));
vi.mock("firebase/auth", async original => ({
  ...await original<typeof import("firebase/auth")>(), updateProfile: mocks.updateProfile,
}));
vi.mock("firebase/firestore", async original => ({
  ...await original<typeof import("firebase/firestore")>(),
  doc: vi.fn(), collection: vi.fn(), query: vi.fn(), onSnapshot: mocks.onSnapshot,
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ preferences: { liveAlertPopups: true } }) })),
  updateDoc: mocks.updateDoc, setDoc: mocks.setDoc,
}));

import { useNotificationStore as notifications } from "@/stores/notification-store";
import { useAuthStore as auth } from "@/stores/auth-store";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  notifications.getState().stopListening();
  vi.resetAllMocks();
  mocks.updateProfile.mockResolvedValue(undefined);
  notifications.setState({ listenerUserId: "student-1", liveAlertPopups: true, notifications: [
    { id: "a", read: false }, { id: "b", read: false },
  ] as never, unreadCount: 2 });
  auth.setState({ firebaseUser: mocks.user as never, userProfile: { uid: "student-1", displayName: "Old name", role: "student" } as never, isNameSaving: false, error: null });
});

describe("optimistic updates", () => {
  it("marks read instantly, deduplicates clicks and rolls back a failed write", async () => {
    const write = deferred();
    mocks.updateDoc.mockReturnValue(write.promise);
    const request = notifications.getState().markAsRead("a");
    expect(notifications.getState().unreadCount).toBe(1);
    expect(notifications.getState().markAsRead("a")).toBe(request);
    const rejected = expect(request).rejects.toThrow("could not");
    write.reject(new Error("offline"));
    await rejected;
    expect(mocks.updateDoc).toHaveBeenCalledOnce();
    expect(notifications.getState().unreadCount).toBe(2);
    expect(notifications.getState().error).toContain("could not");
  });

  it("rolls back only failed notifications when mark-all partially succeeds", async () => {
    const first = deferred();
    const second = deferred();
    mocks.updateDoc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const request = notifications.getState().markAllAsRead();
    expect(notifications.getState().unreadCount).toBe(0);
    const rejected = expect(request).rejects.toThrow("could not");
    first.resolve();
    second.reject(new Error("offline"));
    await rejected;
    expect(notifications.getState().notifications.map(item => item.read)).toEqual([true, false]);
    expect(notifications.getState().unreadCount).toBe(1);
  });

  it("keeps pending read states across snapshots and ignores old-account failures", async () => {
    let publish!: (snapshot: unknown) => void;
    mocks.onSnapshot.mockImplementation((_query, next) => { publish = next; return () => {}; });
    notifications.getState().listenToNotifications("student-1");
    const snapshot = { docs: [{ id: "a", data: () => ({ read: false, recipientId: "student-1" }) }], docChanges: () => [] };
    publish(snapshot);
    const write = deferred();
    mocks.updateDoc.mockReturnValue(write.promise);
    const request = notifications.getState().markAsRead("a");
    await Promise.resolve();
    publish(snapshot);
    expect(notifications.getState().unreadCount).toBe(0);
    notifications.getState().stopListening();
    const rejected = expect(request).rejects.toThrow("could not");
    write.reject(new Error("offline"));
    await rejected;
    expect(notifications.getState().notifications).toEqual([]);
    expect(notifications.getState().error).toBeNull();
  });

  it("toggles preferences instantly and rolls back a rejected save", async () => {
    const write = deferred();
    mocks.updateDoc.mockReturnValue(write.promise);
    const request = notifications.getState().setLiveAlertPopups("student-1", false);
    expect(notifications.getState().liveAlertPopups).toBe(false);
    const rejected = expect(request).rejects.toThrow("could not");
    write.reject(new Error("offline"));
    await rejected;
    expect(notifications.getState().liveAlertPopups).toBe(true);
    expect(notifications.getState().isPreferenceSaving).toBe(false);
  });

  it("does not roll an old preference into another account", async () => {
    const write = deferred();
    mocks.updateDoc.mockReturnValue(write.promise);
    const request = notifications.getState().setLiveAlertPopups("student-1", false);
    notifications.getState().stopListening();
    notifications.setState({ listenerUserId: "student-2", liveAlertPopups: false });
    const rejected = expect(request).rejects.toThrow("could not");
    write.reject(new Error("offline"));
    await rejected;
    expect(notifications.getState().liveAlertPopups).toBe(false);
    expect(notifications.getState().preferenceError).toBeNull();
  });

  it("shows the new profile name before persistence and restores it on failure", async () => {
    const write = deferred();
    mocks.setDoc.mockReturnValue(write.promise);
    const request = auth.getState().updateDisplayName("New name");
    expect(auth.getState().userProfile?.displayName).toBe("New name");
    expect(auth.getState().isNameSaving).toBe(true);
    await expect(auth.getState().updateDisplayName("Duplicate")).rejects.toThrow("already being saved");
    const rejected = expect(request).rejects.toThrow("offline");
    write.reject(new Error("offline"));
    await rejected;
    expect(auth.getState().userProfile?.displayName).toBe("Old name");
    expect(auth.getState().isNameSaving).toBe(false);
  });

  it("does not restore a previous name into a different account", async () => {
    const write = deferred();
    mocks.setDoc.mockReturnValue(write.promise);
    const request = auth.getState().updateDisplayName("New name");
    await Promise.resolve();
    auth.setState({ firebaseUser: { uid: "student-2" } as never, userProfile: { uid: "student-2", displayName: "Other name" } as never, isNameSaving: false });
    const rejected = expect(request).rejects.toThrow("offline");
    write.reject(new Error("offline"));
    await rejected;
    expect(auth.getState().userProfile?.displayName).toBe("Other name");
    expect(auth.getState().error).toBeNull();
  });

  it("keeps the optimistic name after a successful save", async () => {
    const write = deferred();
    mocks.setDoc.mockReturnValue(write.promise);
    const request = auth.getState().updateDisplayName("New name");
    expect(auth.getState().userProfile?.displayName).toBe("New name");
    write.resolve();
    await request;
    expect(auth.getState().userProfile?.displayName).toBe("New name");
    expect(auth.getState().isNameSaving).toBe(false);
  });
});
