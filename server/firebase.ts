import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getServerEnv } from "./config";
import { ensure } from "./platform";

export function getAdminApp() {
  const env = getServerEnv();
  const name = `mindguide-${env.FIREBASE_PROJECT_ID}`;
  const existing = getApps().find(app => app.name === name);
  if (existing) return existing;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  ensure(clientEmail && privateKey, "Firebase server credentials are not configured.", 503);
  return initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    credential: cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail, privateKey }),
  }, name);
}

export const getAdminAuth = () => getAuth(getAdminApp());
export const getAdminFirestore = () => getFirestore(getAdminApp());

/**
 * Returns the Firebase Admin App Check instance bound to the configured project app.
 *
 * @returns The Firebase Admin AppCheck service instance.
 */
export const getAdminAppCheck = () => getAppCheck(getAdminApp());
