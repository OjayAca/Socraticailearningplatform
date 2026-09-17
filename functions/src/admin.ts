import { purgeParticipantIdentity } from "./privacy.js";
import { observedWriter } from "./observed-writer.js";
import { instructionalManifest } from "./content-manifest.js";
import { requireContentWrites } from "./pilot.js";
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
  bulkImportProblemsSchema,
  adminSupportOverrideSchema,
  adminReviewSchema,
  adminDeleteContentSchema,
  adminDeleteUserSchema,
  adminPublishAnnouncementSchema,
  adminUserSchema,
  contentMutationSchema,
  parseInput,
  recordProblemValidationSchema,
  reportExportSchema,
  reportQuerySchema,
  submitProblemValidationSchema,
  validateManagedContent,
  findForbiddenPublicKeys,
} from "./validation.js";
import { REASONING_PHASES, type ReasoningPhase, type SupportLevel } from "@mindguide/contracts";
import { buildCatalogReadiness } from "./configuration.js";
import { queryReportPage, toCsv } from "./reporting.js";
import { supportContent, type GateStateMap, type PrivateProblemReference } from "./workflow.js";

export const adminReviewSession = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(adminReviewSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminReviewSession", data.requestId, data);
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
    operation = await beginIdempotentRequest(actor.uid, "adminOverrideSessionSupport", data.requestId, data);
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
    await requireContentWrites();
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
    if (data.collection === "problems" && validatedValue.status === "approved") {
      throw callableError(
        "failed-precondition",
        "faculty_validation_required",
        "Problems can be approved only through the recorded faculty-validation decision workflow."
      );
    }
    if (data.collection === "system_settings" && data.id === "privacy" && "studyClosedAt" in validatedValue) {
      validatedValue.studyClosedAt = normalizeOptionalTimestamp(validatedValue.studyClosedAt);
    }
    operation = await beginIdempotentRequest(actor.uid, "adminUpsertContent", data.requestId, data);
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

export const adminCatalogReadiness = onCall(callableOptions, async (request) => {
  const id = correlationId();
  try {
    await requireAdmin(request);
    return await buildCatalogReadiness();
  } catch (error) {
    throw asCallableError(error, id);
  }
});

export const adminSubmitProblemValidation = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    await requireContentWrites();
    const data = parseInput(submitProblemValidationSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminSubmitProblemValidation", data.requestId, data);
    if (operation.cached) return operation.cached;
    const problemRef = database.doc(`problems/${data.problemId}`);
    await assertProblemReadyForValidation(problemRef);
    const response = { problemId: data.problemId, status: "pending_validation" };
    await database.runTransaction(async (transaction) => {
      const problem = await transaction.get(problemRef);
      if (!problem.exists || !["draft", "rejected"].includes(String(problem.get("status")))) {
        throw callableError("failed-precondition", "problem_not_submittable", "Only draft or rejected problems can be submitted for validation.");
      }
      transaction.update(problemRef, {
        status: "pending_validation",
        validationRecordId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      writeAudit(transaction, actor.uid, "problem_validation_submitted", problemRef.path, {
        problemId: data.problemId,
        version: problem.get("version"),
      });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminRecordProblemValidation = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    await requireContentWrites();
    const data = parseInput(recordProblemValidationSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminRecordProblemValidation", data.requestId, data);
    if (operation.cached) return operation.cached;
    const problemRef = database.doc(`problems/${data.problemId}`);
    const validationRef = database.doc(`content_validation_records/${data.requestId}`);
    const response = {
      problemId: data.problemId,
      validationRecordId: validationRef.id,
      status: data.decision,
    };
    await database.runTransaction(async (transaction) => {
      const [problem, existingValidation] = await Promise.all([
        transaction.get(problemRef),
        transaction.get(validationRef),
      ]);
      if (!problem.exists || problem.get("status") !== "pending_validation") {
        throw callableError("failed-precondition", "problem_not_pending_validation", "The problem is not awaiting a faculty-validation decision.");
      }
      if (existingValidation.exists) {
        throw callableError("already-exists", "validation_record_exists", "This validation decision has already been recorded.");
      }
      const manifest = await instructionalManifest(problem, transaction);
      if (data.decision === "approved" && !manifest.complete) throw callableError("failed-precondition", "instructional_content_incomplete", "Complete the typed answer, hints, prompts, references, policy and approved rubric before approval.");
      transaction.create(validationRef, {
        manifestHash: manifest.hash,
        manifest: manifest.manifest,
        problemId: data.problemId,
        problemVersion: Number(problem.get("version") ?? 1),
        syllabusReference: data.syllabusReference,
        contentMatrixItem: data.contentMatrixItem,
        validatorName: data.validatorName,
        validatorRole: data.validatorRole,
        validationDate: Timestamp.fromMillis(data.validationDate),
        evidenceReference: data.evidenceReference,
        evidenceHash: data.evidenceHash,
        decision: data.decision,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });
      transaction.update(problemRef, {
        status: data.decision,
        validationRecordId: validationRef.id,
        validatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      writeAudit(transaction, actor.uid, "problem_validation_decision", problemRef.path, {
        decision: data.decision,
        validationRecordId: validationRef.id,
      });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminBulkImportProblems = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    await requireContentWrites();
    const data = parseInput(bulkImportProblemsSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminBulkImportProblems", data.requestId, data);
    if (operation.cached) return operation.cached;
    const ids = data.problems.map((problem) => problem.id);
    if (new Set(ids).size !== ids.length) {
      throw callableError("invalid-argument", "duplicate_problem_id", "The import contains duplicate problem IDs.");
    }
    const topicIds = [...new Set(data.problems.map((problem) => problem.topicId))];
    const referenceIds = [...new Set(data.problems.flatMap((problem) => problem.formulaTheoremReferenceIds))];
    const [existingProblems, topics, references] = await Promise.all([
      database.getAll(...ids.map((problemId) => database.doc(`problems/${problemId}`))),
      database.getAll(...topicIds.map((topicId) => database.doc(`topics/${topicId}`))),
      database.getAll(...referenceIds.map((referenceId) => database.doc(`formula_theorem_references/${referenceId}`))),
    ]);
    if (existingProblems.some((problem) => problem.exists)) {
      throw callableError("already-exists", "problem_id_exists", "At least one imported problem ID already exists.");
    }
    if (topics.some((topic) => !topic.exists || topic.get("status") !== "approved")) {
      throw callableError("failed-precondition", "topic_unapproved", "Every imported problem must reference an approved topic.");
    }
    if (references.some((reference) => !reference.exists || reference.get("status") !== "approved")) {
      throw callableError("failed-precondition", "reference_unapproved", "Every imported problem must reference approved formula or theorem content.");
    }
    const response = { valid: true, imported: data.dryRun ? 0 : data.problems.length, checked: data.problems.length, dryRun: data.dryRun };
    if (data.dryRun) {
      await database.runTransaction(async (transaction) => {
        completeIdempotentRequest(transaction, operation!.ref, response);
      });
      return response;
    }
    const batch = database.batch();
    for (const problem of data.problems) {
      const problemRef = database.doc(`problems/${problem.id}`);
      batch.create(problemRef, {
        subjectId: problem.subjectId,
        topicId: problem.topicId,
        subject: problem.subject,
        topic: problem.topic,
        difficulty: problem.difficulty,
        variant: problem.variant,
        problemText: problem.problemText,
        supportedResponseFormats: problem.supportedResponseFormats,
        formulaTheoremReferenceIds: problem.formulaTheoremReferenceIds,
        status: "draft",
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
        archivedAt: null,
      });
      batch.create(problemRef.collection("private").doc("solution"), {
        ...problem.privateSolution,
        version: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
    }
    batch.create(database.collection("audit_logs").doc(), {
      actorId: actor.uid,
      action: "problem_bulk_import",
      target: "problems",
      details: { count: data.problems.length },
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(operation.ref, {
      status: "completed",
      result: response,
      leaseExpiresAt: null,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
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
    await requireContentWrites();
    const data = parseInput(contentMutationSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminArchiveContent", data.requestId, data);
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
    operation = await beginIdempotentRequest(actor.uid, "adminManageUser", data.requestId, data);
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
      const writer = observedWriter(database.bulkWriter());
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

export const adminPublishAnnouncement = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(adminPublishAnnouncementSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminPublishAnnouncement", data.requestId, data);
    if (operation.cached) return operation.cached;
    const announcementRef = database.doc(`announcements/${data.requestId}`);
    let announcement = await announcementRef.get();
    if (!announcement.exists) {
      const recipients = await database.collection("users").where("role", "==", "student").where("status", "==", "active").get();
      await announcementRef.create({ title: data.title, message: data.message, audience: "active_students", publisherId: actor.uid, recipientIds: recipients.docs.map(doc => doc.id), deliveryCount: 0, status: "processing", createdAt: FieldValue.serverTimestamp() });
      announcement = await announcementRef.get();
    }
    const recipientIds: string[] = announcement.get("recipientIds") ?? [];

    const writer = observedWriter(database.bulkWriter());
    recipientIds.forEach((recipientId) => {
      writer.set(database.doc(`notifications/announcement__${data.requestId}__${recipientId}`), {
        eventType: "announcement",
        senderId: actor.uid,
        recipientId,
        announcementId: data.requestId,
        title: data.title,
        message: data.message,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await writer.close();
    await announcementRef.update({ status: "published", deliveryCount: recipientIds.length });
    const response = { announcementId: data.requestId, delivered: recipientIds.length };
    await database.runTransaction(async (transaction) => {
      writeAudit(transaction, actor.uid, "announcement_publish", announcementRef.path, {
        reason: data.reason,
        audience: "active_students",
        delivered: recipientIds.length,
      });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminDeleteContent = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    await requireContentWrites();
    const data = parseInput(adminDeleteContentSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminDeleteContent", data.requestId, data);
    if (operation.cached) return operation.cached;
    const ref = database.doc(`${data.collection}/${data.id}`);
    const jobRef = database.doc(`content_deletion_jobs/${data.requestId}`);
    const job = await jobRef.get();
    if (job.exists && job.get("target") !== ref.path) throw callableError("invalid-argument", "deletion_target_mismatch", "The job belongs to different content.");
    const snapshot = await ref.get();
    if (!snapshot.exists && !job.exists) throw callableError("not-found", "content_not_found", "The managed content record was not found.");
    if (snapshot.exists && !["draft", "rejected", "deleting"].includes(String(snapshot.get("status")))) {
      throw callableError("failed-precondition", "content_archive_required", "Only unreferenced draft or rejected content can be permanently deleted. Archive this record instead.");
    }
    const dependency = await findContentDependency(data.collection, data.id);
    if (dependency) {
      throw callableError("failed-precondition", "content_is_referenced", `Permanent deletion is blocked by ${dependency}. Archive this record instead.`);
    }
    await database.runTransaction(async transaction => {
      const fresh = await transaction.get(ref);
      if (fresh.exists && !["draft", "rejected", "deleting"].includes(String(fresh.get("status")))) throw callableError("failed-precondition", "content_changed", "Content status changed before deletion.");
      transaction.set(jobRef, { target: ref.path, status: "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (fresh.exists) transaction.update(ref, { status: "deleting" });
    });
    await database.recursiveDelete(ref);
    const response = { collection: data.collection, id: data.id, deleted: true };
    await database.runTransaction(async (transaction) => {
      transaction.set(jobRef, { status: "complete", completedAt: FieldValue.serverTimestamp() }, { merge: true });
      writeAudit(transaction, actor.uid, "content_delete", ref.path, { reason: data.reason });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminDeleteUser = onCall({ ...callableOptions, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(adminDeleteUserSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminDeleteUser", data.requestId, data);
    if (operation.cached) return operation.cached;
    const jobRef = database.doc(`deletion_jobs/${data.requestId}`);
    const targetRef = database.doc(`users/${data.userId}`);
    const [job, target] = await Promise.all([jobRef.get(), targetRef.get()]);
    if (!target.exists && !job.exists) throw callableError("not-found", "user_not_found", "The user account was not found.");
    if (job.exists && (job.get("userId") !== data.userId || job.get("actorId") !== actor.uid)) throw callableError("invalid-argument", "deletion_target_mismatch", "This deletion job belongs to another target or administrator.");
    if (target.exists && !job.exists) {
      if (target.get("role") === "admin") throw callableError("failed-precondition", "administrator_delete_forbidden", "Administrator accounts cannot be permanently deleted.");
      if (target.get("status") !== "deactivated") throw callableError("failed-precondition", "deactivation_required", "Deactivate this learner before permanent deletion.");
      const authUser = await adminAuth.getUser(data.userId);
      if ((authUser.email ?? "").trim().toLowerCase() !== data.confirmationEmail.trim().toLowerCase()) {
        throw callableError("failed-precondition", "email_confirmation_mismatch", "The confirmation email does not match this learner account.");
      }
      await jobRef.set({
        userId: data.userId,
        actorId: actor.uid,
        status: "processing",
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    const alias = `Learner-${createHash("sha256").update(data.userId).digest("hex").slice(0, 12)}`;
    const retainedCount = await purgeParticipantIdentity(data.userId);
    try {
      await adminAuth.deleteUser(data.userId);
    } catch (error) {
      const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
      if (code !== "auth/user-not-found") throw error;
    }
    if (target.exists) await database.recursiveDelete(targetRef);
    const response = { userId: alias, deleted: true, retainedLearningRecords: retainedCount };
    await database.runTransaction(async (transaction) => {
      transaction.set(jobRef, { status: "complete", pseudonym: alias, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writeAudit(transaction, actor.uid, "user_permanently_deleted", `deleted_users/${alias}`, {
        reason: data.reason,
        retainedLearningRecords: retainedCount,
      });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const adminQueryReport = onCall(callableOptions, async (request) => {
  const id = correlationId();
  try {
    await requireAdmin(request);
    const data = parseInput(reportQuerySchema, request.data);
    return { kind: data.kind, ...await queryReportPage(data), generatedAt: Date.now(), pseudonymized: !data.includeIdentity };
  } catch (error) {
    throw asCallableError(error, id);
  }
});

export const adminExportReport = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<Record<string, unknown>>>> | undefined;
  try {
    const actor = await requireAdmin(request);
    const data = parseInput(reportExportSchema, request.data);
    operation = await beginIdempotentRequest(actor.uid, "adminExportReport", data.requestId, data);
    if (operation.cached) return operation.cached;
    if (!data.cursor) await enforceRateLimit(actor.uid, "report_export", 5, 3_600_000);
    const page = await queryReportPage(data);
    const rows = page.rows;
    const response = data.output === "csv"
      ? { ...page, output: "csv", kind: data.kind, csv: toCsv(rows), filename: `mindguide-${data.kind}-${new Date().toISOString().slice(0, 10)}.csv`, generatedAt: Date.now(), pseudonymized: !data.includeIdentity }
      : { ...page, output: "print", kind: data.kind, rows, generatedAt: Date.now(), pseudonymized: !data.includeIdentity };
    await database.runTransaction(async (transaction) => {
      writeAudit(transaction, actor.uid, "report_export", `reports/${data.kind}`, { reason: data.exportReason, output: data.output, rowCount: rows.length, includeIdentity: data.includeIdentity });
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

async function assertProblemReadyForValidation(
  problemRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const [problem, privateSolution, prompts] = await Promise.all([
    problemRef.get(),
    problemRef.collection("private").doc("solution").get(),
    database.collection("socratic_prompt_bank").where("problemId", "==", problemRef.id).where("status", "==", "approved").get(),
  ]);
  if (!problem.exists || !privateSolution.exists) {
    throw callableError("failed-precondition", "problem_incomplete", "The problem and its protected solution must exist before validation.");
  }
  const topic = await database.doc(`topics/${String(problem.get("topicId"))}`).get();
  if (!topic.exists || topic.get("status") !== "approved") {
    throw callableError("failed-precondition", "topic_unapproved", "The problem must reference an approved topic.");
  }
  const referenceIds = Array.isArray(problem.get("formulaTheoremReferenceIds"))
    ? problem.get("formulaTheoremReferenceIds").filter((value: unknown): value is string => typeof value === "string")
    : [];
  if (referenceIds.length === 0) {
    throw callableError("failed-precondition", "problem_reference_missing", "At least one formula or theorem reference is required.");
  }
  const references = await database.getAll(...referenceIds.map((referenceId: string) =>
    database.doc(`formula_theorem_references/${referenceId}`)
  ));
  if (references.some((reference) => !reference.exists || reference.get("status") !== "approved")) {
    throw callableError("failed-precondition", "problem_reference_unapproved", "All linked formula or theorem references must be approved.");
  }
  const promptPhases = new Set(prompts.docs.map((prompt) => prompt.get("phase")));
  const missing = REASONING_PHASES.filter((phase) => !promptPhases.has(phase));
  if (missing.length > 0) {
    throw callableError("failed-precondition", "prompt_set_incomplete", `Approved prompts are missing for: ${missing.join(", ")}.`);
  }
}

async function findContentDependency(collection: string, contentId: string): Promise<string | null> {
  const queries: Array<{ label: string; query: FirebaseFirestore.Query }> = [];
  if (collection === "subjects") {
    queries.push(
      { label: "a topic", query: database.collection("topics").where("subjectId", "==", contentId).limit(1) },
      { label: "a problem", query: database.collection("problems").where("subjectId", "==", contentId).limit(1) },
      { label: "a difficulty policy", query: database.collection("difficulty_policies").where("subjectId", "==", contentId).limit(1) },
    );
  } else if (collection === "topics") {
    queries.push(
      { label: "a problem", query: database.collection("problems").where("topicId", "==", contentId).limit(1) },
      { label: "a difficulty policy", query: database.collection("difficulty_policies").where("topicId", "==", contentId).limit(1) },
    );
  } else if (collection === "problems") {
    queries.push({ label: "a Socratic prompt", query: database.collection("socratic_prompt_bank").where("problemId", "==", contentId).limit(1) });
  } else if (collection === "formula_theorem_references") {
    queries.push({ label: "a problem", query: database.collection("problems").where("formulaTheoremReferenceIds", "array-contains", contentId).limit(1) });
  }
  for (const candidate of queries) {
    if (!(await candidate.query.get()).empty) return candidate.label;
  }

  const sessions = await database.collection("sessions").select(
    "subjectId",
    "topicId",
    "problemId",
    "configurationVersions"
  ).get();
  const singularKey: Record<string, string | undefined> = {
    topics: "topic",
    problems: "problem",
    difficulty_policies: "difficultyPolicy",
  };
  const arrayKey: Record<string, string | undefined> = {
    formula_theorem_references: "formulaTheoremReferences",
    socratic_prompt_bank: "prompts",
    misconception_categories: "misconceptionPolicies",
  };
  for (const session of sessions.docs) {
    if (collection === "subjects" && session.get("subjectId") === contentId) return `historical session ${session.id}`;
    if (collection === "topics" && session.get("topicId") === contentId) return `historical session ${session.id}`;
    if (collection === "problems" && session.get("problemId") === contentId) return `historical session ${session.id}`;
    const versions = session.get("configurationVersions") as Record<string, unknown> | undefined;
    const single = singularKey[collection] && versions?.[singularKey[collection]!];
    if (isRecord(single) && single.id === contentId) return `historical session ${session.id}`;
    const values = arrayKey[collection] ? versions?.[arrayKey[collection]!] : undefined;
    if (Array.isArray(values) && values.some((value) => isRecord(value) && value.id === contentId)) {
      return `historical session ${session.id}`;
    }
  }
  return null;
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
