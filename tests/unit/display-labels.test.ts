import { describe, expect, it } from "vitest";
import { REASONING_PHASES } from "@mindguide/contracts";
import {
  STANDARD_SOLVER_STAGES,
  computeDisplayProgressPercent,
  computeDisplayStageProgress,
  displayCohortStateLabel,
  displayContentCollectionLabel,
  displayPhaseLabel,
  displaySessionStatus,
  displayStageDescription,
  displayStageForPhase,
  displayStageLabel,
} from "@/lib/learning/display-labels";

describe("frontend four-stage Socratic mapper", () => {
  it("defines the four standardized student-facing stages with verification_and_checking in Stage 4", () => {
    expect(STANDARD_SOLVER_STAGES.map((stage) => stage.label)).toEqual([
      "Understand the Problem",
      "Choose and Justify",
      "Develop the Solution",
      "Check and Interpret",
    ]);
    expect(STANDARD_SOLVER_STAGES.map((stage) => stage.description)).toEqual([
      "Identify the given information and determine what needs to be solved.",
      "Select the appropriate formula, theorem, principle, or mathematical method and explain why it applies.",
      "Perform the necessary computations, logical operations, or mathematical proofs.",
      "Validate the result and explain its meaning in the context of the problem.",
    ]);

    const mappedPhases = STANDARD_SOLVER_STAGES.flatMap((stage) => stage.phases);
    expect(mappedPhases).toEqual([...REASONING_PHASES]);
    expect(STANDARD_SOLVER_STAGES[2].phases).toEqual([
      "guided_computation_or_proof",
    ]);
    expect(STANDARD_SOLVER_STAGES[3].phases).toEqual([
      "verification_and_checking",
      "result_interpretation",
    ]);
  });

  it("maps all seven internal phases, completion phases, direct stage IDs, and fallbacks", () => {
    expect(displayStageForPhase("problem_understanding")).toBe(
      "problem_understanding",
    );
    expect(displayStageForPhase("relevant_information_identification")).toBe(
      "problem_understanding",
    );
    expect(displayStageForPhase("method_selection")).toBe("method_selection");
    expect(displayStageForPhase("formula_theorem_justification")).toBe(
      "method_selection",
    );
    expect(displayStageForPhase("guided_computation_or_proof")).toBe(
      "computation",
    );
    expect(displayStageForPhase("verification_and_checking")).toBe(
      "interpretation",
    );
    expect(displayStageForPhase("result_interpretation")).toBe(
      "interpretation",
    );

    expect(displayStageForPhase("controlled_solution_release")).toBe(
      "interpretation",
    );
    expect(displayStageForPhase("critical_thinking_scorecard")).toBe(
      "interpretation",
    );

    expect(displayStageForPhase("computation")).toBe("computation");
    expect(displayStageForPhase("interpretation")).toBe("interpretation");

    expect(displayStageForPhase("unknown_legacy_phase")).toBe(
      "problem_understanding",
    );
    expect(displayStageForPhase("")).toBe("problem_understanding");
    expect(displayStageForPhase(null)).toBe("problem_understanding");
    expect(displayStageForPhase(undefined)).toBe("problem_understanding");
  });

  it("returns standardized stage and phase labels with safe fallbacks", () => {
    expect(displayStageLabel("verification_and_checking")).toBe(
      "Check and Interpret",
    );
    expect(displayStageDescription("verification_and_checking")).toBe(
      "Validate the result and explain its meaning in the context of the problem.",
    );
    expect(displayStageLabel("unknown")).toBe("Understand the Problem");

    expect(displayPhaseLabel("verification_and_checking")).toBe(
      "Verify and Check",
    );
    expect(displayPhaseLabel("formula_theorem_justification")).toBe(
      "Justify Formula or Theorem",
    );
    expect(displayPhaseLabel("controlled_solution_release")).toBe(
      "Worked Solution",
    );
    expect(displayPhaseLabel("legacy_custom_step")).toBe("Legacy Custom Step");
    expect(displayPhaseLabel(undefined)).toBe("Reasoning checkpoint");
  });

  it("computes stage progress with verification_and_checking in Stage 4", () => {
    const verificationProgress = computeDisplayStageProgress({
      currentPhase: "verification_and_checking",
      gates: {
        problem_understanding: { status: "accepted" },
        relevant_information_identification: { status: "accepted" },
        method_selection: { status: "accepted" },
        formula_theorem_justification: { status: "accepted" },
        guided_computation_or_proof: { status: "accepted" },
        verification_and_checking: { status: "pending" },
      },
    });

    expect(verificationProgress.map((item) => item.status)).toEqual([
      "completed",
      "completed",
      "completed",
      "active",
    ]);
    expect(verificationProgress[2]).toMatchObject({
      stage: "computation",
      label: "Develop the Solution",
      acceptedGates: 1,
      totalGates: 1,
    });
    expect(verificationProgress[3]).toMatchObject({
      stage: "interpretation",
      label: "Check and Interpret",
      acceptedGates: 0,
      totalGates: 2,
    });
    expect(computeDisplayProgressPercent(verificationProgress)).toBe(75);

    const interpretationProgress = computeDisplayStageProgress({
      currentPhase: "result_interpretation",
      gates: {
        verification_and_checking: { status: "accepted" },
      },
    });
    expect(interpretationProgress[3]).toMatchObject({
      status: "active",
      acceptedGates: 1,
      totalGates: 2,
    });
    expect(computeDisplayProgressPercent(interpretationProgress)).toBe(75);
  });

  it("marks all four stages complete on completion phases and handles selective regression", () => {
    for (const completionPhase of [
      "controlled_solution_release",
      "critical_thinking_scorecard",
    ]) {
      const done = computeDisplayStageProgress({ currentPhase: completionPhase });
      expect(done.every((item) => item.status === "completed")).toBe(true);
      expect(done[2].acceptedGates).toBe(1);
      expect(done[3].acceptedGates).toBe(2);
      expect(computeDisplayProgressPercent(done)).toBe(100);
    }

    const regressed = computeDisplayStageProgress({
      currentPhase: "method_selection",
      gates: {
        problem_understanding: { status: "accepted" },
        relevant_information_identification: { status: "accepted" },
        method_selection: { status: "needs_revision" },
        formula_theorem_justification: { status: "locked" },
        guided_computation_or_proof: { status: "locked" },
      },
    });
    expect(regressed.map((item) => item.status)).toEqual([
      "completed",
      "active",
      "locked",
      "locked",
    ]);
  });

  it("falls back safely when currentPhase is missing or unknown", () => {
    const fromFallback = computeDisplayStageProgress({
      currentPhase: "unrecognized_phase",
      stageProgress: {
        problem_understanding: { status: "completed", acceptedGates: 2, totalGates: 2 },
        method_selection: { status: "active", acceptedGates: 1, totalGates: 2 },
      },
    });
    expect(fromFallback.map((item) => item.status)).toEqual([
      "completed",
      "active",
      "locked",
      "locked",
    ]);
    expect(computeDisplayProgressPercent(fromFallback)).toBe(25);

    const bareFallback = computeDisplayStageProgress({});
    expect(bareFallback.map((item) => item.status)).toEqual([
      "active",
      "locked",
      "locked",
      "locked",
    ]);
    expect(computeDisplayProgressPercent(bareFallback)).toBe(0);
    expect(computeDisplayProgressPercent([])).toBe(0);
  });

  it("formats session statuses, content collections, and cohort states cleanly", () => {
    expect(displaySessionStatus("ready_for_submission")).toBe("Ready to finish");
    expect(displaySessionStatus("abandoned")).toBe("Ended early");
    expect(displaySessionStatus(null)).toBe("Unknown status");

    expect(displayContentCollectionLabel("formula_theorem_references")).toBe(
      "Formulas & Theorems",
    );
    expect(displayCohortStateLabel("drain")).toBe(
      "Finishing active sessions only",
    );
  });
});
