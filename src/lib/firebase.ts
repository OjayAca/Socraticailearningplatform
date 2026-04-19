/**
 * Firebase application initialization and service exports.
 *
 * Reads configuration from environment variables (prefixed with VITE_)
 * and initializes the Firebase app, Auth, and Firestore instances.
 *
 * @module lib/firebase
 */

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** The initialized Firebase app instance. */
export const firebaseApp = initializeApp(firebaseConfig);

/** Firebase Authentication service instance. */
export const auth = getAuth(firebaseApp);

/** Cloud Firestore database instance. */
export const db = getFirestore(firebaseApp);

/**
 * Connect to local Firebase Emulators for development.
 * Call this in main.tsx when running locally with `firebase emulators:start`.
 * Uncomment the lines below and call this function if you want to use emulators.
 */
export function connectToEmulators(): void {
  if (import.meta.env.DEV) {
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    console.info("[Firebase] Connected to local emulators");
  }
}
