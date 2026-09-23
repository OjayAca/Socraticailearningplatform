import { describe, expect, it } from "vitest";
import { rebuildP1Progress } from "../../scripts/p1-progress-core";

describe("P1 progress backfill", () => {
  it("rebuilds all-time totals, subject rollups, latest scorecard, and historical awards", () => {
    const day = 86_400_000;
    const start = Date.parse("2026-07-28T04:00:00Z");
    const sessions = Array.from({ length: 5 }, (_, index) => ({
      id: `session-${index + 1}`,
      subject: (index % 2 ? "Discrete Mathematics" : "Quantitative Methods") as "Discrete Mathematics" | "Quantitative Methods",
      topic: index % 2 ? "Logic and Propositions" : "Probability",
      score: index === 1 ? 82 : 70,
      summary: `Summary ${index + 1}`,
      generatedAt: start + index * day,
      submittedAt: start + index * day,
      recommendedDifficulty: index === 4 ? "Intermediate" as const : "Basic" as const,
      recommendationReason: "Deterministic recommendation",
    }));
    const progress = rebuildP1Progress("student-1", sessions, start + 5 * day);
    expect(progress).toMatchObject({ sessionsCompleted: 5, scoreTotal: 362, averageCTScore: 72, currentStreak: 5 });
    expect(progress.latestScorecard?.sessionId).toBe("session-5");
    expect(progress.subjectProgress["Quantitative Methods"]).toMatchObject({ sessionsCompleted: 3, recommendedDifficulty: "Intermediate" });
    expect(Object.keys(progress.achievements).sort()).toEqual(["dedicated_learner", "first_step", "strong_reasoner", "three_day_streak"]);
  });

  it("resets a stale current streak without discarding a historical streak award", () => {
    const sessions = [0, 1, 2].map((offset) => ({
      id: `session-${offset}`,
      subject: "Quantitative Methods" as const,
      topic: "Probability",
      score: 70,
      summary: "Summary",
      generatedAt: Date.parse("2026-07-01T04:00:00Z") + offset * 86_400_000,
      submittedAt: Date.parse("2026-07-01T04:00:00Z") + offset * 86_400_000,
    }));
    const progress = rebuildP1Progress("student-1", sessions, Date.parse("2026-08-02T04:00:00Z"));
    expect(progress.currentStreak).toBe(0);
    expect(progress.achievements.three_day_streak).toBeDefined();
  });
});
