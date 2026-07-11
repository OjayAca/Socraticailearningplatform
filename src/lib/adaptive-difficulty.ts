import type {
  DiagnosisResult,
  DifficultyRecommendation,
  MindGuideDifficulty,
  MisconceptionErrorType,
  PhaseResponseRecord,
  SessionDifficultyAdjustment,
  Subject,
  Topic,
  TopicPerformance,
  UnlockLevel,
} from "@/types";
import { mindGuideProblems } from "@/data/mindguide-problems";

export const MINDGUIDE_DIFFICULTY_ORDER: MindGuideDifficulty[] = [
  "Basic",
  "Intermediate",
  "Advanced",
];

const STRONG_SCORE_THRESHOLD = 75;
const WEAK_SCORE_THRESHOLD = 40;
const MAJOR_ERROR_TYPES = new Set<MisconceptionErrorType>([
  "wrong_formula",
  "invalid_logic",
  "computational_error",
]);

export interface SessionDifficultyContext {
  phaseResponses: PhaseResponseRecord[];
  currentDiagnosis?: DiagnosisResult | null;
  hintsUsed: number;
  unlockLevel: UnlockLevel;
}

export function recommendNextDifficulty(
  topicPerformance: TopicPerformance | undefined,
  availableDifficulties: MindGuideDifficulty[]
): DifficultyRecommendation {
  const available = normalizeAvailableDifficulties(availableDifficulties);

  if (!topicPerformance || topicPerformance.attemptsCount === 0) {
    return {
      recommendedDifficulty: chooseInitialDifficulty(available),
      reason: "No topic history yet; start with the lowest available prepared tier.",
      confidence: "low",
    };
  }

  const hasMajorRecentError = topicPerformance.lastErrorTypes.some((errorType) =>
    MAJOR_ERROR_TYPES.has(errorType)
  );
  const isWeak =
    topicPerformance.consecutiveWeakSessions > 0 ||
    topicPerformance.averageScorecardTotal < WEAK_SCORE_THRESHOLD ||
    hasMajorRecentError;
  const isStrong =
    topicPerformance.consecutiveStrongSessions >= 2 ||
    (topicPerformance.averageScorecardTotal >= STRONG_SCORE_THRESHOLD &&
      !hasMajorRecentError);

  if (isWeak) {
    return {
      recommendedDifficulty: clampDifficultyToAvailable(
        shiftDifficulty(topicPerformance.lastDifficulty, -1),
        available
      ),
      reason: hasMajorRecentError
        ? "Recent major misconception detected; reduce difficulty for more scaffolding."
        : "Recent topic performance is weak; reduce difficulty by one tier.",
      confidence: topicPerformance.attemptsCount >= 2 ? "high" : "medium",
    };
  }

  if (isStrong) {
    return {
      recommendedDifficulty: clampDifficultyToAvailable(
        shiftDifficulty(topicPerformance.lastDifficulty, 1),
        available
      ),
      reason: "Topic performance is strong; increase difficulty by one tier.",
      confidence: topicPerformance.attemptsCount >= 2 ? "high" : "medium",
    };
  }

  return {
    recommendedDifficulty: clampDifficultyToAvailable(
      topicPerformance.lastDifficulty,
      available
    ),
    reason: "Topic performance is steady; maintain the current difficulty tier.",
    confidence: "medium",
  };
}

export function getSessionDifficultyAdjustment({
  phaseResponses,
  currentDiagnosis,
  hintsUsed,
  unlockLevel,
}: SessionDifficultyContext): SessionDifficultyAdjustment {
  if (isActiveMisconception(currentDiagnosis)) {
    return "simplify";
  }

  const recentDiagnosedResponses = phaseResponses
    .filter((response) => response.diagnosisResult)
    .slice(-2);

  const repeatedMisconceptions =
    recentDiagnosedResponses.length === 2 &&
    recentDiagnosedResponses.every((response) =>
      isActiveMisconception(response.diagnosisResult)
    );

  if (repeatedMisconceptions) {
    return "simplify";
  }

  const recentSuccessfulResponses = phaseResponses.slice(-2);
  const hasTwoRecentSuccesses =
    recentSuccessfulResponses.length === 2 &&
    recentSuccessfulResponses.every(
      (response) =>
        !response.diagnosisResult ||
        response.diagnosisResult.errorType === "none"
    );

  if (hasTwoRecentSuccesses && hintsUsed <= 1 && unlockLevel <= 1) {
    return "deepen";
  }

  return "maintain";
}

export function getAvailableDifficultiesForTopic(
  subject: Subject,
  topic: Topic
): MindGuideDifficulty[] {
  return normalizeAvailableDifficulties(
    mindGuideProblems
      .filter((problem) => problem.subject === subject && problem.topic === topic)
      .map((problem) => problem.difficulty)
  );
}

export function compareMindGuideDifficulty(
  first: MindGuideDifficulty,
  second: MindGuideDifficulty
): number {
  return getDifficultyIndex(first) - getDifficultyIndex(second);
}

export function clampDifficultyToAvailable(
  difficulty: MindGuideDifficulty,
  availableDifficulties: MindGuideDifficulty[]
): MindGuideDifficulty {
  const available = normalizeAvailableDifficulties(availableDifficulties);
  if (available.length === 0) return "Basic";
  if (available.includes(difficulty)) return difficulty;

  const targetIndex = getDifficultyIndex(difficulty);
  return available.reduce((closest, candidate) => {
    const closestDistance = Math.abs(getDifficultyIndex(closest) - targetIndex);
    const candidateDistance = Math.abs(getDifficultyIndex(candidate) - targetIndex);

    if (candidateDistance < closestDistance) return candidate;
    if (candidateDistance === closestDistance) {
      return compareMindGuideDifficulty(candidate, closest) < 0
        ? candidate
        : closest;
    }

    return closest;
  }, available[0]);
}

function chooseInitialDifficulty(
  available: MindGuideDifficulty[]
): MindGuideDifficulty {
  if (available.includes("Basic")) return "Basic";
  return available[0] ?? "Basic";
}

function shiftDifficulty(
  difficulty: MindGuideDifficulty,
  delta: -1 | 1
): MindGuideDifficulty {
  const nextIndex = Math.min(
    Math.max(getDifficultyIndex(difficulty) + delta, 0),
    MINDGUIDE_DIFFICULTY_ORDER.length - 1
  );
  return MINDGUIDE_DIFFICULTY_ORDER[nextIndex];
}

function normalizeAvailableDifficulties(
  difficulties: MindGuideDifficulty[]
): MindGuideDifficulty[] {
  const unique = new Set(difficulties);
  return MINDGUIDE_DIFFICULTY_ORDER.filter((difficulty) =>
    unique.has(difficulty)
  );
}

function getDifficultyIndex(difficulty: MindGuideDifficulty): number {
  return MINDGUIDE_DIFFICULTY_ORDER.indexOf(difficulty);
}

function isActiveMisconception(
  diagnosis: DiagnosisResult | null | undefined
): boolean {
  return Boolean(diagnosis && diagnosis.errorType !== "none");
}
