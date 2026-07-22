import { describe, expect, it } from "vitest";
import { mindGuideProblems } from "../../src/data/mindguide-problems";
import {
  buildPrivateProblem,
  findForbiddenPublicKeys,
  sanitizePublicProblemContext,
  shouldPreserveCurrentSession,
} from "../../scripts/migration-v3-core";

describe("schema-v3 migration core", () => {
  it("splits prepared problem instructional data into a private record", () => {
    const problem = mindGuideProblems[0];
    const privateRecord = buildPrivateProblem(problem);
    expect(privateRecord.finalAnswer).toBe(problem.finalAnswer);
    expect(privateRecord.solutionSteps).toEqual(problem.solutionSteps);
    expect(privateRecord.socraticPrompts.relevant_information_identification).toBeTruthy();
    expect(privateRecord.socraticPrompts.verification_and_checking).toBeTruthy();
    expect(privateRecord.socraticPrompts.result_interpretation).toBeTruthy();
  });

  it("strips free-form answers, outlines, and rubrics from the public context", () => {
    const sanitized = sanitizePublicProblemContext({
      mode: "free_form",
      question: "Find the mean.",
      analysis: {
        analysisVersion: 1,
        validationStatus: "validated",
        isSupported: true,
        isSolvable: true,
        normalizedQuestion: "Find the mean.",
        subject: "Quantitative Methods",
        topic: "Measures of Central Tendency",
        referenceAnswer: "10",
        solutionOutline: ["private"],
        rubric: ["private"],
      },
    });
    expect(findForbiddenPublicKeys(sanitized)).toEqual([]);
    expect(JSON.stringify(sanitized)).not.toContain("referenceAnswer");
  });

  it("detects nested private keys in public documents", () => {
    expect(findForbiddenPublicKeys({ safe: { solutionSteps: ["leak"] } })).toEqual([
      "document.safe: forbidden public key 'solutionSteps'.",
    ]);
  });

  it("keeps domain-specific method and justification prompts private", () => {
    for (const topic of [
      "Variance and Standard Deviation",
      "Correlation and Basic Regression",
      "Pigeonhole Principle",
      "Basic Proof Reasoning",
    ]) {
      const problem = mindGuideProblems.find((candidate) => candidate.topic === topic)!;
      const privateRecord = buildPrivateProblem(problem);
      expect(privateRecord.requiredFormula || privateRecord.requiredTheorem, topic).toBeTruthy();
      expect(privateRecord.socraticPrompts.method_selection.length, topic).toBeGreaterThan(10);
      expect(privateRecord.socraticPrompts.formula_theorem_justification.length, topic).toBeGreaterThan(10);
      expect(findForbiddenPublicKeys({
        subject: problem.subject,
        topic: problem.topic,
        problemText: problem.problemText,
      })).toEqual([]);
    }
  });

  it("preserves both legacy workflow-v3 and current workflow-v4 session records", () => {
    expect(shouldPreserveCurrentSession({ schemaVersion: 3, workflowVersion: 3 })).toBe(true);
    expect(shouldPreserveCurrentSession({ schemaVersion: 3, workflowVersion: 4 })).toBe(true);
    expect(shouldPreserveCurrentSession({ schemaVersion: 2, workflowVersion: 2 })).toBe(false);
  });
});
