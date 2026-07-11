import { describe, expect, it } from "vitest";
import { validateFreeFormProblemAnalysis } from "@/lib/free-form-analysis";
import {
  buildProblemFromFreeFormAnalysis,
  createCuratedProblemContext,
  createFreeFormProblemContext,
} from "@/lib/problem-context";
import { mindGuideProblems } from "@/data/mindguide-problems";
import type { FreeFormProblemAnalysis } from "@/types";

const rubric = [
  "accuracy",
  "logicalValidity",
  "methodSelection",
  "justificationQuality",
  "interpretationQuality",
].map((category) => ({
  category,
  criterion: `Demonstrates ${category} with relevant evidence.`,
  maxScore: 20,
}));

function validatedAnalysis(): FreeFormProblemAnalysis {
  return validateFreeFormProblemAnalysis(
    {
      isSupported: true,
      isSolvable: true,
      rejectionReason: null,
      normalizedQuestion:
        "A fair die is rolled once. What is the probability of an even result?",
      expectedConcepts: ["sample space", "favorable outcomes", "probability"],
      requiredFormula: "P(E) = favorable outcomes / total outcomes",
      requiredTheorem: null,
      solutionOutline: [
        "List all six possible outcomes.",
        "Identify 2, 4, and 6 as favorable.",
        "Compute 3 / 6 = 1 / 2.",
      ],
      referenceAnswer: "The probability is 1/2.",
      interpretation: "Half of the equally likely outcomes are even.",
      rubric,
    },
    {
      subject: "Quantitative Methods",
      topic: "Probability",
      originalQuestion: "What is the probability of rolling an even number?",
    }
  );
}

describe("free-form problem contracts", () => {
  it("normalizes a complete five-category Gemini analysis", () => {
    const analysis = validatedAnalysis();
    expect(analysis.validationStatus).toBe("validated");
    expect(analysis.rubric.map((item) => item.category)).toEqual([
      "accuracy",
      "logicalValidity",
      "methodSelection",
      "justificationQuality",
      "interpretationQuality",
    ]);
    expect(analysis.rubric.every((item) => item.maxScore === 20)).toBe(true);
  });

  it("rejects incomplete supported analyses instead of fabricating a rubric", () => {
    expect(() =>
      validateFreeFormProblemAnalysis(
        {
          isSupported: true,
          isSolvable: true,
          expectedConcepts: [],
          solutionOutline: ["Only one step"],
          referenceAnswer: "",
          rubric: [],
        },
        {
          subject: "Quantitative Methods",
          topic: "Probability",
          originalQuestion: "A sufficiently detailed probability problem.",
        }
      )
    ).toThrow(/complete learning rubric/i);
  });

  it("stores no curated solution material in the persisted context", () => {
    const context = createCuratedProblemContext(mindGuideProblems[0]);
    expect(context.mode).toBe("curated");
    expect(context).not.toHaveProperty("solutionSteps");
    expect(context).not.toHaveProperty("finalAnswer");
    expect(JSON.stringify(context)).not.toContain(mindGuideProblems[0].finalAnswer);
  });

  it("builds stable tutoring references for validated free-form problems", () => {
    const analysis = validatedAnalysis();
    const context = createFreeFormProblemContext(
      analysis.normalizedQuestion,
      analysis
    );
    if (context.mode !== "free_form") {
      throw new Error("Expected a free-form problem context.");
    }
    const first = buildProblemFromFreeFormAnalysis(context.analysis);
    const second = buildProblemFromFreeFormAnalysis(context.analysis);

    expect(first.id).toBe(second.id);
    expect(first.problemText).toBe(analysis.normalizedQuestion);
    expect(first.finalAnswer).toBe(analysis.referenceAnswer);
  });
});
