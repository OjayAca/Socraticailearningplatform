import { describe, expect, it } from "vitest";
import { mindGuideProblems } from "../../src/data/mindguide-problems";
import {
  buildPrivateProblem,
  findForbiddenPublicKeys,
  sanitizePublicProblemContext,
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
});
