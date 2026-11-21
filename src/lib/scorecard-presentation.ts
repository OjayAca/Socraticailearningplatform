import type {
  ScorecardCategory,
  ScorecardCriterionResult,
  ScorecardResult,
  SupportSummary,
} from "@mindguide/contracts";

const CATEGORY_ORDER: ScorecardCategory[] = [
  "accuracy",
  "logicalValidity",
  "methodSelection",
  "explanationQuality",
];

/**
 * Reconciled criterion labels matching `SCORECARD_RUBRIC` in `server/scorecard-rubric.ts`.
 */
export const SCORECARD_CATEGORY_LABELS: Record<ScorecardCategory, string> = {
  accuracy: "Accuracy",
  logicalValidity: "Logical Validity",
  methodSelection: "Method Selection",
  explanationQuality: "Explanation Quality",
};

/**
 * Concise student-facing definitions for the four `SCORECARD_RUBRIC` criteria (0–25 points each).
 */
export const SCORECARD_CATEGORY_DESCRIPTIONS: Record<ScorecardCategory, string> = {
  accuracy: "Completeness and correctness of mathematical calculations and final conclusions.",
  logicalValidity: "Soundness of logical inferences, supported implications, and verification checks.",
  methodSelection: "Choice of an appropriate formula, theorem, or strategy with verified conditions.",
  explanationQuality: "Clarity and completeness of contextual interpretation, units, and limitations.",
};

/**
 * Structured calibration disclosure derived strictly from stored `scorecard.calibrationStatus`.
 */
interface ScorecardCalibrationDisclosure {
  readonly status: string;
  readonly isCalibrated: boolean;
  readonly message: string;
}

/**
 * Normalized presentation model for a current or legacy Critical Thinking Scorecard.
 */
export interface PresentedScorecard {
  readonly criteria: ScorecardCriterionResult[];
  readonly hasCriteria: boolean;
  readonly isLegacyPartial: boolean;
  readonly strength: ScorecardCriterionResult | null;
  readonly weakness: ScorecardCriterionResult | null;
  readonly tied: boolean;
  readonly sessionSummary: string | null;
  readonly nextPracticeRecommendation: string | null;
  readonly supportSummary: SupportSummary | null;
  readonly assistanceCount: number | null;
  readonly calibrationDisclosure: ScorecardCalibrationDisclosure | null;
  readonly improvements: string[];
}

/**
 * Safely accepts either a complete `ScorecardResult` or a historical partial scorecard
 * missing `criteria`, `calibrationStatus`, or `supportSummary` without inventing data.
 */
export type PresentableScorecardInput =
  | ScorecardResult
  | (Omit<Partial<ScorecardResult>, "criteria"> & {
      total: number;
      criteria?: Partial<Record<ScorecardCategory, Partial<ScorecardCriterionResult>>>;
    });

const INTERNAL_EVIDENCE_PREFIX_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(?:student|tutor)|[a-z0-9_-]+_(?:student|tutor))\s*:\s*/i;

/**
 * Strips leading internal message-ID prefixes (e.g. `<uuid>_student: ` or `<name>_tutor: `)
 * from stored scorecard evidence lines while preserving learner text and plain system messages.
 *
 * @param raw - Raw evidence string stored on a scorecard criterion.
 * @returns Sanitized, trimmed evidence text suitable for student-facing display.
 */
export function sanitizeScorecardEvidence(raw: string): string {
  return raw.trim().replace(INTERNAL_EVIDENCE_PREFIX_PATTERN, "").trim();
}

/**
 * Transforms a Critical Thinking Scorecard into a null-safe presentation model aligned
 * with `SCORECARD_RUBRIC`, preserving legacy records without synthesizing missing fields.
 *
 * @param scorecard - Stored scorecard payload (full v6 or partial historical record).
 * @returns Normalized presentation object for `ScorecardDetails`.
 */
export function presentScorecard(scorecard: PresentableScorecardInput): PresentedScorecard {
  const rawCriteria = scorecard.criteria as
    | Partial<Record<ScorecardCategory, Partial<ScorecardCriterionResult>>>
    | undefined;

  const criteria: ScorecardCriterionResult[] = CATEGORY_ORDER.flatMap((category) => {
    const entry = rawCriteria?.[category];
    if (!entry || typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
      return [];
    }
    const sanitizedEvidence = Array.isArray(entry.evidence)
      ? entry.evidence
          .filter((item): item is string => typeof item === "string")
          .map(sanitizeScorecardEvidence)
          .filter((item) => item.length > 0)
      : [];
    return [
      {
        category,
        score: entry.score,
        evidence: sanitizedEvidence,
        reason: typeof entry.reason === "string" ? entry.reason : "",
        improvementAdvice:
          typeof entry.improvementAdvice === "string" ? entry.improvementAdvice : "",
        confidence: entry.confidence ?? "medium",
        source: entry.source ?? "deterministic",
      },
    ];
  });

  const hasAdvice = (advice: string) =>
    !/^(none|n\/?a|no improvement(?:s)?(?: needed)?)[.!]?$/i.test(advice.trim()) &&
    Boolean(advice.trim());

  let strength: ScorecardCriterionResult | null = null;
  let weakness: ScorecardCriterionResult | null = null;
  let tied = false;
  let improvements: string[] = [];

  if (criteria.length > 0) {
    const byBest = [...criteria].sort(
      (left, right) =>
        right.score - left.score ||
        CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category),
    );
    const byGrowth = [...criteria].sort(
      (left, right) =>
        left.score - right.score ||
        CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category),
    );
    tied = criteria.length > 1 && byBest[0].score === byGrowth[0].score;
    strength = criteria.length > 1 && !tied ? byBest[0] : null;
    weakness =
      criteria.length > 1 &&
      !tied &&
      byGrowth[0].score < 25 &&
      hasAdvice(byGrowth[0].improvementAdvice)
        ? byGrowth[0]
        : null;
    improvements = [
      ...new Set(
        byGrowth
          .filter((criterion) => criterion.score < 25)
          .slice(0, 2)
          .map((criterion) => criterion.improvementAdvice)
          .filter(hasAdvice),
      ),
    ];
  }

  const rawCalibration =
    typeof scorecard.calibrationStatus === "string"
      ? scorecard.calibrationStatus.trim()
      : "";
  const calibrationDisclosure: ScorecardCalibrationDisclosure | null = rawCalibration
    ? rawCalibration === "calibrated"
      ? {
          status: rawCalibration,
          isCalibrated: true,
          message: "Calibrated formative rubric indicator.",
        }
      : {
          status: rawCalibration,
          isCalibrated: false,
          message: "Uncalibrated formative indicator — formal rubric calibration is pending.",
        }
    : null;

  return {
    criteria,
    hasCriteria: criteria.length > 0,
    isLegacyPartial: criteria.length < CATEGORY_ORDER.length,
    strength,
    weakness,
    tied,
    sessionSummary: scorecard.feedback?.trim() || null,
    nextPracticeRecommendation: scorecard.nextPracticeRecommendation?.trim() || null,
    supportSummary: scorecard.supportSummary ?? null,
    assistanceCount:
      typeof scorecard.assistanceCount === "number" &&
      Number.isFinite(scorecard.assistanceCount)
        ? scorecard.assistanceCount
        : null,
    calibrationDisclosure,
    improvements,
  };
}
