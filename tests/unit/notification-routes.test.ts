import { describe, expect, it } from "vitest";
import { getNotificationActionUrl, getNotificationText } from "../../src/stores/notification-store";

describe("notification routes", () => {
  it("opens administrator feedback in the surviving learner review screen", () => {
    expect(getNotificationActionUrl({
      id: "notice-1",
      recipientId: "student-1",
      eventType: "session_returned",
      sessionId: "session/with unsafe separators",
      read: false,
    } as never, "student")).toBe("/student/review/session%2Fwith%20unsafe%20separators");
  });

  it("routes typed events by role and encodes session identifiers", () => {
    const submission = {
      eventType: "session_submitted",
      sessionId: "session one",
    } as never;
    expect(getNotificationActionUrl(submission, "admin")).toBe("/admin/review/session%20one");
    expect(getNotificationActionUrl(submission, "student")).toBeUndefined();

    expect(getNotificationActionUrl({ eventType: "achievement_awarded" } as never, "student"))
      .toBe("/student/profile#achievements");
    expect(getNotificationActionUrl({ eventType: "scorecard_ready", sessionId: "score/1" } as never, "student"))
      .toBe("/session/score%2F1/learn");
  });

  it("rejects external legacy action URLs while preserving safe local routes", () => {
    expect(getNotificationActionUrl({ actionUrl: "https://attacker.example/path" } as never, "student")).toBeUndefined();
    expect(getNotificationActionUrl({ actionUrl: "//attacker.example/path" } as never, "student")).toBeUndefined();
    expect(getNotificationActionUrl({ actionUrl: "/student/history" } as never, "student")).toBe("/student/history");
  });

  it("uses canonical fallback copy without overriding complete managed copy", () => {
    expect(getNotificationText({ eventType: "achievement_awarded" } as never)).toEqual({
      title: "Achievement unlocked",
      message: "A new achievement has been added to your profile.",
    });
    expect(getNotificationText({ title: "Managed title", message: "Managed message" } as never)).toEqual({
      title: "Managed title",
      message: "Managed message",
    });
  });
});
