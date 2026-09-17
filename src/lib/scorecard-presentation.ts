import type { ScorecardCategory, ScorecardResult } from "@mindguide/contracts";

const CATEGORY_ORDER: ScorecardCategory[] = [
  "accuracy",
  "logicalValidity",
  "methodSelection",
  "explanationQuality",
];

export const SCORECARD_CATEGORY_LABELS: Record<ScorecardCategory, string> = {
  accuracy: "Accuracy",
  logicalValidity: "Logical Validity",
  methodSelection: "Method Selection",
  explanationQuality: "Explanation Quality",
};

export function presentScorecard(scorecard: ScorecardResult) {
  const criteria = CATEGORY_ORDER.map((category) => scorecard.criteria[category]);
  const byBest = [...criteria].sort((left, right) =>
    right.score - left.score || CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)
  );
  const byGrowth = [...criteria].sort((left, right) =>
    left.score - right.score || CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)
  );
  return {
    criteria,
    strength: byBest[0],
    weakness: byGrowth[0],
    sessionSummary: scorecard.feedback,
    improvements: [...new Set(byGrowth.slice(0, 2).map((criterion) => criterion.improvementAdvice))],
  };
}
