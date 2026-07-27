import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";

if (getApps().length === 0) initializeApp();

export const database = getFirestore();
export const adminAuth = getAuth();
export { FieldValue, Timestamp };

export const REGION = process.env.FUNCTIONS_REGION || "asia-southeast1";
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";
export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FUNCTIONS_SERVICE_ACCOUNT = process.env.FUNCTIONS_SERVICE_ACCOUNT || undefined;

setGlobalOptions({
  region: REGION,
  maxInstances: 20,
  concurrency: 20,
  memory: "512MiB",
  timeoutSeconds: 60,
  serviceAccount: FUNCTIONS_SERVICE_ACCOUNT,
});

export const callableOptions = {
  enforceAppCheck: !IS_EMULATOR,
  cors: true,
};

export const aiCallableOptions = {
  ...callableOptions,
  secrets: [GEMINI_API_KEY],
  timeoutSeconds: 90,
  memory: "1GiB" as const,
};
