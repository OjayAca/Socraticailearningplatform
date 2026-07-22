import { onCall } from "firebase-functions/v2/https";
import type {
  AdaptiveRecommendation,
  Difficulty,
  EvaluatePhaseResponseResponse,
  GetCurrentConsentNoticeResponse,
  LearningProgress,
  ReasoningPhase,
  RequestSupportResponse,
  SolverStage,
  SolverStageProgress,
  SessionMutationResponse,
  SessionProjection,
  SupportLevel,
} from "@mindguide/contracts";
import {
  REASONING_PHASES,
  SCHEMA_VERSION,
  SOLVER_STAGES,
  SOLVER_STAGE_PHASES,
  WORKFLOW_VERSION,
  solverStageForPhase,
} from "@mindguide/contracts";
import { analyzeFreeFormProblem, evaluateAmbiguousResponse } from "./ai.js";
import { asCallableError, callableError, correlationId } from "./errors.js";
import { normalizeMathResponse } from "./math.js";
import { aiCallableOptions, callableOptions, database, FieldValue, Timestamp } from "./runtime.js";
import {
  beginIdempotentRequest,
  acquireEvaluationLock,
  completeIdempotentRequest,
  enforceRateLimit,
  releaseIdempotentRequest,
  releaseEvaluationLock,
  requireActor,
} from "./security.js";
import {
  bootstrapProfileSchema,
  evaluateResponseSchema,
  parseInput,
  revisionedSessionMutationSchema,
  saveDraftSchema,
  sessionMutationSchema,
  startSessionSchema,
  supportRequestSchema,
} from "./validation.js";
import {
  buildScorecard,
  buildReleasedSolution,
  evaluateDeterministically,
  initialGateStates,
  nextReasoningPhase,
  promptForPhase,
  recommendDifficulty,
  supportContent,
  supportLevelsFor,
  type GateStateMap,
  type PrivateProblemReference,
} from "./workflow.js";

const CURRENT_CONSENT_VERSION = "privacy-2026-07-18";

export const getCurrentConsentNotice = onCall(callableOptions, async (request) => {
  const id = correlationId();
  try {
    await requireActor(request);
    return await readCurrentConsentNotice();
  } catch (error) {
    throw asCallableError(error, id);
  }
});

export const bootstrapProfile = onCall(callableOptions, async (request) => {
  const id = correlationId();
  try {
    const actor = await requireActor(request, true);
    const data = parseInput(bootstrapProfileSchema, request.data);
    if (data.consentVersion) {
      const notice = await readCurrentConsentNotice();
      if (notice.version !== data.consentVersion) {
        throw callableError(
          "failed-precondition",
          "consent_version_changed",
          "The privacy notice changed. Reload it before acknowledging consent."
        );
      }
    }
    const operation = await beginIdempotentRequest<{ profile: Record<string, unknown> }>(
      actor.uid,
      "bootstrapProfile",
      data.requestId
    );
    if (operation.cached) return operation.cached;

    const profileRef = database.doc(`users/${actor.uid}`);
    const result = await database.runTransaction(async (transaction) => {
      const current = await transaction.get(profileRef);
      const profile = {
        schemaVersion: SCHEMA_VERSION,
        displayName: data.displayName,
        email: actor.email,
        role: current.get("role") === "admin" ? "admin" : "student",
        status: current.get("status") ?? "active",
        createdAt: current.get("createdAt") ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastActivityAt: FieldValue.serverTimestamp(),
        preferences: current.get("preferences") ?? { liveAlertPopups: true },
      };
      transaction.set(profileRef, profile, { merge: true });
      if (data.consentVersion) {
        transaction.set(database.doc(`users/${actor.uid}/consents/${data.consentVersion}`), {
          version: data.consentVersion,
          acknowledgedAt: FieldValue.serverTimestamp(),
          source: "web",
        });
      }
      const response = { profile: { ...profile, createdAt: Date.now(), updatedAt: Date.now(), lastActivityAt: Date.now() } };
      completeIdempotentRequest(transaction, operation.ref, response);
      return response;
    });
    return result;
  } catch (error) {
    throw asCallableError(error, id);
  }
});

export const startLearningSession = onCall(aiCallableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<SessionMutationResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(startSessionSchema, request.data);
    operation = await beginIdempotentRequest<SessionMutationResponse>(actor.uid, "startLearningSession", data.requestId);
    if (operation.cached) return operation.cached;
    await enforceRateLimit(actor.uid, "session_start", 5, 3_600_000);
    await requireCurrentConsent(actor.uid);

    const profile = await database.doc(`users/${actor.uid}`).get();
    let publicProblem: Record<string, unknown>;
    let reference: PrivateProblemReference;
    let rawAI: string | null = null;
    let adaptiveRecommendation: SessionProjection["adaptiveRecommendation"] = null;

    if (data.mode === "curated") {
      const selection = await selectAdaptiveProblem({
        uid: actor.uid,
        requestedProblemId: data.problemId,
        requestedSubject: data.subject,
        requestedTopic: data.topic,
      });
      const problemRef = database.doc(`problems/${selection.problem.id}`);
      const privateProblem = await problemRef.collection("private").doc("solution").get();
      if (!privateProblem.exists) {
        throw callableError("not-found", "problem_unavailable", "This prepared problem is unavailable.");
      }
      publicProblem = { id: selection.problem.id, ...selection.problem.data() };
      reference = privateProblem.data() as PrivateProblemReference;
      adaptiveRecommendation = selection.recommendation;
    } else {
      const analyzed = await analyzeFreeFormProblem({
        question: data.question!,
        subject: data.subject!,
        topic: data.topic!,
      }).catch(async (error) => {
        await writeAIFailure({
          uid: actor.uid,
          operation: "free_form_validation",
          reason: String(error),
          correlationId: id,
        }).catch(() => undefined);
        throw callableError(
          "unavailable",
          "problem_analysis_unavailable",
          "MINDGUIDE could not validate this problem right now. Please try again.",
          true,
          id
        );
      });
      if (!analyzed.analysis.supported || !analyzed.analysis.solvable) {
        await writeAIFailure({
          uid: actor.uid,
          operation: "free_form_validation",
          reason: analyzed.analysis.rejectionReason ?? "Unsupported or unsolvable problem.",
          correlationId: id,
        });
        throw callableError(
          "failed-precondition",
          "unsupported_problem",
          analyzed.analysis.rejectionReason || "This problem is outside MINDGUIDE's supported scope."
        );
      }
      publicProblem = {
        id: null,
        subject: data.subject,
        topic: data.topic,
        difficulty: data.difficulty ?? "Basic",
        problemText: analyzed.analysis.normalizedQuestion,
        supportedResponseFormats: ["text", "latex"],
      };
      reference = analyzed.analysis;
      rawAI = analyzed.raw;
      adaptiveRecommendation = {
        recommendedDifficulty: (data.difficulty ?? "Basic") as SessionProjection["difficulty"],
        reason: "Free-form problems keep the learner-selected complexity while Socratic prompt scaffolding adapts to response quality.",
        confidence: "low",
      };
    }

    const sessionRef = database.collection("sessions").doc();
    const now = Date.now();
    const sessionData = {
      schemaVersion: SCHEMA_VERSION,
      workflowVersion: WORKFLOW_VERSION,
      revision: 0,
      studentId: actor.uid,
      studentName: profile.get("displayName") ?? actor.email ?? "Learner",
      subject: publicProblem.subject,
      topic: publicProblem.topic,
      difficulty: publicProblem.difficulty,
      problemId: publicProblem.id,
      selectedProblemId: publicProblem.id,
      problemMode: data.mode,
      originalQuestion: publicProblem.problemText,
      problemContext: {
        mode: data.mode,
        problemId: publicProblem.id,
        promptSnapshot: publicProblem.problemText,
      },
      status: "in_progress",
      currentPhase: "problem_understanding",
      currentPrompt: promptForPhase("problem_understanding", reference),
      gateStates: initialGateStates(),
      gateEvaluations: {},
      diagnosisSummary: [],
      allowedSupport: ["socratic_prompt"],
      supportUsage: 0,
      draft: null,
      scorecard: null,
      releasedSolution: null,
      adaptiveRecommendation,
      promptAdjustment: "maintain",
      consecutiveStrongResponses: 0,
      parentSessionId: null,
      followUpSessionId: null,
      createdAt: Timestamp.fromMillis(now),
      updatedAt: Timestamp.fromMillis(now),
      lastActivityAt: Timestamp.fromMillis(now),
      learningCompletedAt: null,
      submittedAt: null,
      reviewedAt: null,
      adminReview: null,
      statsCommittedAt: null,
      currentStep: "questioning",
      completedPhases: [],
      ctScore: 0,
      messages: [],
      phaseResponses: [],
      correctivePrompts: [],
      logicMap: [],
      hints: [],
      hintsUsed: 0,
      diagnosisResult: null,
      detectedMisconception: null,
      unlockLevel: 0,
      mindGuideScorecard: null,
      aiFallbackEvents: [],
    };
    const response = { session: projectSession(sessionRef.id, sessionData) };
    await database.runTransaction(async (transaction) => {
      transaction.create(sessionRef, sessionData);
      transaction.create(sessionRef.collection("private").doc("reference"), {
        ...reference,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (rawAI) {
        transaction.create(sessionRef.collection("private_ai").doc(), {
          kind: "problem_validation",
          rawOutput: rawAI,
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
        });
      }
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const evaluatePhaseResponse = onCall(aiCallableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<EvaluatePhaseResponseResponse>>> | undefined;
  let evaluationLock: Awaited<ReturnType<typeof acquireEvaluationLock>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(evaluateResponseSchema, request.data);
    operation = await beginIdempotentRequest<EvaluatePhaseResponseResponse>(actor.uid, "evaluatePhaseResponse", data.requestId);
    if (operation.cached) return operation.cached;
    await enforceRateLimit(actor.uid, "phase_evaluation", 30, 900_000);

    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    const [sessionSnapshot, referenceSnapshot] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("private").doc("reference").get(),
    ]);
    assertSessionOwner(sessionSnapshot, actor.uid);
    evaluationLock = await acquireEvaluationLock(data.sessionId, actor.uid);
    if (!referenceSnapshot.exists) throw callableError("failed-precondition", "missing_reference", "The private problem reference is unavailable.");
    const session = sessionSnapshot.data()!;
    assertSessionRevision(session, data.revision, data.expectedPhase);
    const gates = session.gateStates as GateStateMap;
    const gate = gates[data.expectedPhase];
    const response = normalizeMathResponse(data.response);
    let result = evaluateDeterministically({
      phase: data.expectedPhase,
      response,
      problemText: String(session.originalQuestion),
      reference: referenceSnapshot.data() as PrivateProblemReference,
      attemptCount: gate.attemptCount + 1,
      correctiveCycleCount: gate.correctiveCycleCount,
    });
    let rawAI: string | null = null;
    if (result.requiresAI) {
      try {
        const aiResult = await evaluateAmbiguousResponse({
          phase: data.expectedPhase,
          response,
          problemText: String(session.originalQuestion),
          reference: referenceSnapshot.data() as PrivateProblemReference,
          attemptCount: gate.attemptCount + 1,
          correctiveCycleCount: gate.correctiveCycleCount,
        });
        result = aiResult;
        rawAI = aiResult.raw;
      } catch (aiError) {
        await writeAIFailure({ uid: actor.uid, sessionId: data.sessionId, operation: "phase_evaluation", reason: String(aiError), correlationId: id });
        throw callableError(
          "unavailable",
          "evaluation_temporarily_unavailable",
          "MINDGUIDE could not verify this response. Your attempt was not recorded; try again shortly.",
          true,
          id
        );
      }
    }

    const updatedGates = structuredClone(gates);
    updatedGates[data.expectedPhase] = {
      ...gate,
      status: result.evaluation.status,
      attemptCount: result.evaluation.attemptCount,
      correctiveCycleCount: result.evaluation.correctiveCycleCount,
      acceptedAt: result.evaluation.acceptedAt ? Timestamp.fromMillis(result.evaluation.acceptedAt) : null,
    };
    let nextPhase: ReasoningPhase | null = null;
    if (result.evaluation.status === "accepted") {
      nextPhase = nextReasoningPhase(data.expectedPhase);
      if (nextPhase) updatedGates[nextPhase].status = "pending";
    }
    const currentPhase = result.evaluation.status === "accepted"
      ? nextPhase ?? "controlled_solution_release"
      : data.expectedPhase;
    const allowedSupport = mergeSupportLevels(
      supportLevelsFor(updatedGates),
      session.adminAuthorizedSupport
    );
    const consecutiveStrongResponses = result.evaluation.status === "accepted"
      ? Number(session.consecutiveStrongResponses ?? 0) + 1
      : 0;
    const promptAdjustment = result.evaluation.status !== "accepted"
      ? "simplify"
      : consecutiveStrongResponses >= 2 && Number(session.supportUsage ?? 0) <= 1
        ? "deepen"
        : "maintain";
    const now = Date.now();
    const nextPrompt = currentPhase === "controlled_solution_release"
      ? "All reasoning gates are accepted. Complete your final response to generate the scorecard before the worked solution is released."
      : promptForPhase(currentPhase as ReasoningPhase, referenceSnapshot.data() as PrivateProblemReference, promptAdjustment);
    const updatedSession = {
      ...session,
      revision: data.revision + 1,
      currentPhase,
      gateStates: updatedGates,
      gateEvaluations: {
        ...(session.gateEvaluations ?? {}),
        [data.expectedPhase]: result.evaluation,
      },
      diagnosisSummary:
        result.diagnosis.category === "none"
          ? session.diagnosisSummary ?? []
          : [...(session.diagnosisSummary ?? []), result.diagnosis.category].slice(-20),
      allowedSupport,
      currentPrompt: nextPrompt,
      promptAdjustment,
      consecutiveStrongResponses,
      updatedAt: Timestamp.fromMillis(now),
      lastActivityAt: Timestamp.fromMillis(now),
    };
    const responseBody: EvaluatePhaseResponseResponse = {
      session: projectSession(sessionSnapshot.id, updatedSession),
      evaluation: result.evaluation,
      diagnosis: result.diagnosis,
      learnerMessage: result.learnerMessage,
      nextPrompt,
      completion: null,
    };
    const responseRef = sessionRef.collection("responses").doc();
    await database.runTransaction(async (transaction) => {
      const fresh = await transaction.get(sessionRef);
      assertSessionOwner(fresh, actor.uid);
      assertSessionRevision(fresh.data()!, data.revision, data.expectedPhase);
      transaction.update(sessionRef, {
        revision: data.revision + 1,
        currentPhase,
        gateStates: updatedGates,
        gateEvaluations: updatedSession.gateEvaluations,
        diagnosisSummary: updatedSession.diagnosisSummary,
        allowedSupport,
        currentPrompt: nextPrompt,
        promptAdjustment,
        consecutiveStrongResponses,
        updatedAt: FieldValue.serverTimestamp(),
        lastActivityAt: FieldValue.serverTimestamp(),
      });
      transaction.create(responseRef, {
        phase: data.expectedPhase,
        response,
        evaluation: result.evaluation,
        diagnosis: result.diagnosis,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (rawAI) {
        transaction.create(sessionRef.collection("private_ai").doc(responseRef.id), {
          kind: "phase_evaluation",
          phase: data.expectedPhase,
          rawOutput: rawAI,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
        });
      }
      completeIdempotentRequest(transaction, operation!.ref, responseBody);
    });
    return responseBody;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  } finally {
    if (evaluationLock) await releaseEvaluationLock(evaluationLock);
  }
});

export const requestSessionSupport = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<RequestSupportResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(supportRequestSchema, request.data);
    operation = await beginIdempotentRequest<RequestSupportResponse>(actor.uid, "requestSessionSupport", data.requestId);
    if (operation.cached) return operation.cached;
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    const [sessionSnapshot, referenceSnapshot] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("private").doc("reference").get(),
    ]);
    assertSessionOwner(sessionSnapshot, actor.uid);
    const session = sessionSnapshot.data()!;
    if (session.revision !== data.revision) throw staleSessionError();
    if (!isStudentMutationAllowed(session.status, "support")) {
      throw callableError(
        "failed-precondition",
        "support_unavailable",
        "Support is available only while a learning session is in progress."
      );
    }
    const allowed = mergeSupportLevels(
      supportLevelsFor(session.gateStates as GateStateMap),
      session.adminAuthorizedSupport
    );
    if (!allowed.includes(data.requestedLevel)) {
      throw callableError("failed-precondition", "support_locked", "Complete the required reasoning or corrective cycle before requesting this support level.");
    }
    const currentReasoningPhase = REASONING_PHASES.find((phase) => (session.gateStates as GateStateMap)[phase].status !== "accepted") ?? "result_interpretation";
    const content = supportContent(data.requestedLevel, currentReasoningPhase, referenceSnapshot.data() as PrivateProblemReference);
    const updated = { ...session, revision: data.revision + 1, allowedSupport: allowed, supportUsage: Number(session.supportUsage ?? 0) + 1, updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() };
    const response: RequestSupportResponse = { session: projectSession(sessionSnapshot.id, updated), level: data.requestedLevel, ...content };
    await database.runTransaction(async (transaction) => {
      const fresh = await transaction.get(sessionRef);
      assertSessionOwner(fresh, actor.uid);
      if (fresh.get("revision") !== data.revision) throw staleSessionError();
      transaction.update(sessionRef, { revision: data.revision + 1, allowedSupport: allowed, supportUsage: updated.supportUsage, hintsUsed: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() });
      transaction.create(sessionRef.collection("unlock_events").doc(), { level: data.requestedLevel, reason: "Server support policy satisfied.", content, createdAt: FieldValue.serverTimestamp() });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const saveSessionDraft = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<SessionMutationResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(saveDraftSchema, request.data);
    operation = await beginIdempotentRequest<SessionMutationResponse>(actor.uid, "saveSessionDraft", data.requestId);
    if (operation.cached) return operation.cached;
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    const draft = { ...data.draft, answer: normalizeMathResponse(data.draft.answer) };
    let response!: SessionMutationResponse;
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      assertSessionOwner(snapshot, actor.uid);
      if (snapshot.get("revision") !== data.revision) throw staleSessionError();
      if (!isStudentMutationAllowed(snapshot.get("status"), "draft")) throw callableError("failed-precondition", "session_not_editable", "This session can no longer be edited.");
      const updated = { ...snapshot.data()!, draft, revision: data.revision + 1, updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() };
      response = { session: projectSession(snapshot.id, updated) };
      transaction.update(sessionRef, { draft, revision: data.revision + 1, updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const finalizeScorecard = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<SessionMutationResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(revisionedSessionMutationSchema, request.data);
    operation = await beginIdempotentRequest<SessionMutationResponse>(actor.uid, "finalizeScorecard", data.requestId);
    if (operation.cached) return operation.cached;
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    let response!: SessionMutationResponse;
    await database.runTransaction(async (transaction) => {
      const [snapshot, reference] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(sessionRef.collection("private").doc("reference")),
      ]);
      assertSessionOwner(snapshot, actor.uid);
      const session = snapshot.data()!;
      if (Number(session.revision) !== data.revision) throw staleSessionError();
      if (!isStudentMutationAllowed(session.status, "finalize") || session.currentPhase !== "controlled_solution_release") {
        throw callableError(
          "failed-precondition",
          "scorecard_unavailable",
          "Complete the reasoning workflow before generating the scorecard."
        );
      }
      if (!reference.exists || !session.draft) throw callableError("failed-precondition", "draft_or_reference_missing", "Complete and save the draft before generating the scorecard.");
      if (!allGatesAccepted(session.gateStates as GateStateMap)) throw callableError("failed-precondition", "reasoning_incomplete", "All seven reasoning gates must be accepted first.");
      const privateReference = reference.data() as PrivateProblemReference;
      const scorecard = buildScorecard({ draft: session.draft, gates: session.gateStates, reference: privateReference });
      const releasedSolution = buildReleasedSolution(privateReference);
      const updated = { ...session, revision: Number(session.revision) + 1, status: "ready_for_submission", currentPhase: "critical_thinking_scorecard", currentStep: "review", currentPrompt: "Review your scorecard and compare your work with the released solution before submitting the learning record.", scorecard, releasedSolution, mindGuideScorecard: legacyScorecard(scorecard), ctScore: scorecard.total, learningCompletedAt: Timestamp.now(), updatedAt: Timestamp.now() };
      response = {
        session: projectSession(snapshot.id, updated),
        completion: { scorecard, releasedSolution },
      };
      transaction.update(sessionRef, { revision: updated.revision, status: updated.status, currentPhase: updated.currentPhase, currentStep: updated.currentStep, currentPrompt: updated.currentPrompt, scorecard, releasedSolution, mindGuideScorecard: updated.mindGuideScorecard, ctScore: scorecard.total, learningCompletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.set(sessionRef.collection("scorecards").doc("final"), { ...scorecard, createdAt: FieldValue.serverTimestamp() });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const submitLearningSession = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<SessionMutationResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(revisionedSessionMutationSchema, request.data);
    operation = await beginIdempotentRequest<SessionMutationResponse>(actor.uid, "submitLearningSession", data.requestId);
    if (operation.cached) return operation.cached;
    const adminSnapshots = await database.collection("users").where("role", "==", "admin").where("status", "==", "active").get();
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    const currentSnapshot = await sessionRef.get();
    assertSessionOwner(currentSnapshot, actor.uid);
    const currentData = currentSnapshot.data()!;
    const recentSnapshot = await database
      .collection("sessions")
      .where("studentId", "==", actor.uid)
      .orderBy("updatedAt", "desc")
      .limit(10)
      .get();
    const recentTopicSessions = [
      currentData,
      ...recentSnapshot.docs
        .filter((document) => document.id !== data.sessionId)
        .map((document) => document.data())
        .filter((candidate) => candidate.topic === currentData.topic && candidate.scorecard),
    ].slice(0, 2);
    const difficultyRecommendation = recommendDifficulty({
      currentDifficulty: currentData.difficulty,
      recentSessions: recentTopicSessions.map((candidate) => ({
        score: Number(candidate.scorecard?.total ?? 0),
        supportUsage: Number(candidate.supportUsage ?? candidate.hintsUsed ?? 0),
        diagnoses: candidate.diagnosisSummary ?? [],
      })),
    });
    const progressRef = database.doc(`learning_progress/${actor.uid}`);
    let response!: SessionMutationResponse;
    await database.runTransaction(async (transaction) => {
      const [snapshot, progressSnapshot] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(progressRef),
      ]);
      assertSessionOwner(snapshot, actor.uid);
      const session = snapshot.data()!;
      if (Number(session.revision) !== data.revision) throw staleSessionError();
      if (!isStudentMutationAllowed(session.status, "submit") || !session.scorecard) throw callableError("failed-precondition", "session_not_ready", "Complete the scorecard before submitting.");
      if (session.statsCommittedAt) {
        throw callableError("failed-precondition", "statistics_already_committed", "This session was already submitted.");
      }
      const updated = { ...session, revision: Number(session.revision) + 1, status: "submitted", currentStep: "confirmation", difficultyRecommendation, submittedAt: Timestamp.now(), statsCommittedAt: Timestamp.now(), updatedAt: Timestamp.now() };
      response = { session: projectSession(snapshot.id, updated) };
      transaction.update(sessionRef, { revision: updated.revision, status: "submitted", currentStep: "confirmation", difficultyRecommendation, submittedAt: FieldValue.serverTimestamp(), statsCommittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      const progress = nextLearningProgress(actor.uid, progressSnapshot.data(), Number(session.scorecard.total), Timestamp.now());
      transaction.set(progressRef, {
        userId: actor.uid,
        sessionsCompleted: progress.sessionsCompleted,
        scoreTotal: progress.scoreTotal,
        averageCTScore: progress.averageCTScore,
        currentStreak: progress.currentStreak,
        lastSessionDate: progress.lastSessionDate,
        topicRecommendations: {
          ...progress.topicRecommendations,
          [slugKey(String(session.topic))]: difficultyRecommendation,
        },
        lastSessionAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      for (const admin of adminSnapshots.docs) {
        transaction.set(database.doc(`notifications/session_submitted__${snapshot.id}__${admin.id}`), {
          eventType: "session_submitted", senderId: actor.uid, recipientId: admin.id, sessionId: snapshot.id,
          title: "New learner session", message: `${session.studentName} submitted a ${session.topic} session.`,
          actionUrl: `/admin/review/${snapshot.id}`, read: false, createdAt: FieldValue.serverTimestamp(),
        });
      }
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const createFollowUpSession = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<SessionMutationResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(sessionMutationSchema, request.data);
    operation = await beginIdempotentRequest<SessionMutationResponse>(actor.uid, "createFollowUpSession", data.requestId);
    if (operation.cached) return operation.cached;
    const parentRef = database.doc(`sessions/${data.sessionId}`);
    const childRef = database.collection("sessions").doc();
    let response!: SessionMutationResponse;
    await database.runTransaction(async (transaction) => {
      const [parent, reference] = await Promise.all([
        transaction.get(parentRef),
        transaction.get(parentRef.collection("private").doc("reference")),
      ]);
      assertSessionOwner(parent, actor.uid);
      if (!isStudentMutationAllowed(parent.get("status"), "follow_up") || parent.get("followUpSessionId")) throw callableError("failed-precondition", "follow_up_unavailable", "This returned session already has a follow-up or is not eligible.");
      const now = Timestamp.now();
      const child = {
        ...pickSessionProblem(parent.data()!), schemaVersion: SCHEMA_VERSION, workflowVersion: WORKFLOW_VERSION, revision: 0,
        studentId: actor.uid, studentName: parent.get("studentName"), status: "in_progress", currentPhase: "problem_understanding",
        currentPrompt: promptForPhase("problem_understanding", reference.data() as PrivateProblemReference),
        gateStates: initialGateStates(), gateEvaluations: {}, diagnosisSummary: [], allowedSupport: ["socratic_prompt"], supportUsage: 0, draft: null, scorecard: null, releasedSolution: null,
        adaptiveRecommendation: parent.get("difficultyRecommendation") ?? parent.get("adaptiveRecommendation") ?? null,
        promptAdjustment: "maintain", consecutiveStrongResponses: 0,
        parentSessionId: parent.id, followUpSessionId: null, createdAt: now, updatedAt: now, lastActivityAt: now,
        learningCompletedAt: null, submittedAt: null, reviewedAt: null, adminReview: null, statsCommittedAt: null,
        currentStep: "questioning", completedPhases: [], ctScore: 0, messages: [], phaseResponses: [], correctivePrompts: [], logicMap: [], hints: [], hintsUsed: 0,
        diagnosisResult: null, detectedMisconception: null, unlockLevel: 0, mindGuideScorecard: null, aiFallbackEvents: [],
      };
      response = { session: projectSession(childRef.id, child) };
      transaction.create(childRef, child);
      transaction.create(childRef.collection("private").doc("reference"), reference.data()!);
      transaction.update(parentRef, { followUpSessionId: childRef.id, updatedAt: FieldValue.serverTimestamp() });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

export const abandonLearningSession = onCall(callableOptions, async (request) => {
  const id = correlationId();
  let operation: Awaited<ReturnType<typeof beginIdempotentRequest<SessionMutationResponse>>> | undefined;
  try {
    const actor = await requireActor(request);
    const data = parseInput(sessionMutationSchema, request.data);
    operation = await beginIdempotentRequest<SessionMutationResponse>(actor.uid, "abandonLearningSession", data.requestId);
    if (operation.cached) return operation.cached;
    const sessionRef = database.doc(`sessions/${data.sessionId}`);
    let response!: SessionMutationResponse;
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      assertSessionOwner(snapshot, actor.uid);
      if (!isStudentMutationAllowed(snapshot.get("status"), "abandon")) {
        throw callableError("failed-precondition", "session_not_abandonable", "This session can no longer be abandoned.");
      }
      const updated = {
        ...snapshot.data()!,
        revision: Number(snapshot.get("revision") ?? 0) + 1,
        status: "abandoned",
        abandonedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      response = { session: projectSession(snapshot.id, updated) };
      transaction.update(sessionRef, {
        revision: updated.revision,
        status: "abandoned",
        abandonedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      completeIdempotentRequest(transaction, operation!.ref, response);
    });
    return response;
  } catch (error) {
    if (operation?.ref && !operation.cached) await releaseIdempotentRequest(operation.ref);
    throw asCallableError(error, id);
  }
});

function assertSessionOwner(snapshot: FirebaseFirestore.DocumentSnapshot, uid: string): void {
  if (!snapshot.exists) throw callableError("not-found", "session_not_found", "The learning session was not found.");
  if (snapshot.get("studentId") !== uid) throw callableError("permission-denied", "session_forbidden", "You cannot access this learning session.");
}

function assertSessionRevision(session: Record<string, any>, revision: number, phase: ReasoningPhase): void {
  if (session.revision !== revision) throw staleSessionError();
  if (session.status !== "in_progress" || session.currentPhase !== phase) {
    throw callableError("failed-precondition", "phase_locked", "Reload the session and continue from the current approved stage.");
  }
}

function staleSessionError() {
  return callableError("aborted", "stale_session", "This session changed in another request. Reload it before continuing.", true);
}

function allGatesAccepted(gates: GateStateMap): boolean {
  return REASONING_PHASES.every((phase) => gates[phase]?.status === "accepted");
}

function projectSession(id: string, session: Record<string, any>): SessionProjection {
  const currentPhase = session.currentPhase as SessionProjection["currentPhase"];
  const currentInternalGate = REASONING_PHASES.includes(currentPhase as ReasoningPhase)
    ? currentPhase as ReasoningPhase
    : null;
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    workflowVersion: WORKFLOW_VERSION,
    revision: Number(session.revision ?? 0),
    studentId: String(session.studentId),
    subject: session.subject,
    topic: String(session.topic),
    difficulty: session.difficulty,
    problemId: session.problemId ?? null,
    originalQuestion: String(session.originalQuestion),
    status: session.status,
    currentPhase,
    currentStage: solverStageForPhase(currentPhase),
    currentInternalGate,
    currentPrompt: String(session.currentPrompt ?? fallbackPrompt(currentInternalGate)),
    stageProgress: projectStageProgress(session.gateStates ?? {}, currentPhase),
    gates: session.gateEvaluations ?? {},
    allowedSupport: session.allowedSupport ?? ["socratic_prompt"],
    draft: session.draft ?? null,
    scorecard: session.scorecard ?? null,
    releasedSolution: session.releasedSolution ?? null,
    adaptiveRecommendation: session.adaptiveRecommendation ?? session.difficultyRecommendation ?? null,
    promptAdjustment: session.promptAdjustment ?? "maintain",
    createdAt: millis(session.createdAt),
    updatedAt: millis(session.updatedAt),
    learningCompletedAt: session.learningCompletedAt ? millis(session.learningCompletedAt) : null,
  };
}

function projectStageProgress(
  gates: Partial<GateStateMap>,
  currentPhase: SessionProjection["currentPhase"]
): Record<SolverStage, SolverStageProgress> {
  const activeStage = solverStageForPhase(currentPhase);
  return Object.fromEntries(SOLVER_STAGES.map((stage) => {
    const phases = SOLVER_STAGE_PHASES[stage];
    const acceptedGates = phases.filter((phase) => gates[phase]?.status === "accepted").length;
    const completed = acceptedGates === phases.length;
    return [stage, {
      stage,
      acceptedGates,
      totalGates: phases.length,
      status: completed ? "completed" : stage === activeStage ? "active" : "locked",
    } satisfies SolverStageProgress];
  })) as Record<SolverStage, SolverStageProgress>;
}

function fallbackPrompt(phase: ReasoningPhase | null): string {
  if (!phase) return "Review your completed reasoning and scorecard.";
  return phase.replaceAll("_", " ");
}

function millis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) return (value as Timestamp).toMillis();
  return typeof value === "number" ? value : Date.now();
}

async function requireCurrentConsent(uid: string): Promise<void> {
  const notice = await readCurrentConsentNotice();
  const consent = await database.doc(`users/${uid}/consents/${notice.version}`).get();
  if (!consent.exists) throw callableError("failed-precondition", "consent_required", "Review and acknowledge the current privacy and responsible-AI notice before starting a session.");
}

async function readCurrentConsentNotice(): Promise<GetCurrentConsentNoticeResponse> {
  const privacy = await database.doc("system_settings/privacy").get();
  const version = String(privacy.get("currentConsentVersion") ?? CURRENT_CONSENT_VERSION);
  const policy = await database.doc(`policy_documents/${version}`).get();
  if (!policy.exists || policy.get("status") !== "active") {
    throw callableError(
      "failed-precondition",
      "consent_policy_unavailable",
      "The current privacy notice is not configured correctly. Contact a system administrator."
    );
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    version,
    title: String(policy.get("title") ?? "MINDGUIDE Privacy and Responsible AI Notice"),
    summary: String(policy.get("summary") ?? ""),
    collectedData: strings(policy.get("collectedData")),
    purpose: String(policy.get("purpose") ?? ""),
    retention: String(policy.get("retention") ?? ""),
  };
}

function nextLearningProgress(
  uid: string,
  current: Record<string, unknown> | undefined,
  score: number,
  submittedAt: Timestamp
): LearningProgress {
  const sessionsCompleted = Number(current?.sessionsCompleted ?? 0) + 1;
  const scoreTotal = Number(current?.scoreTotal ?? 0) + score;
  const dateKey = manilaDateKey(submittedAt.toDate());
  const previousDate = typeof current?.lastSessionDate === "string" ? current.lastSessionDate : null;
  const previousStreak = Number(current?.currentStreak ?? 0);
  const currentStreak = previousDate === dateKey
    ? Math.max(previousStreak, 1)
    : previousDate === previousDateKey(dateKey)
      ? previousStreak + 1
      : 1;
  return {
    userId: uid,
    sessionsCompleted,
    scoreTotal,
    averageCTScore: Math.round(scoreTotal / sessionsCompleted),
    currentStreak,
    lastSessionAt: submittedAt.toMillis(),
    lastSessionDate: dateKey,
    topicRecommendations: (current?.topicRecommendations as Record<string, unknown> | undefined) ?? {},
  };
}

function manilaDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function writeAIFailure(value: Record<string, unknown>): Promise<void> {
  await database.collection("ai_failure_logs").add({ ...value, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000) });
}

async function selectAdaptiveProblem(options: {
  uid: string;
  requestedProblemId?: string;
  requestedSubject?: string;
  requestedTopic?: string;
}): Promise<{
  problem: FirebaseFirestore.QueryDocumentSnapshot;
  recommendation: AdaptiveRecommendation;
}> {
  const requested = options.requestedProblemId
    ? await database.doc(`problems/${options.requestedProblemId}`).get()
    : null;
  const subject = options.requestedSubject ?? requested?.get("subject");
  const topic = options.requestedTopic ?? requested?.get("topic");
  if (!subject || !topic) {
    throw callableError("invalid-argument", "problem_context_required", "Choose a prepared problem topic before starting.");
  }

  const recentSnapshot = await database
    .collection("sessions")
    .where("studentId", "==", options.uid)
    .orderBy("updatedAt", "desc")
    .limit(30)
    .get();
  const recentTopicSessions = recentSnapshot.docs
    .filter((document) => document.get("topic") === topic && document.get("scorecard"))
    .slice(0, 2);
  const currentDifficulty = (recentTopicSessions[0]?.get("difficulty") ?? "Basic") as Difficulty;
  const recommendation = recentTopicSessions.length === 0
    ? {
        recommendedDifficulty: "Basic" as const,
        reason: "No completed session exists for this topic, so adaptive practice begins at Basic.",
        confidence: "low" as const,
      }
    : recommendDifficulty({
        currentDifficulty,
        recentSessions: recentTopicSessions.map((document) => ({
          score: Number(document.get("scorecard")?.total ?? 0),
          supportUsage: Number(document.get("supportUsage") ?? document.get("hintsUsed") ?? 0),
          diagnoses: Array.isArray(document.get("diagnosisSummary")) ? document.get("diagnosisSummary") : [],
        })),
      });

  const exact = await database.collection("problems")
    .where("status", "==", "approved")
    .where("subject", "==", subject)
    .where("topic", "==", topic)
    .where("difficulty", "==", recommendation.recommendedDifficulty)
    .get();
  let candidates = exact.docs;
  if (candidates.length === 0) {
    const allTopicProblems = await database.collection("problems")
      .where("status", "==", "approved")
      .where("subject", "==", subject)
      .where("topic", "==", topic)
      .get();
    const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
    const target = levels.indexOf(recommendation.recommendedDifficulty);
    candidates = allTopicProblems.docs
      .sort((first, second) => {
        const firstDistance = Math.abs(levels.indexOf(first.get("difficulty")) - target);
        const secondDistance = Math.abs(levels.indexOf(second.get("difficulty")) - target);
        return firstDistance - secondDistance || first.id.localeCompare(second.id);
      });
  }
  if (candidates.length === 0) {
    throw callableError("not-found", "problem_unavailable", "No approved prepared problem is available for this topic.");
  }

  const lastUsed = new Map<string, number>();
  recentSnapshot.docs.forEach((document) => {
    const problemId = document.get("problemId");
    if (typeof problemId !== "string" || lastUsed.has(problemId)) return;
    lastUsed.set(problemId, millis(document.get("updatedAt")));
  });
  candidates.sort((first, second) =>
    (lastUsed.get(first.id) ?? 0) - (lastUsed.get(second.id) ?? 0) || first.id.localeCompare(second.id)
  );
  const problem = candidates[0];
  const selectedDifficulty = problem.get("difficulty") as Difficulty;
  return {
    problem,
    recommendation: selectedDifficulty === recommendation.recommendedDifficulty
      ? recommendation
      : {
          ...recommendation,
          recommendedDifficulty: selectedDifficulty,
          reason: `${recommendation.reason} The nearest available approved tier is ${selectedDifficulty}.`,
        },
  };
}

function pickSessionProblem(session: Record<string, any>) {
  return {
    subject: session.subject,
    topic: session.topic,
    difficulty: session.difficulty,
    problemId: session.problemId ?? null,
    selectedProblemId: session.selectedProblemId ?? session.problemId ?? null,
    problemMode: session.problemMode,
    originalQuestion: session.originalQuestion,
    problemContext: session.problemContext ?? {
      mode: session.problemMode,
      problemId: session.problemId ?? null,
      promptSnapshot: session.originalQuestion,
    },
  };
}

function legacyScorecard(scorecard: import("@mindguide/contracts").ScorecardResult) {
  return {
    accuracy: scorecard.criteria.accuracy.score,
    logicalValidity: scorecard.criteria.logicalValidity.score,
    methodSelection: scorecard.criteria.methodSelection.score,
    explanationQuality: scorecard.criteria.explanationQuality.score,
    total: scorecard.total,
    feedback: scorecard.feedback,
  };
}

function slugKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function mergeSupportLevels(policy: SupportLevel[], _overrides: unknown): SupportLevel[] {
  // Administrator exceptions are recorded for post-score review only. They do
  // not bypass the learner-side score-before-reveal sequence.
  return [...new Set(policy)];
}

export type StudentMutation = "reasoning" | "support" | "draft" | "finalize" | "submit" | "abandon" | "follow_up";

export function isStudentMutationAllowed(status: unknown, operation: StudentMutation): boolean {
  if (status === "in_progress") {
    return ["reasoning", "support", "draft", "finalize", "abandon"].includes(operation);
  }
  if (status === "ready_for_submission") return operation === "submit" || operation === "abandon";
  if (status === "returned") return operation === "follow_up";
  return false;
}
