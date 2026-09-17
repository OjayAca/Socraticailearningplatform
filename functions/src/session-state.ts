import type {
  AchievementAward,
  AchievementId,
  AdaptiveRecommendation,
  LearningProgress,
  ReasoningPhase,
  SessionProjection,
  SolverStage,
  SolverStageProgress,
  Subject,
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
  submittedAt: Timestamp,
  session?: {
    id: string;
    subject: Subject;
    topic: string;
    scorecardSummary: string;
    scorecardGeneratedAt: number;
    recommendation: AdaptiveRecommendation;
  }
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
  const existingAchievements = normalizeAchievements(current?.achievements);
  const achievements = session
    ? awardEligibleAchievements(existingAchievements, {
        sessionId: session.id,
        sessionsCompleted,
        currentStreak,
        score,
        awardedAt: submittedAt.toMillis(),
      }).achievements
    : existingAchievements;
  const subjectProgress = normalizeSubjectProgress(current?.subjectProgress);
  if (session) {
    const previousSubject = subjectProgress[session.subject];
    const subjectSessions = Number(previousSubject?.sessionsCompleted ?? 0) + 1;
    const subjectScoreTotal = Number(previousSubject?.scoreTotal ?? 0) + score;
    subjectProgress[session.subject] = {
      sessionsCompleted: subjectSessions,
      scoreTotal: subjectScoreTotal,
      averageCTScore: Math.round(subjectScoreTotal / subjectSessions),
      lastActivityAt: submittedAt.toMillis(),
      recommendedDifficulty: session.recommendation.recommendedDifficulty,
      recommendationReason: session.recommendation.reason,
    };
  }
  return {
    userId: uid,
    sessionsCompleted,
    scoreTotal,
    averageCTScore: Math.round(scoreTotal / sessionsCompleted),
    currentStreak,
    lastSessionAt: submittedAt.toMillis(),
    lastSessionDate: dateKey,
    lastActivityAt: submittedAt.toMillis(),
    achievements,
    latestScorecard: session ? {
      sessionId: session.id,
      total: score,
      subject: session.subject,
      topic: session.topic,
      summary: session.scorecardSummary,
      generatedAt: session.scorecardGeneratedAt,
    } : normalizeLatestScorecard(current?.latestScorecard),
    subjectProgress,
    topicRecommendations: (current?.topicRecommendations as Record<string, unknown> | undefined) ?? {},
  };
}

const ACHIEVEMENT_DEFINITIONS: Record<AchievementId, { title: string; description: string }> = {
  first_step: { title: "First Step", description: "Complete your first learning session." },
  dedicated_learner: { title: "Dedicated Learner", description: "Complete five learning sessions." },
  three_day_streak: { title: "Three-Day Streak", description: "Learn on three consecutive days." },
  strong_reasoner: { title: "Strong Reasoner", description: "Earn a scorecard total of 80 or higher." },
};

export function awardEligibleAchievements(
  current: Partial<Record<AchievementId, AchievementAward>>,
  event: {
    sessionId: string;
    sessionsCompleted: number;
    currentStreak: number;
    score: number;
    awardedAt: number;
  }
): {
  achievements: Partial<Record<AchievementId, AchievementAward>>;
  newlyAwarded: AchievementAward[];
} {
  const achievements = { ...current };
  const eligible: AchievementId[] = [];
  if (event.sessionsCompleted >= 1) eligible.push("first_step");
  if (event.sessionsCompleted >= 5) eligible.push("dedicated_learner");
  if (event.currentStreak >= 3) eligible.push("three_day_streak");
  if (event.score >= 80) eligible.push("strong_reasoner");
  const newlyAwarded = eligible.flatMap((id) => {
    if (achievements[id]) return [];
    const definition = ACHIEVEMENT_DEFINITIONS[id];
    const award: AchievementAward = {
      id,
      ...definition,
      sourceSessionId: event.sessionId,
      awardedAt: event.awardedAt,
    };
    achievements[id] = award;
    return [award];
  });
  return { achievements, newlyAwarded };
}

export function effectiveCurrentStreak(
  storedStreak: number,
  lastSessionDate: string | null,
  now = new Date()
): number {
  if (!lastSessionDate) return 0;
  const today = manilaDateKey(now);
  return lastSessionDate === today || lastSessionDate === previousDateKey(today)
    ? Math.max(0, storedStreak)
    : 0;
}

function normalizeAchievements(value: unknown): Partial<Record<AchievementId, AchievementAward>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<AchievementId, AchievementAward>>
    : {};
}

function normalizeSubjectProgress(value: unknown): LearningProgress["subjectProgress"] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as LearningProgress["subjectProgress"]) }
    : {};
}

function normalizeLatestScorecard(value: unknown): LearningProgress["latestScorecard"] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as LearningProgress["latestScorecard"]
    : null;
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
