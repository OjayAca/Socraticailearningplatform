import { describe, expect, it } from "vitest";
import { presentScorecard } from "@/lib/scorecard-presentation";
import type { ScorecardCategory, ScorecardResult } from "@mindguide/contracts";

describe("scorecard presentation", () => {
  it("uses canonical criterion order for ties and deduplicates improvements", () => {
    const scores: Record<ScorecardCategory, number> = { accuracy: 20, logicalValidity: 24, methodSelection: 20, explanationQuality: 24 };
    const criterion = (category: ScorecardCategory) => ({
      category,
      score: scores[category],
      evidence: [],
      reason: `${category} reason`,
      improvementAdvice: scores[category] === 20 ? "Shared improvement" : `${category} improvement`,
      confidence: "high" as const,
      source: "deterministic" as const,
    });
    const scorecard: ScorecardResult = {
      total: 88,
      feedback: "Session summary",
      generatedAt: 1,
      criteria: {
        accuracy: criterion("accuracy"),
        logicalValidity: criterion("logicalValidity"),
        methodSelection: criterion("methodSelection"),
        explanationQuality: criterion("explanationQuality"),
      },
    };
    const result = presentScorecard(scorecard);
    expect(result.strength.category).toBe("logicalValidity");
    expect(result.weakness.category).toBe("accuracy");
    expect(result.improvements).toEqual(["Shared improvement"]);
    expect(result.sessionSummary).toBe("Session summary");
  });
});
