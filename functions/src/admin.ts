import { createHash, randomUUID } from "node:crypto";
import { onCall } from "firebase-functions/v2/https";
import { asCallableError, callableError, correlationId } from "./errors.js";
import { adminAuth, callableOptions, database, FieldValue, Timestamp } from "./runtime.js";
import {
  beginIdempotentRequest,
  completeIdempotentRequest,
  enforceRateLimit,
  releaseIdempotentRequest,
  requireAdmin,
} from "./security.js";
import {
  adminSupportOverrideSchema,
  adminReviewSchema,
  adminUserSchema,
  contentMutationSchema,
  parseInput,
  reportQuerySchema,
  validateManagedContent,
  findForbiddenPublicKeys,
} from "./validation.js";
import { REASONING_PHASES, type ReasoningPhase, type SupportLevel } from "@mindguide/contracts";
import { queryReportRows, toCsv } from "./reporting.js";
import { supportContent, type GateStateMap, type PrivateProblemReference } from "./workflow.js";

export const adminReviewSession = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(adminReviewSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminReviewSession", data.requestId);
    if (operation.cached) return operation.cached;
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    let response!: Record<string, unknown>;
    await database.runTransaction(async (transaction) => {
      const session = await transaction.get(sessionRef);
      if (!session.exists) throw callableError("not-found", "session_not_found", "The learner session was not found.");
      if (session.get("status") !== "submitted") throw callableError("failed-precondition", "review_already_recorded", "This session no longer accepts a review decision.");
      const review = { outcome: data.outcome, comment: data.comment, reviewedBy: actor.uid, reviewedAt: Date.now() };
      transaction.update(sessionRef, {
        status: data.outcome,
        revision: Number(session.get("revision") ?? 0) + 1,
        adminReview: { ...review, reviewedAt: FieldValue.serverTimestamp() },
        reviewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(database.doc(`notifications/session_${data.outcome}__${session.id}__${session.get("studentId")}`), {
        eventType: `session_${data.outcome}`,
        senderId: actor.uid,
        recipientId: session.get("studentId"),
        sessionId: session.id,
        title: data.outcome === "reviewed" ? "Session reviewed" : "Session returned",
        message: data.outcome === "reviewed" ? "Your administrator review is ready." : "Your session was returned with formative guidance.",
        actionUrl: `/student/review/${session.id}`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      writeAudit(transaction, actor.uid, "session_review", sessionRef.path, { outcome: data.outcome, commentLength: data.comment.length });
      response = { sessionId: session.id, review };
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminOverrideSessionSupport = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(adminSupportOverrideSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminOverrideSessionSupport", data.requestId);
    if (operation.cached) return operation.cached;
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    let response!: Record<string, unknown>;
    await database.runTransaction(async (transaction) => {
      const [session, reference] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(sessionRef.collection("private").doc("reference")),
      ]);
      if (!session.exists || !reference.exists) {
        throw callableError("not-found", "session_not_found", "The learning session or private reference was not found.");
      }
      if (!session.get("scorecard") || !session.get("releasedSolution")) {
        throw callableError("failed-precondition", "support_override_unavailable", "Worked support cannot be authorized until the learner's reasoning has been scored and the solution release is recorded.");
      }
      const gates = session.get("gateStates") as GateStateMap;
      const phase = REASONING_PHASES.find((candidate) => gates?.[candidate]?.status !== "accepted")
        ?? "result_interpretation";
      const previous = Array.isArray(session.get("adminAuthorizedSupport"))
        ? session.get("adminAuthorizedSupport") as SupportLevel[]
        : [];
      const authorized = [...new Set([...previous, data.level])];
      const content = supportContent(data.level, phase as ReasoningPhase, reference.data() as PrivateProblemReference);
      const unlockRef = sessionRef.collection("unlock_events").doc();
      transaction.update(sessionRef, {
        adminAuthorizedSupport: authorized,
        allowedSupport: [...new Set([...(session.get("allowedSupport") ?? []), data.level])],
        revision: Number(session.get("revision") ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(unlockRef, {
        level: data.level,
        reason: data.reason,
        adminException: true,
        authorizedBy: actor.uid,
        content,
        createdAt: FieldValue.serverTimestamp(),
      });
      writeAudit(transaction, actor.uid, "session_support_override", sessionRef.path, {
        level: data.level,
        reason: data.reason,
        unlockEventId: unlockRef.id,
      });
      response = { sessionId: session.id, level: data.level, authorized: true };
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminUpsertContent = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(contentMutationSchema, request.data);
    if (!data.value) throw callableError("invalid-argument", "content_missing", "Content data is required.");
    const forbidden = findForbiddenPublicKeys(data.value, data.collection === "problems");
    if (forbidden.length) {
      throw callableError(
        "invalid-argument",
        "private_content_in_public_document",
        `Private instructional fields are not allowed in public content: ${forbidden.join(", ")}`
      );
    }
    const validatedValue = validateManagedContent(data.collection, data.id, data.value);
    if (data.collection === "system_settings" && data.id === "privacy" && "studyClosedAt" in validatedValue) {
      validatedValue.studyClosedAt = normalizeOptionalTimestamp(validatedValue.studyClosedAt);
    }
    operation = await beginIdempotentRequest(actor.uid, "adminUpsertContent", data.requestId);
    if (operation.cached) return operation.cached;
    const ref = database.doc(`${data.collection}/${data.id}`);
    const privateSolution = data.collection === "problems" && isRecord(validatedValue.privateSolution)
      ? validatedValue.privateSolution
      : null;
    const publicValue = { ...validatedValue };
    delete publicValue.privateSolution;
    let response!: Record<string, unknown>;
    await database.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const privateRef = ref.collection("private").doc("solution");
      const existingPrivate = data.collection === "problems"
        ? await transaction.get(privateRef)
        : null;
      if (data.collection === "problems" && publicValue.status === "approved" && !privateSolution && !existingPrivate?.exists) {
        throw callableError(
          "failed-precondition",
          "approved_problem_requires_solution",
          "An approved problem requires a validated private solution."
        );
      }
      const version = Number(current.get("version") ?? 0) + 1;
      const record = {
        ...publicValue,
        version,
        status: publicValue.status ?? current.get("status") ?? "draft",
        createdAt: current.get("createdAt") ?? FieldValue.serverTimestamp(),
        createdBy: current.get("createdBy") ?? actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
        archivedAt: null,
      };
      transaction.set(ref, record, { merge: false });
      if (privateSolution) {
        transaction.set(privateRef, {
          ...privateSolution,
          version,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
      }
      writeAudit(transaction, actor.uid, "content_upsert", ref.path, { collection: data.collection, version });
      response = { id: data.id, collection: data.collection, version };
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminArchiveContent = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(contentMutationSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminArchiveContent", data.requestId);
    if (operation.cached) return operation.cached;
    const ref = database.doc(`${data.collection}/${data.id}`);
    const response = { id: data.id, collection: data.collection, status: "archived" };
    await database.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (!current.exists) throw callableError("not-found", "content_not_found", "The managed content record was not found.");
      transaction.update(ref, { status: "archived", archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid, version: Number(current.get("version") ?? 0) + 1 });
      writeAudit(transaction, actor.uid, "content_archive", ref.path, { collection: data.collection });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminManageUser = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  let rosterLock: { token: string } | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(adminUserSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminManageUser", data.requestId);
    if (operation.cached) return operation.cached;
    const targetRef = database.doc(`users/${data.userId}`);
    const target = await targetRef.get();
    if (!target.exists) throw callableError("not-found", "user_not_found", "The user account was not found.");

    if (
      ["demote", "suspend", "deactivate"].includes(data.action)
      && target.get("role") === "admin"
      && target.get("status") === "active"
    ) {
      rosterLock = await acquireAdminRosterLock(actor.uid);
      const activeAdmins = await database.collection("users").where("role", "==", "admin").where("status", "==", "active").get();
      if (activeAdmins.size <= 1) throw callableError("failed-precondition", "last_admin_protected", "The final active administrator cannot be removed or suspended.");
    }

    if (data.action === "anonymize") {
      if (target.get("role") === "admin" || target.get("status") !== "deactivated") {
        throw callableError("failed-precondition", "anonymization_requires_deactivation", "Only a deactivated learner account can be anonymized.");
      }
      const alias = `Learner-${createHash("sha256").update(data.userId).digest("hex").slice(0, 12)}`;
      await targetRef.update({
        anonymizationState: "processing",
        anonymizationStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      const sessions = await database.collection("sessions").where("studentId", "==", data.userId).get();
      const writer = database.bulkWriter();
      sessions.docs.forEach((session) => writer.update(session.ref, {
        studentName: alias,
        studentEmail: null,
        anonymizedAt: FieldValue.serverTimestamp(),
      }));
      await writer.close();
      try {
        await adminAuth.deleteUser(data.userId);
      } catch (authError) {
        const code = isRecord(authError) && typeof authError.code === "string" ? authError.code : "";
        if (code !== "auth/user-not-found") {
          await targetRef.update({
            anonymizationState: "failed",
            anonymizationError: "auth_identity_deletion_failed",
            updatedAt: FieldValue.serverTimestamp(),
          });
          await database.collection("audit_logs").add({
            actorId: actor.uid,
            action: "user_anonymization_failed",
            target: targetRef.path,
            details: { reason: data.reason, failure: "auth_identity_deletion_failed" },
            createdAt: FieldValue.serverTimestamp(),
          });
          throw callableError(
            "unavailable",
            "auth_identity_deletion_failed",
            "Learning records were scrubbed, but the authentication identity could not be deleted. Retry anonymization.",
            true
          );
        }
      }
      const response = { userId: data.userId, action: data.action, status: "anonymized", retainedAggregateRecords: sessions.size };
      await database.runTransaction(async (transaction) => {
        transaction.update(targetRef, {
          displayName: alias,
          email: null,
          status: "anonymized",
          anonymizationState: "complete",
          anonymizationError: null,
          anonymizedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor.uid,
        });
        writeAudit(transaction, actor.uid, "user_anonymized", targetRef.path, {
          reason: data.reason,
          retainedAggregateRecords: sessions.size,
        });
        completeIdempotentRequest(transaction, operation!.ref, response);
      });
      return response;
    }

    if (data.action === "reset_access") {
      const email = target.get("email");
      if (typeof email !== "string" || !email) throw callableError("failed-precondition", "email_unavailable", "This account has no email address for access reset.");
      const resetLink = await adminAuth.generatePasswordResetLink(email);
      const response = { userId: data.userId, action: data.action, resetLink };
      await database.runTransaction(async (transaction) => {
        writeAudit(transaction, actor.uid, "user_reset_access", targetRef.path, { reason: data.reason });
        completeIdempotentRequest(transaction, operation!.ref, response);
      });
      return response;
    }

    const previousClaims = (await adminAuth.getUser(data.userId)).customClaims ?? {};
    const role = data.action === "promote" ? "admin" : data.action === "demote" ? "student" : target.get("role") ?? "student";
    const status = data.action === "suspend" ? "suspended" : data.action === "deactivate" ? "deactivated" : data.action === "activate" ? "active" : target.get("status") ?? "active";
    const response = { userId: data.userId, action: data.action, role, status, refreshTokenRequired: true };
    try {
      await adminAuth.setCustomUserClaims(data.userId, { ...previousClaims, role });
      await adminAuth.updateUser(data.userId, { disabled: status !== "active" });
      await adminAuth.revokeRefreshTokens(data.userId);
      await database.runTransaction(async (transaction) => {
        transaction.update(targetRef, { role, status, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
        writeAudit(transaction, actor.uid, `user_${data.action}`, targetRef.path, { reason: data.reason, role, status });
        completeIdempotentRequest(transaction, operation!.ref, response);
      });
    } catch (error) {
      await adminAuth.setCustomUserClaims(data.userId, previousClaims);
      await adminAuth.updateUser(data.userId, { disabled: target.get("status") !== "active" });
      await adminAuth.revokeRefreshTokens(data.userId).catch(() => undefined);
      throw error;
    }
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  } finally {
    if (rosterLock) await releaseAdminRosterLock(rosterLock.token);
  }
});

export const adminQueryReport = onCall(callableOptions, async (request) => {
  const id = correlationId();
  try {
    await requireAdmin(request);
    const data = parseInput(reportQuerySchema, request.data);
    return { kind: data.kind, rows: await queryReportRows(data), generatedAt: Date.now(), pseudonymized: !data.includeIdentity };
  } catch (error) {
    throw asCallableError(error, id);
  }
});

export const adminExportReport = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(reportQuerySchema, request.data);
    if (!data.requestId || !data.exportReason) throw callableError("invalid-argument", "export_reason_required", "A request ID and export reason are required.");
    operation = await beginIdempotentRequest(actor.uid, "adminExportReport", data.requestId);
    if (operation.cached) return operation.cached;
    await enforceRateLimit(actor.uid, "report_export", 5, 3_600_000);
    const rows = await queryReportRows(data);
    const csv = toCsv(rows);
    const response = { kind: data.kind, csv, filename: `mindguide-${data.kind}-${new Date().toISOString().slice(0, 10)}.csv`, generatedAt: Date.now() };
    await database.runTransaction(async (transaction) => {
      writeAudit(transaction, actor.uid, "report_export", `reports/${data.kind}`, { reason: data.exportReason, rowCount: rows.length, includeIdentity: data.includeIdentity });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

function normalizeOptionalTimestamp(value: unknown): Timestamp | null {
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Timestamp.fromMillis(value);
  if (typeof value === "string") {
    const millis = Date.parse(value);
    if (Number.isFinite(millis)) return Timestamp.fromMillis(millis);
  }
  if (isRecord(value) && typeof value.seconds === "number") {
    return new Timestamp(value.seconds, typeof value.nanoseconds === "number" ? value.nanoseconds : 0);
  }
  throw callableError(
    "invalid-argument",
    "invalid_study_closure_date",
    "studyClosedAt must be null, an ISO date, epoch milliseconds, or a Firestore timestamp."
  );
}

function writeAudit(
  transaction: FirebaseFirestore.Transaction,
  actorId: string,
  action: string,
  target: string,
  details: Record<string, unknown>
): void {
  transaction.create(database.collection("audit_logs").doc(), {
    actorId,
    action,
    target,
    details,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function acquireAdminRosterLock(actorId: string): Promise<{ token: string }> {
  const ref = database.doc("system_locks/admin_roster");
  const token = randomUUID();
  const now = Timestamp.now();
  await database.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const expiresAt = current.get("expiresAt") as Timestamp | undefined;
    if (current.exists && expiresAt && expiresAt.toMillis() > now.toMillis()) {
      throw callableError(
        "aborted",
        "admin_roster_busy",
        "Another administrator account change is in progress. Retry shortly.",
        true
      );
    }
    transaction.set(ref, {
      token,
      actorId,
      acquiredAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 120_000),
    });
  });
  return { token };
}

async function releaseAdminRosterLock(token: string): Promise<void> {
  const ref = database.doc("system_locks/admin_roster");
  await database.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists && current.get("token") === token) transaction.delete(ref);
  }).catch(() => undefined);
}
