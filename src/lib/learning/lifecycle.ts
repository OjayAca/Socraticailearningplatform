export type SessionLifecycleAction = "none" | "remind" | "expire";

export function sessionLifecycleAction(options: {
  lastActivityAt: number;
  now: number;
  inactivityHours: number;
  reminderAlreadySent: boolean;
}): SessionLifecycleAction {
  const boundedHours = Math.min(Math.max(options.inactivityHours, 1), 24 * 30);
  const elapsed = options.now - options.lastActivityAt;
  const expiry = boundedHours * 3_600_000;
  if (elapsed >= expiry) return "expire";
  if (!options.reminderAlreadySent && elapsed >= expiry * 0.75) return "remind";
  return "none";
}

export function inactivityReminderId(sessionId: string, userId: string): string {
  return `session_inactivity_reminder__${sessionId}__${userId}`;
}
