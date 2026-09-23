import "server-only";
import { ensure, type Env } from "./platform";

export function getServerEnv(): Env {
  const project = process.env.FIREBASE_PROJECT_ID;
  const webProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  ensure(project && !project.startsWith("demo-") && project === webProject,
    "Backend project must match the existing Firebase web project.", 503);
  ensure(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST,
    "Emulator connections are not permitted for this application.", 503);
  return {
    FIREBASE_PROJECT_ID: project,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
    GEMINI_MODEL: process.env.GEMINI_MODEL ?? "",
    AI_ENABLED: process.env.AI_ENABLED ?? "false",
    AI_FREE_TIER_CONFIRMED: process.env.AI_FREE_TIER_CONFIRMED ?? "false",
    GEMINI_RPM: process.env.GEMINI_RPM ?? "",
    GEMINI_TPM: process.env.GEMINI_TPM ?? "",
    GEMINI_RPD: process.env.GEMINI_RPD ?? "",
    OPERATOR_UID: process.env.OPERATOR_UID,
  };
}
