import { describe, expect, it } from "vitest";
import { sessionLifecycleAction } from "../../src/lib/learning/lifecycle";

describe("session inactivity lifecycle", () => {
  const hour = 3_600_000;
  it("warns at 75 percent, deduplicates the warning, and expires at the deadline", () => {
    expect(sessionLifecycleAction({ lastActivityAt: 0, now: 17.99 * hour, inactivityHours: 24, reminderAlreadySent: false })).toBe("none");
    expect(sessionLifecycleAction({ lastActivityAt: 0, now: 18 * hour, inactivityHours: 24, reminderAlreadySent: false })).toBe("remind");
    expect(sessionLifecycleAction({ lastActivityAt: 0, now: 20 * hour, inactivityHours: 24, reminderAlreadySent: true })).toBe("none");
    expect(sessionLifecycleAction({ lastActivityAt: 0, now: 24 * hour, inactivityHours: 24, reminderAlreadySent: true })).toBe("expire");
  });
});
