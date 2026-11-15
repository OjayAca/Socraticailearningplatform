import { describe, expect, it } from "vitest";
import { presentScorecard } from "@/lib/scorecard-presentation";
import { buildNextPracticeRecommendation, buildSupportSummary, hintLevelNumberFor } from "../../server/scorecard-rubric";
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
      nextPracticeRecommendation: "Your Logical Validity is strong (24/25). Practice formula justification next.",
      supportSummary: {
        hintsRequested: 1,
        highestHintLevel: 1,
        solutionUnlocked: true,
        correctiveAttempts: 1,
        selfCorrections: 1,
        completedIndependentlyAfterSupport: true,
      },
      generatedAt: 1,
      criteria: {
        accuracy: criterion("accuracy"),
        logicalValidity: criterion("logicalValidity"),
        methodSelection: criterion("methodSelection"),
        explanationQuality: criterion("explanationQuality"),
      },
    };
    const result = presentScorecard(scorecard);
    expect(result.strength?.category).toBe("logicalValidity");
    expect(result.weakness?.category).toBe("accuracy");
    expect(result.improvements).toEqual(["Shared improvement"]);
    expect(result.sessionSummary).toBe("Session summary");
    expect(result.nextPracticeRecommendation).toContain("Practice formula justification next.");
    expect(result.supportSummary?.highestHintLevel).toBe(1);
    expect(result.supportSummary?.solutionUnlocked).toBe(true);
  });
  it.each([0, 15, 25])("does not invent relative strengths or weaknesses for tied scores of %s", score => {
    const criterion = (category: ScorecardCategory): ScorecardResult["criteria"][ScorecardCategory] => ({category, score, evidence:[], reason:"Saved feedback", improvementAdvice:score === 25 ? "None" : "Explain your reasoning", confidence:"high", source:"ai"});
    const criteria = {accuracy:criterion("accuracy"),logicalValidity:criterion("logicalValidity"),methodSelection:criterion("methodSelection"),explanationQuality:criterion("explanationQuality")};
    const card = {criteria, total:score * 4, feedback:"Summary", generatedAt:1};
    const result = presentScorecard(card);
    expect(result.strength).toBeNull();
    expect(result.weakness).toBeNull();
    expect(result.improvements).toEqual(score === 25 ? [] : ["Explain your reasoning"]);
    expect(card.total).toBe(score * 4);
  });

  it("separates highestHintLevel (0..3) from solutionUnlocked and generates deterministic next-practice recommendations", () => {
    expect(hintLevelNumberFor("socratic_prompt")).toBe(0);
    expect(hintLevelNumberFor("targeted_hint")).toBe(1);
    expect(hintLevelNumberFor("stronger_hint")).toBe(2);
    expect(hintLevelNumberFor("partial_step")).toBe(3);

    const summary = buildSupportSummary(
      [{ level: "socratic_prompt" }, { level: "targeted_hint" }],
      {
        problem_understanding: { status: "accepted", correctiveCycleCount: 0, selfCorrected: false },
        method_selection: { status: "accepted", correctiveCycleCount: 1, selfCorrected: true },
        guided_computation_or_proof: { status: "accepted", correctiveCycleCount: 0, selfCorrected: false },
        result_interpretation: { status: "accepted", correctiveCycleCount: 0, selfCorrected: false },
      },
      false,
    );
    expect(summary).toEqual({
      hintsRequested: 2,
      highestHintLevel: 1,
      solutionUnlocked: false,
      correctiveAttempts: 1,
      selfCorrections: 1,
      completedIndependentlyAfterSupport: true,
    });

    const recommendation = buildNextPracticeRecommendation(
      {
        accuracy: { score: 25, reason: "Correct", improvementAdvice: "None" },
        logicalValidity: { score: 22, reason: "Clear steps", improvementAdvice: "None" },
        methodSelection: { score: 15, reason: "Needed help justifying", improvementAdvice: "Explain preconditions" },
        explanationQuality: { score: 21, reason: "Good context", improvementAdvice: "None" },
      },
      "Quantitative Methods",
      "Descriptive Statistics",
    );
    expect(recommendation).toContain("Your mathematical accuracy is strong (25/25)");
    expect(recommendation).toContain("formula and theorem selection (15/25)");
    expect(recommendation).toContain("Descriptive Statistics");
  });
});
