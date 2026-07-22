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

  if (code.endsWith("/not-found")) {
    message =
      "The secure MINDGUIDE service is not deployed for this environment. Contact the system administrator.";
  } else if (code.endsWith("/internal")) {
    message = "MINDGUIDE could not complete the request. Please try again.";
  } else if (code.endsWith("/unavailable")) {
    message = "The secure MINDGUIDE service is temporarily unavailable. Please try again.";
  } else if (code.endsWith("/deadline-exceeded")) {
    message = "The secure MINDGUIDE service took too long to respond. Please try again.";
  } else if (code.endsWith("/unauthenticated")) {
    message = "Your sign-in session could not be verified. Sign in again to continue.";
  } else if (code.endsWith("/permission-denied")) {
    message = "Your account does not have access to this learning content.";
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
