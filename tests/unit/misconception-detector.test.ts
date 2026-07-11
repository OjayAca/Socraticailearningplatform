import { describe, expect, it } from "vitest";
import { mindGuideProblems } from "@/data/mindguide-problems";
import { diagnoseResponse } from "@/lib/misconception-detector";

const probabilityProblem = mindGuideProblems.find(
  (problem) =>
    problem.topic === "Probability" && problem.difficulty === "Basic"
);

describe("rule-based misconception diagnosis", () => {
  it("detects attempts to skip reasoning", () => {
    expect(probabilityProblem).toBeDefined();
    const result = diagnoseResponse(
      "I don't know, just give the answer.",
      probabilityProblem!,
      "problem_understanding"
    );
    expect(result.errorType).toBe("skipped_reasoning");
    expect(result.correctivePrompt).toMatch(/reasoning/i);
  });

  it("requires a relevant concept in formula justification", () => {
    expect(probabilityProblem).toBeDefined();
    const result = diagnoseResponse(
      "I chose it because this unrelated idea seems convenient today.",
      probabilityProblem!,
      "formula_theorem_justification"
    );
    expect(result.errorType).toBe("weak_justification");
  });
});
