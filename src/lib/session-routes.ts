import type { SessionStep } from "@/types";

const STEP_SEGMENTS: Record<SessionStep, string> = {
  trigger: "trigger",
  questioning: "questioning",
  hints: "hints",
  logic_map: "logic-map",
  draft: "draft",
  review: "review",
  log: "log",
  confirmation: "confirmation",
};

export function getSessionPath(
  sessionId: string,
  step: SessionStep = "questioning"
): string {
  return `/session/${encodeURIComponent(sessionId)}/${STEP_SEGMENTS[step]}`;
}

export function getStudentReviewPath(sessionId: string): string {
  return `/student/review/${encodeURIComponent(sessionId)}`;
}

export function getAdminReviewPath(sessionId: string): string {
  return `/admin/review/${encodeURIComponent(sessionId)}`;
}
