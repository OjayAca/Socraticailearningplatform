import type {
  LearningProgress,
  ReasoningPhase,
  SessionProjection,
  SolverStage,
  SolverStageProgress,
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
import { callableError } from "./errors.js";
import { Timestamp } from "./runtime.js";
import type { GateStateMap } from "./workflow.js";

export function assertSessionOwner(snapshot: FirebaseFirestore.DocumentSnapshot, uid: string): void {
  if (!snapshot.exists) throw callableError("not-found", "session_not_found", "The learning session was not found.");
  if (snapshot.get("studentId") !== uid) throw callableError("permission-denied", "session_forbidden", "You cannot access this learning session.");
}

export function assertSessionRevision(session: Record<string, any>, revision: number, phase: ReasoningPhase): void {
  if (session.revision !== revision) throw staleSessionError();
  if (session.status !== "in_progress" || session.currentPhase !== phase) {
    throw callableError("failed-precondition", "phase_locked", "Reload the session and continue from the current approved stage.");
  }
}

export function staleSessionError() {
  return callableError("aborted", "stale_session", "This session changed in another request. Reload it before continuing.", true);
}

export function allGatesAccepted(gates: GateStateMap): boolean {
  return REASONING_PHASES.every((phase) => gates[phase]?.status === "accepted");
}

export function projectSession(id: string, session: Record<string, any>): SessionProjection {
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

export function projectStageProgress(
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

export function millis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) return (value as Timestamp).toMillis();
  return typeof value === "number" ? value : Date.now();
}

export function nextLearningProgress(
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

export function pickSessionProblem(session: Record<string, any>) {
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

export function legacyScorecard(scorecard: import("@mindguide/contracts").ScorecardResult) {
  return {
    accuracy: scorecard.criteria.accuracy.score,
    logicalValidity: scorecard.criteria.logicalValidity.score,
    methodSelection: scorecard.criteria.methodSelection.score,
    explanationQuality: scorecard.criteria.explanationQuality.score,
    total: scorecard.total,
    feedback: scorecard.feedback,
  };
}

export function slugKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function mergeSupportLevels(policy: SupportLevel[], _overrides: unknown): SupportLevel[] {
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
