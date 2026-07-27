/**
 * Firebase application initialization and service exports.
 *
 * Reads configuration from environment variables (prefixed with VITE_)
 * and initializes the Firebase app, Auth, and Firestore instances.
 *
 * @module lib/firebase
 */

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "appId",
] as const;

const isPlaceholderValue = (value: unknown): boolean =>
  typeof value !== "string" ||
  value.trim() === "" ||
  value.startsWith("your_");

export const isFirebaseConfigured = requiredConfigKeys.every(
  (key) => !isPlaceholderValue(firebaseConfig[key])
);

export const firebaseSetupMessage =
  "Firebase is not configured yet. Add your VITE_FIREBASE_* values to a .env file to enable sign-in and database features.";

/** The initialized Firebase app instance. */
const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;

/** Firebase Authentication service instance. */
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

/** Cloud Firestore database instance. */
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;

/** Callable Functions client used for all authoritative mutations. */
export const functions: Functions | null = firebaseApp
  ? getFunctions(firebaseApp, import.meta.env.VITE_FUNCTIONS_REGION || "asia-southeast1")
  : null;

const useFunctionsEmulator =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true";

if (useFunctionsEmulator && functions) {
  connectFunctionsEmulator(functions, "localhost", 5001);
  console.info("[Firebase] Callable Functions connected to the local emulator");
}

const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as
  | string
  | undefined;

if (import.meta.env.DEV && typeof self !== "undefined") {
  (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (firebaseApp && appCheckSiteKey && !isPlaceholderValue(appCheckSiteKey)) {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
