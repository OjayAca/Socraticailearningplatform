import { contentHash } from "./content-hash.js";
import { createHash, randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { callableError } from "./errors.js";
import { database, FieldValue, Timestamp } from "./runtime.js";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthenticatedActor {
  uid: string;
  role: "student" | "admin";
  email: string | null;
}

export async function requireActor(
  request: CallableRequest<unknown>,
  allowMissingProfile = false
): Promise<AuthenticatedActor> {
  if (!request.auth) {
    throw callableError("unauthenticated", "authentication_required", "Sign in to continue.");
  }

  const profile = await database.doc(`users/${request.auth.uid}`).get();
  if (!profile.exists) {
    if (allowMissingProfile) {
      return {
        uid: request.auth.uid,
        role: "student",
        email: typeof request.auth.token.email === "string" ? request.auth.token.email : null,
      };
    }
    throw callableError(
      "failed-precondition",
      "profile_missing",
      "Your account profile is unavailable. Reload the page or contact a system administrator."
    );
  }
  const status = profile.get("status") ?? "active";
  if (status !== "active") {
    throw callableError(
      "permission-denied",
      "account_inactive",
      "This account is not active. Contact a system administrator."
    );
  }
  const profileRole = profile.get("role") === "admin" ? "admin" : "student";
  const tokenRole = request.auth.token.role === "admin" ? "admin" : "student";
  if (profileRole !== tokenRole) {
    throw callableError(
      "failed-precondition",
      "stale_auth_claims",
      "Your account permissions changed. Sign out and sign in again before continuing."
    );
  }

  return {
    uid: request.auth.uid,
    role: profileRole,
    email: typeof request.auth.token.email === "string" ? request.auth.token.email : null,
  };
}

export async function requireAdmin(
  request: CallableRequest<unknown>
): Promise<AuthenticatedActor & { role: "admin" }> {
  const actor = await requireActor(request);
  if (actor.role !== "admin") {
    throw callableError(
      "permission-denied",
      "administrator_required",
      "System administrator access is required."
    );
  }
  return actor as AuthenticatedActor & { role: "admin" };
}

function validateRequestId(requestId: unknown): string {
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    throw callableError(
      "invalid-argument",
      "invalid_request_id",
      "The request identifier is invalid. Refresh the page and try again."
    );
  }
  return requestId;
}

function idempotencyRef(uid: string, operation: string, requestId: string) {
  const key = createHash("sha256")
    .update(`${uid}:${operation}:${requestId}`)
    .digest("hex");
  return database.doc(`idempotency/${key}`);
}

const operationLeases = new WeakMap<FirebaseFirestore.DocumentReference, string>();
const operationVersions = new WeakMap<FirebaseFirestore.DocumentReference, Timestamp>();

export async function beginIdempotentRequest<T>(
  uid: string,
  operation: string,
  requestId: string,
  input?: unknown
): Promise<{ ref: FirebaseFirestore.DocumentReference; cached?: T }> {
  const ref = idempotencyRef(uid, operation, validateRequestId(requestId));
  const leaseToken = randomUUID();
  operationLeases.set(ref, leaseToken);
  const now = Timestamp.now();
  const leaseExpiresAt = Timestamp.fromMillis(now.toMillis() + 120_000);
  let cached: T | undefined;

  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const fingerprint = contentHash(input ?? null);
    if (snapshot.exists && snapshot.get("inputFingerprint") !== fingerprint) throw callableError("invalid-argument", "request_input_mismatch", "This request identifier is already bound to different input.");
    if (snapshot.exists && snapshot.get("status") === "completed") {
      cached = snapshot.get("result") as T;
      return;
    }
    const existingLease = snapshot.get("leaseExpiresAt") as Timestamp | undefined;
    if (
      snapshot.exists &&
      snapshot.get("status") === "processing" &&
      existingLease &&
      existingLease.toMillis() > now.toMillis()
    ) {
      throw callableError(
        "aborted",
        "request_in_progress",
        "This request is already being processed.",
        true
      );
    }
    transaction.set(ref, {
      uid,
      operation,
      requestId,
      inputFingerprint: fingerprint,
      status: "processing",
      leaseToken,
      leaseExpiresAt,
      createdAt: snapshot.get("createdAt") ?? now,
      updatedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 86_400_000),
    });
  });
  if (cached === undefined) {
    const acquired = await ref.get();
    if (acquired.get("status") !== "processing" || acquired.get("leaseToken") !== leaseToken || !acquired.updateTime) {
      throw callableError("aborted", "operation_lease_changed", "Another request recovered this operation. Reconcile its result before retrying.", true);
    }
    operationVersions.set(ref, acquired.updateTime);
  }
  return { ref, cached };
}

export function completeIdempotentRequest(
  transaction: Transaction,
  ref: FirebaseFirestore.DocumentReference,
  result: unknown
): void {
  const acquiredVersion = operationVersions.get(ref);
  if (!acquiredVersion) throw callableError("aborted", "operation_lease_missing", "Recover this operation before completing it.", true);
  // The update-time precondition is checked atomically with every business write.
  // An expired worker cannot commit after another worker takes over its lease.
  transaction.update(ref, {
    status: "completed",
    result,
    leaseExpiresAt: null,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { lastUpdateTime: acquiredVersion });
}

export async function releaseIdempotentRequest(
  ref: FirebaseFirestore.DocumentReference
): Promise<void> {
  await database.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (current.get("status") === "processing" && current.get("leaseToken") === operationLeases.get(ref)) transaction.update(ref, { status: "retryable", leaseExpiresAt: null, updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function enforceRateLimit(
  uid: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const ref = database.doc(`rate_limits/${uid}__${key}__${windowStart}`);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = snapshot.exists ? Number(snapshot.get("count") ?? 0) : 0;
    if (count >= limit) {
      throw callableError(
        "resource-exhausted",
        "rate_limit_exceeded",
        "Too many requests were made. Wait a few minutes and try again.",
        true
      );
    }
    transaction.set(
      ref,
      {
        uid,
        key,
        windowStart: Timestamp.fromMillis(windowStart),
        count: count + 1,
        expiresAt: Timestamp.fromMillis(windowStart + windowMs + 86_400_000),
      },
      { merge: true }
    );
  });
}

export async function acquireEvaluationLock(
  sessionId: string,
  uid: string
): Promise<{ ref: FirebaseFirestore.DocumentReference; token: string }> {
  const ref = database.doc(`evaluation_locks/${sessionId}`);
  const token = randomUUID();
  const now = Timestamp.now();
  const leaseExpiresAt = Timestamp.fromMillis(now.toMillis() + 120_000);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existingExpiry = snapshot.get("leaseExpiresAt") as Timestamp | undefined;
    if (snapshot.exists && existingExpiry && existingExpiry.toMillis() > now.toMillis()) {
      throw callableError(
        "aborted",
        "evaluation_in_progress",
        "This session already has a response being evaluated.",
        true
      );
    }
    transaction.set(ref, { sessionId, uid, token, leaseExpiresAt, expiresAt: leaseExpiresAt, updatedAt: now });
  });
  return { ref, token };
}

export async function releaseEvaluationLock(lock: {
  ref: FirebaseFirestore.DocumentReference;
  token: string;
}): Promise<void> {
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lock.ref);
    if (snapshot.exists && snapshot.get("token") === lock.token) transaction.delete(lock.ref);
  }).catch(() => undefined);
}
