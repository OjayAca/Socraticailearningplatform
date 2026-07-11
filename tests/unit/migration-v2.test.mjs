import { describe, expect, it } from "vitest";
import {
  normalizeProfileV2,
  normalizeSessionV2,
  recalculateStats,
} from "../../scripts/migration-v2-core.mjs";

const baseLegacySession = {
  studentId: "student-1",
  studentName: "Student One",
  studentEmail: "student@example.test",
  subject: "Discrete Mathematics",
  topic: "Logic and Propositions",
  originalQuestion: "Determine whether p implies q.",
  status: "completed",
  currentStep: "confirmation",
  currentPhase: "scorecard",
  ctScore: 80,
  createdAt: 1_000,
  updatedAt: 2_000,
  completedAt: 2_000,
  messages: [],
  selectedProblem: {
    id: "dm-logic-basic-1",
    difficulty: "Basic",
    problemText: "Determine whether p implies q.",
    finalAnswer: "private answer",
    solutionSteps: ["private step"],
  },
};

describe("schema-v2 migration mapping", () => {
  it("promotes the legacy teacher role without changing public student roles", () => {
    expect(normalizeProfileV2({ role: "teacher" }).role).toBe("admin");
    expect(normalizeProfileV2({ role: "student" }).role).toBe("student");
  });

  it("maps confirmed legacy completions to submitted and removes solution fields", () => {
    const migrated = normalizeSessionV2("session-1", baseLegacySession);

    expect(migrated.data.status).toBe("submitted");
    expect(migrated.data.statsCommittedAt).toBe(2_000);
    expect(migrated.data.problemContext.mode).toBe("curated");
    expect(JSON.stringify(migrated.data.problemContext)).not.toContain(
      "private answer"
    );
    expect(migrated.removeFields).toContain("selectedProblem");
  });

  it("restores prematurely completed sessions to in progress", () => {
    const migrated = normalizeSessionV2("session-2", {
      ...baseLegacySession,
      currentStep: "questioning",
    });

    expect(migrated.data.status).toBe("in_progress");
    expect(migrated.data.submittedAt).toBeNull();
    expect(migrated.data.statsCommittedAt).toBeNull();
  });

  it("converts legacy feedback into an immutable administrator outcome", () => {
    const migrated = normalizeSessionV2("session-3", {
      ...baseLegacySession,
      teacherId: "admin-1",
      teacherFeedback: {
        action: "returned",
        comment: "Explain the implication step.",
        timestamp: 3_000,
      },
    });

    expect(migrated.data.status).toBe("returned");
    expect(migrated.data.adminReview).toEqual({
      outcome: "returned",
      comment: "Explain the implication step.",
      reviewedBy: "admin-1",
      reviewedAt: 3_000,
    });
  });

  it("recalculates statistics only from submitted or reviewed lifecycle records", () => {
    const sessions = [
      normalizeSessionV2("one", baseLegacySession).data,
      normalizeSessionV2("two", {
        ...baseLegacySession,
        status: "in_progress",
        currentStep: "draft",
        ctScore: 100,
        submittedAt: null,
        completedAt: null,
      }).data,
    ];
    const stats = recalculateStats(sessions);

    expect(stats.sessionsCompleted).toBe(1);
    expect(stats.averageCTScore).toBe(80);
    expect(stats.topicPerformance[0].attemptsCount).toBe(1);
  });
});
