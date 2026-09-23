/**
 * Firebase application initialization and service exports.
 *
 * Reads configuration from environment variables (public NEXT_PUBLIC_ values; existing VITE_ values are mapped by Next.js)
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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
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
) && !firebaseConfig.projectId?.startsWith("demo-");

export const firebaseSetupMessage =
  "Firebase is not configured yet. Add your public Firebase values to a .env file to enable sign-in and database features.";

/** The initialized Firebase app instance. */
const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;

/** Firebase Authentication service instance. */
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

/** Cloud Firestore database instance. */
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null;

const appCheckSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY as
  | string
  | undefined;

if (firebaseApp && appCheckSiteKey && !isPlaceholderValue(appCheckSiteKey)) {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
