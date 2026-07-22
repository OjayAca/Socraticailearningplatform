import { describe, expect, it } from "vitest";
import { REASONING_PHASES } from "@mindguide/contracts";
import {
  freeFormResponseJsonSchema,
  parseFreeFormAnalysis,
} from "../ai.js";

const completeAnalysis = {
  supported: true,
  solvable: true,
  rejectionReason: null,
  normalizedQuestion: "Find the mean of 4, 8, and 12.",
  expectedConcepts: ["mean", "sum", "count"],
  requiredFormula: "mean = sum / count",
  requiredTheorem: null,
  solutionSteps: ["Add the values.", "Divide the sum by three."],
  finalAnswer: "8",
  interpretation: "The arithmetic mean is 8.",
  prompts: Object.fromEntries(
    REASONING_PHASES.map((phase) => [phase, `Reason about ${phase}.`])
  ),
};

describe("free-form problem analysis", () => {
  it("requires Gemini to return every field consumed by session creation", () => {
    expect(freeFormResponseJsonSchema.required).toEqual(
      expect.arrayContaining([
        "supported",
        "solvable",
        "normalizedQuestion",
        "solutionSteps",
        "finalAnswer",
        "prompts",
      ])
    );
    expect(freeFormResponseJsonSchema.properties.prompts.required).toEqual(
      REASONING_PHASES
    );
  });

  it("parses a complete structured analysis into a private reference", () => {
    const result = parseFreeFormAnalysis(JSON.stringify(completeAnalysis));

    expect(result.normalizedQuestion).toBe(completeAnalysis.normalizedQuestion);
    expect(result.finalAnswer).toBe("8");
    expect(result.socraticPrompts).toEqual(completeAnalysis.prompts);
  });

  it("allows a rejected problem to omit private solution content", () => {
    const result = parseFreeFormAnalysis(
      JSON.stringify({
        ...completeAnalysis,
        supported: false,
        solvable: false,
        rejectionReason: "The prompt is outside the selected topic.",
        expectedConcepts: [],
        requiredFormula: null,
        solutionSteps: [],
        finalAnswer: "",
        interpretation: "",
      })
    );

    expect(result.supported).toBe(false);
    expect(result.rejectionReason).toContain("outside");
    expect(result.solutionSteps).toEqual([]);
  });

  it("rejects the partial object that previously caused the generic reference error", () => {
    expect(() =>
      parseFreeFormAnalysis(JSON.stringify({ analysis: completeAnalysis }))
    ).toThrow();
  });
});
