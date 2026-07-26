import { describe, expect, it } from "vitest";
import { REASONING_PHASES } from "@mindguide/contracts";
import {
  buildScorecard,
  buildReleasedSolution,
  evaluateDeterministically,
  initialGateStates,
  recommendDifficulty,
  promptForPhase,
  supportLevelsFor,
  type PrivateProblemReference,
} from "../workflow.js";
import { mathematicalEquivalent, normalizeMathResponse } from "../math.js";

const reference: PrivateProblemReference = {
  expectedConcepts: ["mean", "average"],
  requiredFormula: "mean = sum / n",
  solutionSteps: ["Add the values.", "Divide by the count."],
  finalAnswer: "10",
  interpretation: "The mean score is 10.",
};

describe("workflow-v4 Socratic reasoning core", () => {
  it("initializes exactly seven ordered gates with only the first pending", () => {
    const gates = initialGateStates();
    expect(Object.keys(gates)).toEqual(REASONING_PHASES);
    expect(gates.problem_understanding.status).toBe("pending");
    expect(gates.result_interpretation.status).toBe("locked");
  });

  it("rejects irrelevant short attempts and does not treat them as accepted", () => {
    const result = evaluateDeterministically({
      phase: "problem_understanding",
      response: { plainText: "idk" },
      problemText: "Find the mean of five scores.",
      reference,
      attemptCount: 1,
      correctiveCycleCount: 0,
    });
    expect(result.evaluation.status).toBe("needs_revision");
    expect(result.diagnosis.category).toBe("unsupported_response");
  });

  it("requires AI confirmation for plausible semantic reasoning and unlocks support only by corrective-cycle policy", () => {
    const result = evaluateDeterministically({
      phase: "formula_theorem_justification",
      response: { plainText: "The mean formula applies because the given values form the complete data set and its required count is known." },
      problemText: "Find the mean of five scores.",
      reference,
      attemptCount: 1,
      correctiveCycleCount: 0,
    });
    expect(result.evaluation.status).toBe("needs_revision");
    expect(result.requiresAI).toBe(true);

    const gates = initialGateStates();
    gates.problem_understanding.attemptCount = 3;
    gates.problem_understanding.correctiveCycleCount = 3;
    expect(supportLevelsFor(gates)).toEqual([
      "socratic_prompt",
      "targeted_hint",
      "stronger_hint",
      "partial_step",
    ]);
  });

  it("never grants deterministic acceptance to generic keyword-only reasoning", () => {
    const samples = {
      problem_understanding: "This problem asks me to find the mean result from the given score problem data.",
      relevant_information_identification: "The given variable value and unknown data are relevant.",
      method_selection: "I will use a formula method for this proof.",
      formula_theorem_justification: "Because the given condition applies and is valid here.",
      guided_computation_or_proof: "Therefore suppose this case implies the proof.",
      verification_and_checking: "I will check this case because it seems reasonable.",
      result_interpretation: "This result therefore indicates what the answer means in context.",
    } as const;
    for (const phase of REASONING_PHASES) {
      const result = evaluateDeterministically({
        phase,
        response: { plainText: samples[phase] },
        problemText: "Find the mean of five scores.",
        reference,
        attemptCount: 1,
        correctiveCycleCount: 0,
      });
      expect(result.evaluation.status, phase).toBe("needs_revision");
      expect(result.requiresAI, phase).toBe(true);
    }
  });

  it("uses mathematical equivalence for accuracy and exposes criterion evidence", () => {
    expect(mathematicalEquivalent("\\frac{20}{2}", "10")).toBe(true);
    const gates = initialGateStates();
    REASONING_PHASES.forEach((phase) => { gates[phase].status = "accepted"; });
    const scorecard = buildScorecard({
      gates,
      reference,
      draft: {
        answer: normalizeMathResponse({ plainText: "The mean is ten.", latex: "\\frac{20}{2}" }),
        methodology: "I added the values and divided by the number of observations.",
        reflection: "The result represents the central score in the complete data set.",
      },
    });
    expect(scorecard.criteria.accuracy.score).toBe(25);
    expect(scorecard.criteria.accuracy.evidence.length).toBeGreaterThan(0);
    expect(Object.keys(scorecard.criteria)).toEqual([
      "accuracy",
      "logicalValidity",
      "methodSelection",
      "explanationQuality",
    ]);
    expect(scorecard.total).toBeLessThanOrEqual(100);
  });

  it("keeps worked answers locked until scoring and releases a complete solution afterward", () => {
    const gates = initialGateStates();
    REASONING_PHASES.forEach((phase) => { gates[phase].status = "accepted"; });
    expect(supportLevelsFor(gates)).toEqual([]);

    const released = buildReleasedSolution(reference);
    expect(released.method).toContain("mean");
    expect(released.steps).toEqual(reference.solutionSteps);
    expect(released.answer).toBe(reference.finalAnswer);
    expect(released.verification.length).toBeGreaterThan(20);
    expect(released.interpretation).toBe(reference.interpretation);
  });

  it("adapts prompts without revealing reference answers", () => {
    const simplified = promptForPhase("formula_theorem_justification", reference, "simplify");
    const deepened = promptForPhase("result_interpretation", reference, "deepen");
    expect(simplified).toContain("required condition");
    expect(deepened).toContain("still be valid");
    expect(`${simplified} ${deepened}`).not.toContain(reference.finalAnswer);
  });

  it("requires two topic sessions before adapting difficulty", () => {
    expect(recommendDifficulty({ currentDifficulty: "Basic", recentSessions: [{ score: 95, supportUsage: 0, diagnoses: [] }] }).confidence).toBe("low");
    expect(recommendDifficulty({ currentDifficulty: "Basic", recentSessions: [
      { score: 90, supportUsage: 0, diagnoses: [] },
      { score: 85, supportUsage: 1, diagnoses: [] },
    ] }).recommendedDifficulty).toBe("Intermediate");
    expect(recommendDifficulty({ currentDifficulty: "Advanced", recentSessions: [
      { score: 75, supportUsage: 0, diagnoses: ["invalid_logic"] },
      { score: 72, supportUsage: 0, diagnoses: ["invalid_logic"] },
    ] }).recommendedDifficulty).toBe("Intermediate");
  });

  it("uses administrator-managed difficulty thresholds", () => {
    const recommendation = recommendDifficulty({
      currentDifficulty: "Basic",
      recentSessions: [
        { score: 75, supportUsage: 2, diagnoses: [] },
        { score: 76, supportUsage: 2, diagnoses: [] },
      ],
      policy: {
        minimumCompletedSessions: 2,
        increaseScoreThreshold: 75,
        decreaseScoreThreshold: 50,
        maxHintsForIncrease: 2,
        arithmeticErrorAloneLowersDifficulty: false,
      },
    });
    expect(recommendation.recommendedDifficulty).toBe("Intermediate");
  });
});
