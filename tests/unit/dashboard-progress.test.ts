import { describe, expect, it } from "vitest";
import { dashboardProgress } from "../../src/lib/learning/dashboard-progress";

describe("dashboard progress", () => {
  it("counts all completions, includes legacy scores and excludes unfinished work", () => {
    const sessions = Array.from({ length: 25 }, (_, i) => ({ id: String(i), status: "completed", ctScore: 92 }));
    const result = dashboardProgress([...sessions, { status: "in_progress", ctScore: 0 }, { status: "abandoned", ctScore: 10 }, { status: "ready_for_submission", scorecard: { total: 100 } }]);
    expect(result).toMatchObject({ sessionsCompleted: 25, averageCTScore: 92, latestScorecard: null });
  });

  it("uses Manila completion dates, deduplicates days, and expires the streak", () => {
    const sessions = [
      { id: "a", status: "submitted", submittedAt: "2026-09-22T16:30:00Z", scorecard: { total: 80 } },
      { id: "b", status: "reviewed", submittedAt: { toMillis: () => Date.parse("2026-09-23T16:30:00Z") }, scorecard: { total: 90 } },
      { id: "c", status: "returned", submittedAt: "2026-09-24T04:00:00Z", ctScore: 100 },
    ];
    expect(dashboardProgress(sessions, new Date("2026-09-24T10:00:00Z"))).toMatchObject({ sessionsCompleted: 3, averageCTScore: 90, currentStreak: 2, latestScorecard: { sessionId: "b", total: 90 } });
    expect(dashboardProgress(sessions, new Date("2026-09-25T16:00:00Z")).currentStreak).toBe(0);
  });

  it("does not invent scores for missing or invalid evidence", () => {
    expect(dashboardProgress([{ status: "completed" }, { status: "submitted", ctScore: NaN }])).toMatchObject({ sessionsCompleted: 2, averageCTScore: null, latestScorecard: null });
    expect(dashboardProgress([{ status: "completed", ctScore: 0 }]).averageCTScore).toBe(0);
  });
});
