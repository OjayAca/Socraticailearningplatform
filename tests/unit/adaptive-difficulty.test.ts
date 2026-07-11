import { describe, expect, it } from "vitest";
import {
  getAvailableDifficultiesForTopic,
  getSessionDifficultyAdjustment,
  recommendNextDifficulty,
} from "@/lib/adaptive-difficulty";
import type {
  DiagnosisResult,
  PhaseResponseRecord,
  TopicPerformance,
} from "@/types";

const basePerformance: TopicPerformance = {
  subject: "Quantitative Methods",
  topic: "Probability",
  attemptsCount: 2,
  averageScorecardTotal: 60,
  lastDifficulty: "Intermediate",
  lastErrorTypes: [],
  consecutiveStrongSessions: 0,
  consecutiveWeakSessions: 0,
};

function diagnosis(errorType: DiagnosisResult["errorType"]): DiagnosisResult {
  return {
    errorType,
    correctivePrompt: "Review the reasoning.",
    phase: "method_selection",
    reasons: [],
    detectedAt: 1,
  };
}

function response(
  id: string,
  diagnosisResult: DiagnosisResult | null
): PhaseResponseRecord {
  return {
    id,
    phase: "method_selection",
    response: "I selected this method because it fits the given conditions.",
    submittedAt: 1,
    diagnosisResult,
  };
}

describe("adaptive difficulty", () => {
  it("starts new topic histories at Basic", () => {
    expect(
      recommendNextDifficulty(undefined, ["Advanced", "Basic", "Intermediate"])
        .recommendedDifficulty
    ).toBe("Basic");
  });

  it("moves strong performance up and major misconceptions down", () => {
    expect(
      recommendNextDifficulty(
        {
          ...basePerformance,
          averageScorecardTotal: 84,
          consecutiveStrongSessions: 2,
        },
        ["Basic", "Intermediate", "Advanced"]
      ).recommendedDifficulty
    ).toBe("Advanced");

    expect(
      recommendNextDifficulty(
        {
          ...basePerformance,
          lastErrorTypes: ["wrong_formula"],
        },
        ["Basic", "Intermediate", "Advanced"]
      ).recommendedDifficulty
    ).toBe("Basic");
  });

  it("reports all three authored tiers for every topic", () => {
    expect(
      getAvailableDifficultiesForTopic("Quantitative Methods", "Probability")
    ).toEqual(["Basic", "Intermediate", "Advanced"]);
    expect(
      getAvailableDifficultiesForTopic(
        "Discrete Mathematics",
        "Basic Proof Reasoning"
      )
    ).toEqual(["Basic", "Intermediate", "Advanced"]);
  });

  it("simplifies after misconceptions and deepens after two clean responses", () => {
    expect(
      getSessionDifficultyAdjustment({
        phaseResponses: [],
        currentDiagnosis: diagnosis("invalid_logic"),
        hintsUsed: 0,
        unlockLevel: 0,
      })
    ).toBe("simplify");

    expect(
      getSessionDifficultyAdjustment({
        phaseResponses: [response("one", null), response("two", diagnosis("none"))],
        currentDiagnosis: null,
        hintsUsed: 1,
        unlockLevel: 1,
      })
    ).toBe("deepen");
  });
});
