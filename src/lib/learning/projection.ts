import { Timestamp } from "firebase/firestore";
import { REASONING_PHASES, SCHEMA_VERSION, WORKFLOW_VERSION, solverStageForPhase, type SessionProjection, type ReasoningPhase } from "@mindguide/contracts";
import { projectStageProgress } from "./session-state";
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
    lastDiagnosis: session.lastDiagnosis ?? null,
    supportHistory: session.supportHistory ?? [],
    responseCount: Number(session.responseCount ?? 0),
    studentId: String(session.studentId),
    subjectId: String(session.subjectId ?? ""),
    topicId: String(session.topicId ?? ""),
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
    configurationVersions: session.configurationVersions ?? null,
    promptAdjustment: session.promptAdjustment ?? "maintain",
    createdAt: millis(session.createdAt),
    updatedAt: millis(session.updatedAt),
    learningCompletedAt: session.learningCompletedAt ? millis(session.learningCompletedAt) : null,
  };
}

function fallbackPrompt(phase: ReasoningPhase | null): string {
  if (!phase) return "Review your completed reasoning and scorecard.";
  return phase.replaceAll("_", " ");
}

function millis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) return (value as Timestamp).toMillis();
  return typeof value === "number" ? value : Date.now();
}

