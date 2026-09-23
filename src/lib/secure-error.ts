interface FirebaseErrorLike {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

const GENERIC_FIREBASE_MESSAGES = new Set([
  "internal",
  "not-found",
  "unavailable",
  "deadline-exceeded",
  "unknown",
]);

/** Converts Firebase SDK failures into actionable, learner-safe messages. */
export function secureErrorMessage(
  error: unknown,
  fallback = "The secure MINDGUIDE service could not complete the request."
): string {
  const candidate = error as FirebaseErrorLike | null;
  const details = isRecord(candidate?.details) ? candidate.details : null;
  const detailMessage = stringValue(details?.message);
  const correlationId = stringValue(details?.correlationId);

  if (detailMessage) {
    return correlationId
      ? `${detailMessage} Reference: ${correlationId}`
      : detailMessage;
  }

  const code = stringValue(candidate?.code)?.toLowerCase() ?? "";
  let message: string;

  if (["unavailable", "deadline-exceeded", "resource-exhausted", "internal"].some(value => code === value || code.endsWith("/" + value))) {
    message = "Unable to load learning materials.";
  } else if (code === "permission-denied" || code.endsWith("/permission-denied")) {
    message = "Your account does not have access to this learning content.";
  } else if (code === "unauthenticated" || code.endsWith("/unauthenticated")) {
    message = "Your sign-in session could not be verified. Sign in again to continue.";
  } else {
    const rawMessage = stringValue(candidate?.message);
    message = rawMessage && !isGenericFirebaseMessage(rawMessage)
      ? rawMessage
      : fallback;
  }

  return correlationId ? `${message} Reference: ${correlationId}` : message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isGenericFirebaseMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    GENERIC_FIREBASE_MESSAGES.has(normalized) ||
    /^firebase:\s*error\s*\([^)]*\)\.?$/i.test(value.trim())
  );
}
