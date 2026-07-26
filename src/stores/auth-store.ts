/**
 * Authentication state management via Zustand.
 *
 * Manages the current user profile, authentication loading state,
 * and provides actions for sign-in, sign-up, sign-out, and profile updates.
 *
 * @module stores/auth-store
 */

import { create } from "zustand";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, firebaseSetupMessage, isFirebaseConfigured } from "@/lib/firebase";
import { bootstrapProfile } from "@/lib/secure-api";
import type { UserProfile, UserStats } from "@/types";

type CanonicalUserRole = "student" | "admin";

class ProfileLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileLoadError";
  }
}

const profileLoads = new Map<string, Promise<UserProfile>>();
let authStateSequence = 0;

// ─── Store Shape ─────────────────────────────────────────────

interface AuthState {
  /** The Firebase Auth user object (null when signed out). */
  firebaseUser: User | null;
  /** The Firestore user profile (null until loaded). */
  userProfile: UserProfile | null;
  /** True while the initial auth state is being resolved. */
  isLoading: boolean;
  /** Error message from the most recent auth operation. */
  error: string | null;

  // ── Actions ──────────────────────────────────────────────
  /** Initializes the auth listener. Call once in App.tsx. */
  initialize: () => () => void;
  /** Reloads the signed-in user's Firestore profile after a recoverable failure. */
  reloadProfile: () => Promise<UserProfile>;
  /** Signs in with email and password. */
  signIn: (email: string, password: string) => Promise<UserProfile>;
  /** Creates a new account with email and password. */
  signUp: (name: string, email: string, password: string) => Promise<UserProfile>;
  /** Signs in with Google OAuth popup. */
  signInWithGoogle: () => Promise<UserProfile>;
  /** Sends a password reset email without revealing whether the account exists. */
  resetPassword: (email: string) => Promise<void>;
  /** Signs out the current user. */
  signOut: () => Promise<void>;
  /** Updates the user's display name. */
  updateDisplayName: (displayName: string) => Promise<void>;
  /** Clears the current error message. */
  clearError: () => void;
}

// ─── Store Implementation ────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  userProfile: null,
  isLoading: true,
  error: null,

  initialize: () => {
    if (!auth || !isFirebaseConfigured) {
      set({
        firebaseUser: null,
        userProfile: null,
        isLoading: false,
        error: firebaseSetupMessage,
      });
      return () => {};
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const sequence = ++authStateSequence;

      if (!user) {
        set({
          firebaseUser: null,
          userProfile: null,
          isLoading: false,
          error: null,
        });
        return;
      }

      // Clear the prior account's profile immediately so an account switch can
      // never briefly inherit its role or preferences.
      set({
        firebaseUser: user,
        userProfile: null,
        isLoading: true,
        error: null,
      });

      try {
        const profile = await loadUserProfile(user);
        if (sequence !== authStateSequence || auth?.currentUser?.uid !== user.uid) {
          return;
        }
        set({ firebaseUser: user, userProfile: profile, isLoading: false, error: null });
      } catch (err) {
        if (sequence !== authStateSequence || auth?.currentUser?.uid !== user.uid) {
          return;
        }
        set({
          firebaseUser: user,
          userProfile: null,
          isLoading: false,
          error: getFirebaseErrorMessage(err),
        });
      }
    });
    return unsubscribe;
  },

  reloadProfile: async () => {
    const user = get().firebaseUser;
    if (!user) {
      const message = "Your session has ended. Sign in again to load your profile.";
      set({ userProfile: null, isLoading: false, error: message });
      throw new Error(message);
    }

    set({ userProfile: null, isLoading: true, error: null });
    try {
      // A rejected load is never cached, so this is a genuine retry.
      const profile = await loadUserProfile(user);
      if (auth?.currentUser?.uid !== user.uid) {
        throw new Error("The signed-in account changed while the profile was loading.");
      }
      set({ firebaseUser: user, userProfile: profile, isLoading: false, error: null });
      return profile;
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({ userProfile: null, isLoading: false, error: message });
      throw new Error(message);
    }
  },

  signIn: async (email: string, password: string) => {
    set({ error: null, isLoading: true });
    try {
      const credential = await signInWithEmailAndPassword(
        requireAuth(),
        email,
        password
      );
      const profile = await loadUserProfile(credential.user);
      set({
        firebaseUser: credential.user,
        userProfile: profile,
        isLoading: false,
        error: null,
      });
      return profile;
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({
        userProfile: null,
        error: message,
        isLoading: false,
      });
      throw new Error(message);
    }
  },

  signUp: async (name: string, email: string, password: string) => {
    set({ error: null, isLoading: true });
    try {
      const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
      await updateProfile(credential.user, { displayName: name });
      // Public account creation always writes a student profile. Administrator
      // promotion is intentionally a Firebase Console operation.
      const profile = await createUserProfile(credential.user, name);
      // Invalidate any auth-listener profile read that began before the signup
      // document was fully written (it may have observed the temporary Auth name).
      ++authStateSequence;
      set({
        firebaseUser: credential.user,
        userProfile: profile,
        isLoading: false,
        error: null,
      });
      return profile;
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({
        userProfile: null,
        error: message,
        isLoading: false,
      });
      throw new Error(message);
    }
  },

  signInWithGoogle: async () => {
    set({ error: null, isLoading: true });
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(requireAuth(), provider);
      const profile = await loadUserProfile(credential.user);
      set({
        firebaseUser: credential.user,
        userProfile: profile,
        isLoading: false,
        error: null,
      });
      return profile;
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({
        userProfile: null,
        error: message,
        isLoading: false,
      });
      throw new Error(message);
    }
  },

  resetPassword: async (email: string) => {
    set({ error: null });
    try {
      await sendPasswordResetEmail(requireAuth(), email);
      set({ error: null });
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    }
  },

  signOut: async () => {
    set({ error: null });
    try {
      await firebaseSignOut(requireAuth());
      ++authStateSequence;
      set({
        firebaseUser: null,
        userProfile: null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    }
  },

  updateDisplayName: async (displayName: string) => {
    const { firebaseUser } = get();
    if (!firebaseUser) {
      const error = new Error("Your session has ended. Sign in again to update your profile.");
      set({ error: error.message, isLoading: false });
      throw error;
    }

    const normalizedName = displayName.trim();
    if (!normalizedName || normalizedName.length > 100) {
      const error = new Error("Display name must be between 1 and 100 characters.");
      set({ error: error.message, isLoading: false });
      throw error;
    }

    set({ error: null });
    try {
      // 1. Update Firebase Auth Profile
      await updateProfile(firebaseUser, { displayName: normalizedName });
      
      // 2. Update Firestore Document
      const userRef = doc(requireDb(), "users", firebaseUser.uid);
      await setDoc(
        userRef,
        { displayName: normalizedName, updatedAt: serverTimestamp() },
        { merge: true }
      );
      
      // 3. Update Local Store State
      set((state) => ({
        firebaseUser: auth?.currentUser ?? firebaseUser,
        userProfile: state.userProfile
          ? { ...state.userProfile, displayName: normalizedName }
          : null,
        error: null,
      }));
    } catch (err) {
      const message = getFirebaseErrorMessage(err);
      set({ error: message });
      throw new Error(message);
    }
  },

  clearError: () => set({ error: null }),
}));

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Fetches the Firestore user profile, creating one if it doesn't exist.
 *
 * @param user - The Firebase Auth user.
 * @returns The user's Firestore profile.
 */
async function fetchOrCreateProfile(user: User): Promise<UserProfile> {
  const userRef = doc(requireDb(), "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    return normalizeUserProfile({
      uid: user.uid,
      ...snapshot.data(),
    });
  }

  return createUserProfile(user, user.displayName || "User");
}

/**
 * Creates a new Firestore user profile document.
 *
 * @param user - The Firebase Auth user.
 * @param displayName - The user's display name.
 * @returns The newly created profile.
 */
async function createUserProfile(
  user: User,
  displayName: string
): Promise<UserProfile> {
  const userRef = doc(requireDb(), "users", user.uid);
  await bootstrapProfile({ displayName });
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    throw new ProfileLoadError(
      "Your secure account profile could not be created. Retry or contact the system administrator."
    );
  }
  return normalizeUserProfile({ uid: user.uid, ...snapshot.data() });
}

function loadUserProfile(user: User): Promise<UserProfile> {
  const existingLoad = profileLoads.get(user.uid);
  if (existingLoad) return existingLoad;

  const load = fetchOrCreateProfile(user).finally(() => {
    if (profileLoads.get(user.uid) === load) {
      profileLoads.delete(user.uid);
    }
  });
  profileLoads.set(user.uid, load);
  return load;
}

function normalizeUserProfile(
  profile: Record<string, unknown> & { uid: string }
): UserProfile {
  const role = normalizeRole(profile.role);
  return {
    ...profile,
    role: role as UserProfile["role"],
    academicProfile: normalizeAcademicProfile(profile.academicProfile),
    academicProfileComplete:
      profile.academicProfileComplete === true && normalizeAcademicProfile(profile.academicProfile) !== null,
    stats: normalizeUserStats(profile.stats as UserStats | undefined),
    preferences: normalizeUserPreferences(profile.preferences),
  } as unknown as UserProfile;
}

function normalizeAcademicProfile(value: unknown): UserProfile["academicProfile"] {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  const fields = ["studentNumber", "course", "yearLevel", "section"] as const;
  if (!fields.every((field) => typeof profile[field] === "string" && String(profile[field]).trim())) {
    return null;
  }
  return {
    studentNumber: String(profile.studentNumber),
    course: String(profile.course),
    yearLevel: String(profile.yearLevel),
    section: String(profile.section),
  };
}

function normalizeRole(role: unknown): CanonicalUserRole {
  if (role === "student") return "student";
  if (role === "admin" || role === "teacher") return "admin";

  throw new ProfileLoadError(
    "Your account profile does not have a valid role. Ask the system administrator to set it to student or admin in Firestore."
  );
}

/** Returns true for the canonical administrator role and the schema-v2 role value. */
export function isAdminRole(role: unknown): boolean {
  return role === "admin" || role === "teacher";
}

/** Resolves the authenticated landing page without assuming a missing role. */
export function getDashboardPath(role: unknown): string {
  if (isAdminRole(role)) return "/admin/dashboard";
  if (role === "student") return "/student/dashboard";
  return "/login";
}

function normalizeUserStats(stats: UserStats | undefined): UserStats {
  return {
    sessionsCompleted: stats?.sessionsCompleted ?? 0,
    averageCTScore: stats?.averageCTScore ?? 0,
    currentStreak: stats?.currentStreak ?? 0,
    lastSessionDate: stats?.lastSessionDate ?? null,
    topicPerformance: stats?.topicPerformance ?? [],
  };
}

function normalizeUserPreferences(preferences: unknown): UserProfile["preferences"] {
  const stored = preferences as
    | { liveAlertPopups?: unknown; liveAlertsEnabled?: unknown }
    | undefined;
  const value = stored?.liveAlertPopups ?? stored?.liveAlertsEnabled;
  return {
    liveAlertPopups: typeof value === "boolean" ? value : true,
  };
}

function requireAuth() {
  if (!auth) {
    throw new Error(firebaseSetupMessage);
  }
  return auth;
}

function requireDb() {
  if (!db) {
    throw new Error(firebaseSetupMessage);
  }
  return db;
}

/**
 * Maps Firebase error codes to user-friendly messages.
 *
 * @param error - The caught error from a Firebase operation.
 * @returns A human-readable error string.
 */
function getFirebaseErrorMessage(error: unknown): string {
  if (error instanceof ProfileLoadError) {
    return error.message;
  }

  if (error instanceof Error && error.message === firebaseSetupMessage) {
    return firebaseSetupMessage;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: string }).code;
    switch (code) {
      case "auth/email-already-in-use":
        return "This email is already registered. Try logging in instead.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password. Please try again.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed. Please try again.";
      case "auth/unauthorized-domain":
        return getUnauthorizedDomainMessage();
      case "permission-denied":
      case "firestore/permission-denied":
        return "Your account was authenticated, but its profile could not be read. Verify the Firestore rules or ask the system administrator to check your user record.";
      case "unavailable":
      case "firestore/unavailable":
        return "MINDGUIDE could not reach Firestore. Check your internet connection and try loading your profile again.";
      case "auth/network-request-failed":
        return "MINDGUIDE could not reach Firebase Authentication. Check your internet connection and try again.";
      default:
        return `Firebase could not complete this request (${code}). Try again, then check the Firebase project configuration if it continues.`;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "An unexpected authentication error occurred. Please try again.";
}

function getUnauthorizedDomainMessage(): string {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "this domain";

  if (hostname === "127.0.0.1") {
    return "Google sign-in is blocked on 127.0.0.1. Open http://localhost:5173 instead.";
  }

  return `Google sign-in is not authorized for ${hostname}. Add this domain in Firebase Console > Authentication > Settings > Authorized domains.`;
}
