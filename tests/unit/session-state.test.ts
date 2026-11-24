import { describe, expect, it } from "vitest";
import type { ReasoningPhase } from "@mindguide/contracts";
import { Timestamp } from "firebase/firestore";
import {
  awardEligibleAchievements,
  effectiveCurrentStreak,
  isStudentMutationAllowed,
  nextLearningProgress,
  projectStageProgress,
  resolveStoredStreak,
} from "../../src/lib/learning/session-state";
import type { GateStateMap } from "../../src/lib/learning/workflow";

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

  it("awards all deterministic achievements exactly once", () => {
    const first = awardEligibleAchievements({}, {
      sessionId: "session-5",
      sessionsCompleted: 5,
      currentStreak: 3,
      score: 88,
      awardedAt: 123,
    });
    expect(Object.keys(first.achievements)).toEqual([
      "first_step", "dedicated_learner", "three_day_streak", "strong_reasoner",
    ]);
    expect(first.newlyAwarded).toHaveLength(4);
    expect(awardEligibleAchievements(first.achievements, {
      sessionId: "session-6",
      sessionsCompleted: 6,
      currentStreak: 4,
      score: 91,
      awardedAt: 456,
    }).newlyAwarded).toHaveLength(0);
  });

  it("treats a streak as current only through the day after the latest submission", () => {
    expect(effectiveCurrentStreak(3, "2026-08-01", new Date("2026-08-02T04:00:00Z"))).toBe(3);
    expect(effectiveCurrentStreak(3, "2026-07-30", new Date("2026-08-02T04:00:00Z"))).toBe(0);
  });

  it("resolves stored streaks using lastSessionDate or lastSessionAt fallback", () => {
    const now = new Date("2026-08-03T04:00:00Z"); // 12:00 Manila on 2026-08-03
    expect(resolveStoredStreak(4, "2026-08-03", null, now)).toBe(4);
    expect(resolveStoredStreak(4, "2026-08-02", null, now)).toBe(4);
    expect(resolveStoredStreak(4, "2026-08-01", null, now)).toBe(0);
    expect(
      resolveStoredStreak(4, null, Date.parse("2026-08-01T10:00:00Z"), now),
    ).toBe(0);
    expect(
      resolveStoredStreak(4, null, Timestamp.fromDate(new Date("2026-08-02T10:00:00Z")), now),
    ).toBe(4);
    expect(resolveStoredStreak(4, undefined, undefined, now)).toBe(4);
    expect(resolveStoredStreak(0, undefined, undefined, now)).toBe(0);
  });

  it("preserves highest subject recommendedDifficulty across topics instead of downgrading on a Basic topic", () => {
    const updated = nextLearningProgress(
      "student-1",
      {
        sessionsCompleted: 4,
        scoreTotal: 360,
        subjectProgress: {
          "Quantitative Methods": {
            sessionsCompleted: 4,
            scoreTotal: 360,
            averageCTScore: 90,
            lastActivityAt: 100,
            recommendedDifficulty: "Intermediate",
            recommendationReason: "Advanced in Functions",
          },
        },
        topicRecommendations: {
          functions: {
            recommendedDifficulty: "Intermediate",
            reason: "Advanced in Functions",
            confidence: "medium",
          },
          descriptive_statistics: {
            recommendedDifficulty: "Basic",
            reason: "New topic",
            confidence: "low",
          },
        },
      },
      85,
      Timestamp.fromDate(new Date("2026-08-03T04:00:00Z")),
      {
        id: "session-5",
        subject: "Quantitative Methods",
        topic: "Descriptive Statistics",
        scorecardSummary: "Solid reasoning",
        scorecardGeneratedAt: 200,
        recommendation: {
          recommendedDifficulty: "Basic",
          reason: "1/3 Basic completed",
          confidence: "low",
        },
      },
    );
    expect(updated.subjectProgress["Quantitative Methods"]?.recommendedDifficulty).toBe("Intermediate");
    expect(updated.subjectProgress["Quantitative Methods"]?.recommendationReason).toBe("Advanced in Functions");
    expect(updated.topicRecommendations?.descriptive_statistics).toMatchObject({
      recommendedDifficulty: "Basic",
      reason: "1/3 Basic completed",
    });
  });
});
