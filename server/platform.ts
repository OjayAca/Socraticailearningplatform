import "server-only";
import { createHash } from "node:crypto";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  AI_ENABLED: string;
  AI_FREE_TIER_CONFIRMED: string;
  GEMINI_RPM: string;
  GEMINI_TPM: string;
  GEMINI_RPD: string;
  OPERATOR_UID?: string;
}

export class ServiceError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter = 0) { super(message); }
}
export function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new ServiceError(status, status === 409 ? "conflict" : "invalid-request", message);
}
export async function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("base64url"); }

export interface RecordDoc { path: string; data: any; version?: string }
export interface Store {
  get(path: string): Promise<RecordDoc>;
  query(collection: string, field?: string, value?: unknown): Promise<RecordDoc[]>;
  commit(writes: Array<{ doc: RecordDoc; data: any }>): Promise<void>;
}
