import type {
  LearningProgress,
  ReasoningPhase,
  SessionProjection,
  SolverStage,
  SolverStageProgress,
} from "@mindguide/contracts";
import {
  SOLVER_STAGES,
  SOLVER_STAGE_PHASES,
  solverStageForPhase,
} from "@mindguide/contracts";
import { Timestamp } from "./runtime.js";
import type { GateStateMap } from "./workflow.js";

export function projectStageProgress(
  gates: Partial<GateStateMap>,
  currentPhase: SessionProjection["currentPhase"]
): Record<SolverStage, SolverStageProgress> {
  const activeStage = solverStageForPhase(currentPhase);
  return Object.fromEntries(SOLVER_STAGES.map((stage) => {
    const phases = SOLVER_STAGE_PHASES[stage];
    const acceptedGates = phases.filter((phase: ReasoningPhase) =>
      gates[phase]?.status === "accepted"
    ).length;
    const completed = acceptedGates === phases.length;
    return [stage, {
      stage,
      acceptedGates,
      totalGates: phases.length,
      status: completed ? "completed" : stage === activeStage ? "active" : "locked",
    } satisfies SolverStageProgress];
  })) as Record<SolverStage, SolverStageProgress>;
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
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export type StudentMutation =
  | "reasoning"
  | "support"
  | "draft"
  | "finalize"
  | "submit"
  | "abandon"
  | "follow_up";

export function isStudentMutationAllowed(status: unknown, operation: StudentMutation): boolean {
  if (status === "in_progress") {
    return ["reasoning", "support", "draft", "finalize", "abandon"].includes(operation);
  }
  if (status === "ready_for_submission") return operation === "submit" || operation === "abandon";
  if (status === "returned") return operation === "follow_up";
  return false;
}
