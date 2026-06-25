/**
 * Authentication state management via Zustand.
 *
 * Manages the current user profile, authentication loading state,
 * and provides actions for sign-in, sign-up, sign-out, and role selection.
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
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, firebaseSetupMessage, isFirebaseConfigured } from "@/lib/firebase";
import type { UserProfile, UserRole } from "@/types";

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
  /** Signs in with email and password. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates a new account with email and password. */
  signUp: (name: string, email: string, password: string) => Promise<void>;
  /** Signs in with Google OAuth popup. */
  signInWithGoogle: () => Promise<void>;
  /** Signs out the current user. */
  signOut: () => Promise<void>;
  /** Sets the user's role and writes it to Firestore. */
  setRole: (role: UserRole) => Promise<void>;
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
      if (user) {
        try {
          const profile = await fetchOrCreateProfile(user);
          set({ firebaseUser: user, userProfile: profile, isLoading: false });
        } catch (err) {
          console.error("Error fetching/creating profile:", err);
          set({
            firebaseUser: user,
            userProfile: null,
            isLoading: false,
            error: "Failed to connect to database. Please check Firestore Database rules.",
          });
        }
      } else {
        set({ firebaseUser: null, userProfile: null, isLoading: false });
      }
    });
    return unsubscribe;
  },

  signIn: async (email: string, password: string) => {
    set({ error: null, isLoading: true });
    try {
      await signInWithEmailAndPassword(requireAuth(), email, password);
    } catch (err) {
      set({ error: getFirebaseErrorMessage(err), isLoading: false });
      throw err;
    }
  },

  signUp: async (name: string, email: string, password: string) => {
    set({ error: null, isLoading: true });
    try {
      const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
      await updateProfile(credential.user, { displayName: name });
      await createUserProfile(credential.user, name);
    } catch (err) {
      set({ error: getFirebaseErrorMessage(err), isLoading: false });
      throw err;
    }
  },

  signInWithGoogle: async () => {
    set({ error: null, isLoading: true });
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(requireAuth(), provider);
    } catch (err) {
      set({ error: getFirebaseErrorMessage(err), isLoading: false });
      throw err;
    }
  },

  signOut: async () => {
    set({ error: null });
    try {
      await firebaseSignOut(requireAuth());
    } catch (err) {
      set({ error: getFirebaseErrorMessage(err) });
      throw err;
    }
  },

  setRole: async (role: UserRole) => {
    const { firebaseUser } = get();
    if (!firebaseUser) {
      set({ error: "No user signed in." });
      return;
    }
    try {
      const userRef = doc(requireDb(), "users", firebaseUser.uid);
      await setDoc(userRef, { role }, { merge: true });
      set((state) => ({
        userProfile: state.userProfile
          ? { ...state.userProfile, role }
          : null,
      }));
    } catch (err) {
      set({ error: getFirebaseErrorMessage(err) });
      throw err;
    }
  },

  updateDisplayName: async (displayName: string) => {
    const { firebaseUser } = get();
    if (!firebaseUser) {
      set({ error: "No user signed in." });
      return;
    }
    
    set({ isLoading: true, error: null });
    try {
      // 1. Update Firebase Auth Profile
      await updateProfile(firebaseUser, { displayName });
      
      // 2. Update Firestore Document
      const userRef = doc(requireDb(), "users", firebaseUser.uid);
      await setDoc(userRef, { displayName }, { merge: true });
      
      // 3. Update Local Store State
      set((state) => ({
        firebaseUser: { ...firebaseUser, displayName } as User,
        userProfile: state.userProfile
          ? { ...state.userProfile, displayName }
          : null,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: getFirebaseErrorMessage(err), isLoading: false });
      throw err;
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
    return { uid: user.uid, ...snapshot.data() } as UserProfile;
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
  const profile: Omit<UserProfile, "uid"> = {
    displayName,
    email: user.email || "",
    role: null,
    createdAt: serverTimestamp() as any,
    stats: {
      sessionsCompleted: 0,
      averageCTScore: 0,
      currentStreak: 0,
      lastSessionDate: null,
    },
  };

  const userRef = doc(requireDb(), "users", user.uid);
  await setDoc(userRef, profile);
  return { uid: user.uid, ...profile };
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
      default:
        return `Authentication error: ${code}`;
    }
  }
  return "An unexpected error occurred. Please try again.";
}
