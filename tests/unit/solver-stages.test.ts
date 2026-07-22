import { describe, expect, it } from "vitest";
import {
  SOLVER_STAGES,
  SOLVER_STAGE_PHASES,
  solverStageForPhase,
} from "@mindguide/contracts";

describe("four-stage Socratic solver contract", () => {
  it("groups all seven internal reasoning gates into four visible stages", () => {
    expect(SOLVER_STAGES).toEqual([
      "problem_understanding",
      "method_selection",
      "computation",
      "interpretation",
    ]);
    expect(Object.values(SOLVER_STAGE_PHASES).flat()).toHaveLength(7);
    expect(solverStageForPhase("relevant_information_identification")).toBe("problem_understanding");
    expect(solverStageForPhase("formula_theorem_justification")).toBe("method_selection");
    expect(solverStageForPhase("verification_and_checking")).toBe("computation");
    expect(solverStageForPhase("result_interpretation")).toBe("interpretation");
  });

  it("keeps solution release and scorecard within the completed interpretation stage", () => {
    expect(solverStageForPhase("controlled_solution_release")).toBe("interpretation");
    expect(solverStageForPhase("critical_thinking_scorecard")).toBe("interpretation");
  });
});
