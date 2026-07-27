import { describe, expect, it } from "vitest";
import type { ReasoningPhase } from "@mindguide/contracts";
import { Timestamp } from "../runtime.js";
import {
  isStudentMutationAllowed,
  nextLearningProgress,
  projectStageProgress,
} from "../session-state.js";
import type { GateStateMap } from "../workflow.js";

function gateStates(
  accepted: ReasoningPhase[],
  active: ReasoningPhase
): GateStateMap {
  const phases: ReasoningPhase[] = [
    "problem_understanding",
    "relevant_information_identification",
    "method_selection",
    "formula_theorem_justification",
    "guided_computation_or_proof",
    "verification_and_checking",
    "result_interpretation",
  ];
  return Object.fromEntries(
    phases.map((phase) => [
      phase,
      {
        status: accepted.includes(phase)
          ? "accepted"
          : phase === active
            ? "pending"
            : "locked",
        attempts: 0,
      },
    ])
  ) as unknown as GateStateMap;
}

describe("session state helpers", () => {
  it("projects internal gates into the four learner-visible stages", () => {
    const progress = projectStageProgress(
      gateStates(
        [
          "problem_understanding",
          "relevant_information_identification",
        ],
        "method_selection"
      ),
      "method_selection"
    );

    expect(progress.problem_understanding.status).toBe("completed");
    expect(progress.method_selection).toMatchObject({
      acceptedGates: 0,
      totalGates: 2,
      status: "active",
    });
    expect(progress.computation.status).toBe("locked");
  });

  it("advances streaks using Asia/Manila calendar dates", () => {
    const progress = nextLearningProgress(
      "student-1",
      {
        sessionsCompleted: 3,
        scoreTotal: 240,
        currentStreak: 3,
        lastSessionDate: "2026-07-26",
      },
      90,
      Timestamp.fromDate(new Date("2026-07-27T15:30:00.000Z"))
    );

    expect(progress).toMatchObject({
      sessionsCompleted: 4,
      scoreTotal: 330,
      averageCTScore: 83,
      currentStreak: 4,
      lastSessionDate: "2026-07-27",
    });
  });

  it("keeps student mutations constrained by lifecycle status", () => {
    expect(isStudentMutationAllowed("in_progress", "reasoning")).toBe(true);
    expect(isStudentMutationAllowed("ready_for_submission", "submit")).toBe(true);
    expect(isStudentMutationAllowed("submitted", "support")).toBe(false);
    expect(isStudentMutationAllowed("returned", "follow_up")).toBe(true);
  });
});
