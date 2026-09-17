import {
  SCHEMA_VERSION,
  WORKFLOW_VERSION,
  type SessionStatus,
} from "@mindguide/contracts";

type SessionCompatibilityRecord = {
  id?: string;
  schemaVersion?: unknown;
  workflowVersion?: unknown;
  status?: unknown;
};

const RESUMABLE_STATUSES = new Set<SessionStatus>([
  "in_progress",
  "ready_for_submission",
]);

export function isCurrentLearningSession(
  session: SessionCompatibilityRecord,
): boolean {
  return session.schemaVersion === SCHEMA_VERSION
    && session.workflowVersion === WORKFLOW_VERSION;
}

export function isResumableLearningSession(
  session: SessionCompatibilityRecord,
): boolean {
  return isCurrentLearningSession(session)
    && RESUMABLE_STATUSES.has(session.status as SessionStatus);
}

export function learnerSessionDestination(
  session: SessionCompatibilityRecord & { id: string },
): string {
  return isResumableLearningSession(session)
    ? `/session/${session.id}/learn`
    : `/student/review/${session.id}`;
}
