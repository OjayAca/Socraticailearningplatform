import { collection, doc, getDoc, getDocs, query, where, runTransaction, serverTimestamp, Timestamp, type DocumentData, type Transaction } from "firebase/firestore";
import { REASONING_PHASES, SCHEMA_VERSION, WORKFLOW_VERSION, type GetCurrentConsentNoticeResponse, type LearningCatalog, type ReasoningPhase, type StartLearningSessionInput, type Difficulty } from "@mindguide/contracts";
import { currentUser, database, ownSessions, millis, topicKey } from "./firestore-client";
import { adaptiveDifficulty, selectUnanswered, type AccuracyEvidence } from "./learning/adaptive";
import { initialGateStates, evaluateDeterministically, nextReasoningPhase, promptForPhase, supportContent, supportLevelsFor, buildScorecard, buildReleasedSolution, type PrivateProblemReference } from "./learning/workflow";
import { nextLearningProgress } from "./learning/session-state";
import { projectSession } from "./learning/projection";
import { normalizeMathResponse } from "./learning/math";
import { checkAnswer } from "./learning/answers";
import { verifiedConfirmation, solveVerifiedProblem } from "./learning/verified-problems";
import { sessionLifecycleAction } from "./learning/lifecycle";

const missingReference = "Validated scoring material is unavailable for this question. Contact an administrator.";

async function checkActivity(sessionId: string) {
  const db = database();
  const uid = currentUser().uid;
  const settings = await getDoc(doc(db, "system_settings", "privacy"));
  const ref = doc(db, "sessions", sessionId);
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.get("studentId") !== uid) throw new Error("This learning session is unavailable.");
    if (!["in_progress", "ready_for_submission"].includes(snapshot.get("status"))) return;
    const action = sessionLifecycleAction({ lastActivityAt: millis(snapshot.get("lastActivityAt") ?? snapshot.get("updatedAt")), now: Date.now(), inactivityHours: Number(settings.get("sessionInactivityHours") ?? 24), reminderAlreadySent: false });
    if (action !== "expire") return;
    const stateRef = doc(db, "learning_progress", uid, "assignment_state", snapshot.get("topicId"));
    const state = await tx.get(stateRef);
    tx.update(ref, { status: "expired", revision: Number(snapshot.get("revision") ?? 0) + 1, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
    if (state.get("activeSessionId") === sessionId) tx.set(stateRef, { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true });
  });
  return {};
}

async function consentNotice(): Promise<GetCurrentConsentNoticeResponse> {
  const settings = await getDoc(doc(database(), "system_settings", "privacy"));
  const version = settings.get("currentConsentVersion") ?? "privacy-2026-07-18";
  const policy = await getDoc(doc(database(), "policy_documents", version));
  if (!policy.exists() || policy.get("status") !== "active") throw new Error("The current privacy notice is not configured. Contact an administrator.");
  const data = policy.data();
  return { version, title: data.title ?? "Privacy notice", summary: data.summary ?? "", collectedData: data.collectedData ?? [], purpose: data.purpose ?? "", retention: data.retention ?? "" };
}

async function bootstrap(input: any) {
  const user = currentUser();
  if (!input.displayName?.trim() || input.displayName.length > 120) throw new Error("Enter a name of 1–120 characters.");
  if (input.consentVersion && (await consentNotice()).version !== input.consentVersion) throw new Error("The privacy notice changed. Reload before acknowledging it.");
  const ref = doc(database(), "users", user.uid);
  await runTransaction(database(), async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) tx.set(ref, {
      schemaVersion: SCHEMA_VERSION, displayName: input.displayName.trim(), email: user.email,
      role: "student", status: "active", preferences: { liveAlertPopups: true },
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    else tx.update(ref, { displayName: input.displayName.trim(), preferences: snapshot.get("preferences") ?? { liveAlertPopups: true }, updatedAt: serverTimestamp() });
    if (input.consentVersion) tx.set(doc(database(), "users", user.uid, "consents", input.consentVersion), {
      version: input.consentVersion, acknowledgedAt: serverTimestamp(), source: "web",
    });
  });
  return { profile: (await getDoc(ref)).data() };
}

async function catalog(): Promise<LearningCatalog> {
  try {
    const [subjects, topics] = await Promise.all(["subjects", "topics"].map(name => getDocs(query(collection(database(), name), where("status", "==", "approved")))));
    return { subjects: subjects.docs.map(item => ({ ...item.data(), id: item.id })), topics: topics.docs.map(item => ({ ...item.data(), id: item.id, ready: true })), generatedAt: Date.now() } as LearningCatalog;
  } catch { throw new Error("Unable to load learning materials."); }
}

async function referenceFor(session: DocumentData, id: string): Promise<PrivateProblemReference> {
  if (session.problemMode === "free_form") return solveVerifiedProblem(verifiedConfirmation(session.originalQuestion, session.topic).givens);
  const pinned = await getDoc(doc(database(), "sessions", id, "practice_reference", "reference"));
  if (pinned.exists()) return pinned.data() as PrivateProblemReference;
  const reference = await getDoc(doc(database(), "problem_scoring", session.problemId));
  if (!reference.exists() || !reference.get("answerSpecification")) throw new Error(missingReference);
  return reference.data() as PrivateProblemReference;
}

async function historyEvidence(sessions: DocumentData[]): Promise<{ answered: Set<string>; evidence: AccuracyEvidence[] }> {
  const answered = new Set<string>();
  const evidence: AccuracyEvidence[] = [];
  for (const session of sessions) {
    // Older sessions may have responses without responseCount. Inspect their saved work too.
    const responses = await getDocs(collection(database(), "sessions", session.id, "responses"));
    if (responses.size || session.responseCount > 0 || session.phaseResponses?.length || session.statsCommittedAt) {
      const problemId = session.problemId ?? session.selectedProblemId ?? session.problemContext?.problemId;
      if (problemId) answered.add(problemId);
    }
    if (!session.statsCommittedAt) continue;
    let correct = session.firstAnswerCorrect;
    if (typeof correct !== "boolean") {
      const first = responses.docs.map(item => item.data()).filter(item => item.phase === "guided_computation_or_proof")
        .sort((a, b) => millis(a.createdAt) - millis(b.createdAt))[0];
      if (first?.evaluation?.confidence === "high") correct = first.evaluation.status === "accepted";
    }
    if (typeof correct === "boolean") evidence.push({ sessionId: session.id, correct, completedAt: millis(session.submittedAt) });
  }
  return { answered, evidence };
}

async function start(input: StartLearningSessionInput & { requestId: string }) {
  const user = currentUser();
  const db = database();
  const [topic, profile, notice, sessions] = await Promise.all([
    getDoc(doc(db, "topics", input.topicId)), getDoc(doc(db, "users", user.uid)), consentNotice(), ownSessions(),
  ]);
  if (!topic.exists() || topic.get("status") !== "approved") throw new Error("This topic is no longer approved.");
  if (!(await getDoc(doc(db, "users", user.uid, "consents", notice.version))).exists()) throw new Error("Acknowledge the current privacy notice before starting.");
  const subject = await getDoc(doc(db, "subjects", topic.get("subjectId")));
  if (!subject.exists()) throw new Error("The topic subject is unavailable.");
  const topicSessions = sessions.filter(item => item.topicId === input.topicId || (!item.topicId && item.topic === topic.get("name") && item.subject === subject.get("name")));
  for (const session of topicSessions.filter(item => ["in_progress", "ready_for_submission"].includes(item.status))) await checkActivity(session.id);
  const history = await historyEvidence(topicSessions);
  const stateRef = doc(db, "learning_progress", user.uid, "assignment_state", input.topicId);
  const currentDifficulty = topicSessions.filter(item => item.statsCommittedAt).sort((a, b) => millis(b.submittedAt) - millis(a.submittedAt))[0]?.difficulty ?? "Basic";
  const recommendation = adaptiveDifficulty(currentDifficulty, history.evidence);
  const candidates: DocumentData[] = [];
  let freeReference: PrivateProblemReference | undefined;
  if (input.mode === "curated") {
    const result = await getDocs(query(collection(db, "problems"), where("status", "==", "approved"), where("topicId", "==", input.topicId), where("difficulty", "==", recommendation.recommendedDifficulty)));
    let unavailable = false;
    for (const item of result.docs) {
      if (!item.get("validationRecordId") || history.answered.has(item.id)) continue;
      const ref = await getDoc(doc(db, "problem_scoring", item.id));
      if (!ref.exists() || !ref.get("answerSpecification") || ref.get("validationRecordId") !== item.get("validationRecordId") || ref.get("problemVersion") !== item.get("version")) { unavailable = true; continue; }
      candidates.push({ ...item.data(), id: item.id, reference: ref.data() });
    }
    if (!candidates.length && unavailable) throw new Error(missingReference);
  } else {
    const preview = verifiedConfirmation(input.question, topic.get("name"));
    if (preview.confirmationHash !== input.confirmationHash) throw new Error("Confirm the problem givens again before starting.");
    freeReference = solveVerifiedProblem(preview.givens);
  }
  const sessionRef = doc(db, "sessions", `${user.uid}_${input.requestId}`);
  return runTransaction(db, async tx => {
    const [existing, state] = await Promise.all([tx.get(sessionRef), tx.get(stateRef)]);
    if (existing.exists()) return { session: projectSession(existing.id, existing.data()) };
    if (state.get("activeSessionId")) {
      const active = await tx.get(doc(db, "sessions", state.get("activeSessionId")));
      if (active.exists() && ["in_progress", "ready_for_submission"].includes(active.get("status"))) return { session: projectSession(active.id, active.data()) };
    }
    const excluded = new Set<string>([...history.answered, ...(state.get("answeredProblemIds") ?? [])]);
    const selected = input.mode === "curated" ? selectUnanswered(candidates as (DocumentData & { id: string })[], excluded) : null;
    if (input.mode === "curated" && !selected) throw new Error("No available questions for this topic and difficulty.");
    if (selected) {
      const currentProblem = await tx.get(doc(db, "problems", selected.id));
      const currentReference = await tx.get(doc(db, "problem_scoring", selected.id));
      if (currentProblem.get("status") !== "approved" || currentProblem.get("version") !== selected.version || currentProblem.get("validationRecordId") !== selected.validationRecordId || !currentReference.exists() || currentReference.get("validationRecordId") !== selected.validationRecordId) throw new Error("This question changed while it was being assigned. Try starting again.");
    }
    const reference = freeReference ?? selected!.reference as PrivateProblemReference;
    const now = Timestamp.now();
    const data = {
      schemaVersion: SCHEMA_VERSION, workflowVersion: WORKFLOW_VERSION, revision: 0, scoringSource: "client_practice",
      studentId: user.uid, studentName: profile.get("displayName") ?? "Learner", subjectId: topic.get("subjectId"),
      subject: topic.get("subject") ?? subject.get("name"), topicId: topic.id, topic: topic.get("name"),
      difficulty: input.mode === "curated" ? recommendation.recommendedDifficulty : input.requestedDifficulty,
      problemId: selected?.id ?? null, problemMode: input.mode,
      originalQuestion: input.mode === "curated" ? selected!.problemText : input.question,
      status: "in_progress", currentPhase: REASONING_PHASES[0], currentStep: "questioning",
      currentPrompt: promptForPhase(REASONING_PHASES[0], reference), gateStates: initialGateStates(), gateEvaluations: {},
      diagnosisSummary: [], allowedSupport: ["socratic_prompt"], supportUsage: 0, responseCount: 0,
      draft: null, scorecard: null, releasedSolution: null, adaptiveRecommendation: recommendation,
      configurationVersions: null, promptAdjustment: "maintain", firstAnswerCorrect: null,
      createdAt: now, updatedAt: now, lastActivityAt: now, learningCompletedAt: null, submittedAt: null, statsCommittedAt: null,
    };
    tx.set(doc(db, "sessions", sessionRef.id, "practice_reference", "reference"), reference);
    tx.set(sessionRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
    tx.set(stateRef, { activeSessionId: sessionRef.id, answeredProblemIds: [...excluded], accuracyEvidence: history.evidence.sort((a,b) => b.completedAt - a.completedAt).slice(0,5), updatedAt: serverTimestamp() }, { merge: true });
    return { session: projectSession(sessionRef.id, data) };
  });
}

async function mutate(name: string, input: any) {
  const user = currentUser();
  const db = database();
  const sessionRef = doc(db, "sessions", input.sessionId);
  const before = await getDoc(sessionRef);
  if (!before.exists() || before.get("studentId") !== user.uid) throw new Error("This learning session is unavailable.");
  const needsReference = ["evaluatePhaseResponse", "requestSessionSupport", "finalizeScorecard"].includes(name);
  const reference = needsReference ? await referenceFor(before.data(), input.sessionId) : null;
  const savedResponses = name === "finalizeScorecard" ? await getDocs(collection(db, "sessions", input.sessionId, "responses")) : null;
  const operationRef = doc(db, "users", user.uid, "operations", input.requestId);
  return runTransaction(db, async tx => {
    const [snapshot, operation] = await Promise.all([tx.get(sessionRef), tx.get(operationRef)]);
    if (operation.exists()) {
      if (operation.get("name") !== name || operation.get("sessionId") !== input.sessionId) throw new Error("This operation belongs to another request.");
      return operation.get("result");
    }
    const session = snapshot.data()!;
    if (session.studentId !== currentUser().uid) throw new Error("The signed-in account changed. Reload the session.");
    if (input.revision !== undefined && session.revision !== input.revision) throw new Error("This session changed in another request. Reload it before continuing.");
    if (!["in_progress", "ready_for_submission"].includes(session.status)) throw new Error("This session is already closed.");
    const updates: DocumentData = { revision: session.revision + 1, updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now() };
    const extra: DocumentData = {};
    const stateRef = doc(db, "learning_progress", user.uid, "assignment_state", session.topicId);
    const state = await tx.get(stateRef);
    if (name === "evaluatePhaseResponse") {
      if (session.status !== "in_progress" || session.currentPhase !== input.expectedPhase) throw new Error("Continue from the current learning phase.");
      const phase = input.expectedPhase as ReasoningPhase;
      const response = normalizeMathResponse(input.response);
      const gate = session.gateStates[phase];
      const result = evaluateDeterministically({ phase, response, problemText: session.originalQuestion, reference: reference!, attemptCount: gate.attemptCount + 1, correctiveCycleCount: gate.correctiveCycleCount });
      const evaluation = result.evaluation;
      const gates = { ...session.gateStates, [phase]: { ...gate, ...evaluation, acceptedAt: evaluation.acceptedAt ? Timestamp.fromMillis(evaluation.acceptedAt) : null } };
      const next = evaluation.status === "accepted" ? nextReasoningPhase(phase) : phase;
      if (next && evaluation.status === "accepted") gates[next] = { ...gates[next], status: "pending" };
      Object.assign(updates, { gateStates: gates, gateEvaluations: { ...session.gateEvaluations, [phase]: evaluation },
        currentPhase: next ?? "controlled_solution_release", currentPrompt: next ? promptForPhase(next, reference!) : "Complete your answer, methodology, and reflection.",
        allowedSupport: supportLevelsFor(gates), responseCount: (session.responseCount ?? 0) + 1, lastDiagnosis: result.diagnosis,
        diagnosisSummary: [...new Set([...(session.diagnosisSummary ?? []), result.diagnosis.category])],
      });
      if (phase === "guided_computation_or_proof" && typeof session.firstAnswerCorrect !== "boolean") updates.firstAnswerCorrect = reference!.answerSpecification ? checkAnswer(response, reference!.answerSpecification) : null;
      tx.set(doc(db, "sessions", input.sessionId, "responses", input.requestId), { phase, response, evaluation, diagnosis: result.diagnosis, studentId: user.uid, createdAt: serverTimestamp() });
      if (session.problemId) tx.set(stateRef, { answeredProblemIds: [...new Set([...(state.get("answeredProblemIds") ?? []), session.problemId])], updatedAt: serverTimestamp() }, { merge: true });
      Object.assign(extra, { evaluation, diagnosis: result.diagnosis, learnerMessage: result.learnerMessage, nextPrompt: updates.currentPrompt, completion: null });
    } else if (name === "requestSessionSupport") {
      if (!session.allowedSupport.includes(input.requestedLevel)) throw new Error("This support level is not available yet.");
      const support = supportContent(input.requestedLevel, session.currentPhase, reference!);
      updates.supportUsage = (session.supportUsage ?? 0) + 1;
      updates.supportHistory = [...(session.supportHistory ?? []), { phase: session.currentPhase, level: input.requestedLevel, ...support }];
      Object.assign(extra, { level: input.requestedLevel, ...support });
    } else if (name === "saveSessionDraft") {
      if (!REASONING_PHASES.every(phase => session.gateStates[phase]?.status === "accepted") || session.scorecard) throw new Error("Complete the guided learning phases before saving the final draft.");
      updates.draft = { answer: normalizeMathResponse(input.draft.answer), methodology: String(input.draft.methodology).slice(0, 8000), reflection: String(input.draft.reflection).slice(0, 8000) };
    } else if (name === "finalizeScorecard") {
      if (!session.draft || !REASONING_PHASES.every(phase => session.gateStates[phase]?.status === "accepted")) throw new Error("Complete the reasoning and save your final draft first.");
      const responses = savedResponses!.docs.map(item => ({ id: item.id, phase: item.get("phase"), text: item.get("response.plainText") ?? "", accepted: item.get("evaluation.status") === "accepted" }));
      updates.scorecard = buildScorecard({ draft: session.draft, gates: session.gateStates, reference: reference!, responses, assistanceCount: session.supportUsage });
      updates.releasedSolution = buildReleasedSolution(reference!);
      Object.assign(updates, { status: "ready_for_submission", currentPhase: "critical_thinking_scorecard", currentStep: "scorecard", learningCompletedAt: Timestamp.now(), allowedSupport: [] });
      extra.completion = { scorecard: updates.scorecard, releasedSolution: updates.releasedSolution };
      tx.set(doc(db, "sessions", input.sessionId, "scorecards", input.requestId), { ...updates.scorecard, studentId: user.uid, createdAt: serverTimestamp() });
    } else if (name === "submitLearningSession") {
      if (session.status !== "ready_for_submission" || !session.scorecard || session.statsCommittedAt) throw new Error("Finalize the scorecard before submitting.");
      await complete(tx, session, input.sessionId, updates, state.get("accuracyEvidence") ?? []);
      tx.set(stateRef, { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true });
    } else if (name === "abandonLearningSession") {
      updates.status = "abandoned";
      tx.set(stateRef, { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true });
    } else throw new Error(`Unsupported learning operation: ${name}`);
    const result = { session: projectSession(input.sessionId, { ...session, ...updates }), ...extra };
    tx.update(sessionRef, { ...updates, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp() });
    tx.set(operationRef, { name, sessionId: input.sessionId, result, createdAt: serverTimestamp() });
    return result;
  });
}

async function complete(tx: Transaction, session: DocumentData, id: string, updates: DocumentData, historical: AccuracyEvidence[]) {
  const user = currentUser();
  const progressRef = doc(database(), "learning_progress", user.uid);
  const progress = await tx.get(progressRef);
  const current = progress.data() ?? {};
  const evidence: AccuracyEvidence[] = [...new Map([...historical, ...(current.accuracyEvidence?.[session.topicId] ?? [])].map((item: AccuracyEvidence) => [item.sessionId, item])).values()];
  const now = Timestamp.now();
  if (typeof session.firstAnswerCorrect === "boolean") evidence.push({ sessionId: id, correct: session.firstAnswerCorrect, completedAt: now.toMillis() });
  const recent = evidence.sort((a, b) => b.completedAt - a.completedAt).slice(0, 5);
  const recommendation = adaptiveDifficulty(session.difficulty as Difficulty, recent);
  const next = nextLearningProgress(user.uid, current, session.scorecard.total, now, { id, subject: session.subject, topic: session.topic, scorecardSummary: session.scorecard.feedback, scorecardGeneratedAt: session.scorecard.generatedAt, recommendation });
  tx.set(progressRef, { ...next, accuracyEvidence: { ...(current.accuracyEvidence ?? {}), [session.topicId]: recent },
    topicRecommendations: { ...(current.topicRecommendations ?? {}), [topicKey(session.topic)]: recommendation }, updatedAt: serverTimestamp() }, { merge: true });
  for (const [key, award] of Object.entries(next.achievements)) {
    if (current.achievements?.[key] || !award) continue;
    tx.set(doc(database(), "notifications", `achievement_${user.uid}_${key}`), { recipientId: user.uid, eventType: "achievement_awarded", title: award.title, message: award.description, actionUrl: "/student/profile", read: false, createdAt: serverTimestamp() });
  }
  Object.assign(updates, { status: "submitted", currentStep: "confirmation", submittedAt: now, statsCommittedAt: now, difficultyRecommendation: recommendation, ctScore: session.scorecard.total });
}

export async function learningOperation(name: string, input: any): Promise<any> {
  switch (name) {
    case "bootstrapProfile": return bootstrap(input);
    case "getCurrentConsentNotice": return consentNotice();
    case "getLearningCatalog": return catalog();
    case "startLearningSession": return start(input);
    case "checkLearningSessionActivity": return checkActivity(input.sessionId);
    case "previewVerifiedProblem": {
      const topic = await getDoc(doc(database(), "topics", input.topicId));
      if (!topic.exists() || topic.get("status") !== "approved") throw new Error("This topic is unavailable.");
      const { confirmationHash, description } = verifiedConfirmation(input.question, topic.get("name"));
      return { confirmationHash, description };
    }
    case "createFollowUpSession": {
      const parent = await getDoc(doc(database(), "sessions", input.sessionId));
      if (parent.get("studentId") !== currentUser().uid || !parent.get("statsCommittedAt")) throw new Error("Submit this session before starting follow-up practice.");
      return start({ mode: "curated", topicId: parent.get("topicId"), requestId: input.requestId });
    }
    default: return mutate(name, input);
  }
}
