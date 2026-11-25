import type {
  AchievementAward,
  AchievementId,
  AdaptiveRecommendation,
  Difficulty,
  LearningProgress,
  ReasoningPhase,
  SessionProjection,
  SolverStage,
  SolverStageProgress,
  Subject,
} from "@mindguide/contracts";
import { VALIDATED_TOPICS } from "../../data/validated-curriculum.js";
import {
  SOLVER_STAGES,
  SOLVER_STAGE_PHASES,
  solverStageForPhase,
} from "@mindguide/contracts";
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

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  Basic: 0,
  Intermediate: 1,
  Advanced: 2,
};

function topicSlugKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function resolveSubjectRecommendation(
  subject: Subject,
  topicRecommendations: Record<string, unknown> | undefined,
  currentTopicName: string,
  currentRecommendation: AdaptiveRecommendation,
): { recommendedDifficulty: Difficulty; recommendationReason: string } {
  const subjectKeys = new Set(
    VALIDATED_TOPICS.filter((topic) => topic.subject === subject).map((topic) => topicSlugKey(topic.name)),
  );
  subjectKeys.add(topicSlugKey(currentTopicName));
  let bestDifficulty: Difficulty | null = null;
  let bestReason: string | null = null;
  for (const [key, value] of Object.entries(topicRecommendations ?? {})) {
    if (!subjectKeys.has(key) || !value || typeof value !== "object") continue;
    const candidate = (value as { recommendedDifficulty?: unknown; reason?: unknown }).recommendedDifficulty;
    const reason = (value as { reason?: unknown }).reason;
    if (candidate === "Basic" || candidate === "Intermediate" || candidate === "Advanced") {
      if (!bestDifficulty || DIFFICULTY_RANK[candidate] > DIFFICULTY_RANK[bestDifficulty]) {
        bestDifficulty = candidate;
        bestReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;
      }
    }
  }
  const recommendedDifficulty = bestDifficulty ?? currentRecommendation.recommendedDifficulty;
  const recommendationReason =
    recommendedDifficulty === currentRecommendation.recommendedDifficulty
      ? currentRecommendation.reason
      : bestReason ?? currentRecommendation.reason;
  return { recommendedDifficulty, recommendationReason };
}

export function nextLearningProgress(
  uid: string,
  current: Record<string, unknown> | undefined,
  score: number,
  submittedAt: { toDate(): Date; toMillis(): number },
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
  const currentTopicRecommendations =
    current?.topicRecommendations && typeof current.topicRecommendations === "object"
      ? (current.topicRecommendations as Record<string, unknown>)
      : undefined;
  let nextTopicRecommendations: Record<string, unknown> = currentTopicRecommendations ?? {};
  if (session) {
    const previousSubject = subjectProgress[session.subject];
    const subjectSessions = Number(previousSubject?.sessionsCompleted ?? 0) + 1;
    const subjectScoreTotal = Number(previousSubject?.scoreTotal ?? 0) + score;
    nextTopicRecommendations = {
      ...(currentTopicRecommendations ?? {}),
      [topicSlugKey(session.topic)]: session.recommendation,
    };
    const { recommendedDifficulty, recommendationReason } = resolveSubjectRecommendation(
      session.subject,
      nextTopicRecommendations,
      session.topic,
      session.recommendation,
    );
    subjectProgress[session.subject] = {
      sessionsCompleted: subjectSessions,
      scoreTotal: subjectScoreTotal,
      averageCTScore: Math.round(subjectScoreTotal / subjectSessions),
      lastActivityAt: submittedAt.toMillis(),
      recommendedDifficulty,
      recommendationReason,
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
    topicRecommendations: nextTopicRecommendations,
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

function toTimestampMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return Number(value.toMillis()) || 0;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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

/**
 * Resolves a stored learner streak for display by applying calendar-day decay when
 * `lastSessionDate` or `lastSessionAt` indicates the streak has expired.
 *
 * @param storedStreak - Stored streak counter from `learning_progress`.
 * @param lastSessionDate - Optional `YYYY-MM-DD` Manila calendar date of last completion.
 * @param lastSessionAt - Optional timestamp (`number`, `Date`, ISO string, or Firestore `Timestamp`) fallback.
 * @param now - Optional reference date (defaults to current time).
 * @returns Active streak count (`0` if expired).
 */
export function resolveStoredStreak(
  storedStreak: number,
  lastSessionDate?: unknown,
  lastSessionAt?: unknown,
  now = new Date(),
): number {
  const normalizedStreak = Number.isFinite(storedStreak) ? Math.max(0, storedStreak) : 0;
  if (normalizedStreak === 0) return 0;
  if (typeof lastSessionDate === "string" && lastSessionDate.trim()) {
    return effectiveCurrentStreak(normalizedStreak, lastSessionDate.trim(), now);
  }
  const timestampMs = toTimestampMillis(lastSessionAt);
  if (timestampMs > 0) {
    return effectiveCurrentStreak(normalizedStreak, manilaDateKey(new Date(timestampMs)), now);
  }
  return normalizedStreak;
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
