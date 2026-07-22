import { randomUUID } from "node:crypto";
import {
  HttpsError,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import type { CallableErrorBody } from "@mindguide/contracts";

export function correlationId(): string {
  return randomUUID();
}

export function callableError(
  code: FunctionsErrorCode,
  stableCode: string,
  message: string,
  retryable = false,
  id = correlationId()
): HttpsError {
  const details: CallableErrorBody = {
    code: stableCode,
    message,
    retryable,
    correlationId: id,
  };
  return new HttpsError(code, message, details);
}

export function asCallableError(error: unknown, id = correlationId()): HttpsError {
  if (error instanceof HttpsError) return error;
  console.error("Unhandled callable failure", { correlationId: id, error });
  return callableError(
    "internal",
    "internal_error",
    "MINDGUIDE could not complete the request. Please try again.",
    true,
    id
  );
}
