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
  const tied = byBest[0].score === byGrowth[0].score;
  const hasAdvice = (advice: string) => !/^(none|n\/?a|no improvement(?:s)?(?: needed)?)[.!]?$/i.test(advice.trim()) && Boolean(advice.trim());
  return {
    criteria,
    strength: tied ? null : byBest[0],
    weakness: !tied && byGrowth[0].score < 25 && hasAdvice(byGrowth[0].improvementAdvice) ? byGrowth[0] : null,
    tied,
    sessionSummary: scorecard.feedback,
    improvements: [...new Set(byGrowth.filter(criterion => criterion.score < 25).slice(0, 2).map((criterion) => criterion.improvementAdvice).filter(hasAdvice))],
  };
}
