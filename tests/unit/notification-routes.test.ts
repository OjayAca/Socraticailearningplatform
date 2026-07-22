import { describe, expect, it } from "vitest";
import { getNotificationActionUrl } from "../../src/stores/notification-store";

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
});
