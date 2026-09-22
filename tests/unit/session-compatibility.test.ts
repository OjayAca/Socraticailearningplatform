import { describe, expect, it } from "vitest";
import {
  isCurrentLearningSession,
  isResumableLearningSession,
  learnerSessionDestination,
} from "@/lib/session-compatibility";

describe("current learning-session compatibility", () => {
  it("accepts AI workflow v6 sessions created by the current workflow", () => {
    expect(isCurrentLearningSession({ schemaVersion: 5, workflowVersion: 6 })).toBe(true);
  });

  it.each(["in_progress", "ready_for_submission"])(
    "routes a AI workflow v6 %s session back to the learner workflow",
    (status) => {
      const session = {
        id: `session-${status}`,
        schemaVersion: 5,
        workflowVersion: 6,
        status,
      };

      expect(isResumableLearningSession(session)).toBe(true);
      expect(learnerSessionDestination(session)).toBe(`/session/${session.id}/learn`);
    },
  );

  it("keeps incompatible schema-v3 sessions in read-only history", () => {
    const legacy = {
      id: "legacy-session",
      schemaVersion: 3,
      workflowVersion: 6,
      status: "in_progress",
    };

    expect(isCurrentLearningSession(legacy)).toBe(false);
    expect(isResumableLearningSession(legacy)).toBe(false);
    expect(learnerSessionDestination(legacy)).toBe("/student/review/legacy-session");
  });

  it.each(["submitted", "reviewed", "returned", "abandoned", "expired"])(
    "keeps terminal AI workflow v6 status %s in read-only history",
    (status) => {
      expect(learnerSessionDestination({
        id: `session-${status}`,
        schemaVersion: 5,
        workflowVersion: 6,
        status,
      })).toBe(`/student/review/session-${status}`);
    },
  );
});
