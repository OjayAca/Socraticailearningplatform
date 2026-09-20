import { Timestamp } from "firebase/firestore";
import type { ReportKind } from "@mindguide/contracts";
interface ReportInput { kind: ReportKind; includeIdentity: boolean }
export function aggregateReport(records: Array<Record<string, any>>, data: Pick<ReportInput, "kind" | "includeIdentity">): Record<string, unknown>[] {
  const learner = (session: Record<string, any>) => data.includeIdentity ? session.studentName ?? "Learner" : pseudonymFor(String(session.studentId));
  if (data.kind === "learning_progress") {
    const groups = new Map<string, { kind: string; learner: string; sessionsCompleted: number; scoreTotal: number; averageCTScore: number | null; calibratedSessions: number; excludedUncalibratedSessions: number; practiceSessions: number; practiceScoreTotal: number; averagePracticeScore: number | null }>();
    for (const session of records) {
      const key = String(session.studentId);
      const row = groups.get(key) ?? { kind: data.kind, learner: learner(session), sessionsCompleted: 0, scoreTotal: 0, averageCTScore: null, calibratedSessions: 0, excludedUncalibratedSessions: 0, practiceSessions: 0, practiceScoreTotal: 0, averagePracticeScore: null };
      row.sessionsCompleted++;
      if (session.scorecard?.rubricVersion === "spark-practice-v1" && Number.isFinite(session.scorecard.total)) {
        row.practiceSessions++;
        row.practiceScoreTotal += session.scorecard.total;
        row.averagePracticeScore = row.practiceScoreTotal / row.practiceSessions;
      }
      if (session.scorecard?.calibrationStatus === "calibrated" && Number.isFinite(session.scorecard?.total)) {
        row.calibratedSessions++;
        row.scoreTotal += session.scorecard.total;
        row.averageCTScore = row.scoreTotal / row.calibratedSessions;
      } else {
        row.excludedUncalibratedSessions++;
      }
      groups.set(key, row);
    }
    return [...groups.values()].sort((a,b) => a.learner.localeCompare(b.learner));
  }
  if (data.kind === "misconceptions") {
    const counts = new Map<string, Record<string, any>>();
    for (const session of records) for (const category of new Set<string>(session.diagnosisSummary ?? [])) {
      if (category === "none") continue;
      const key = JSON.stringify([session.subject, session.topic, category]);
      const row = counts.get(key) ?? { kind: data.kind, subject: session.subject ?? null, topic: session.topic ?? null, category, affectedSessions: 0 };
      row.affectedSessions++; counts.set(key,row);
    }
    return [...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>row);
  }
  return records.map(session => {
    const common = { kind: data.kind, sessionId: session.id, learner: learner(session), subject: session.subject ?? null, topic: session.topic ?? null, difficulty: session.difficulty ?? null,
      status: session.status ?? null, scoreSource: session.scoringSource ?? "legacy", createdAt: isoTimestamp(session.createdAt), submittedAt: isoTimestamp(session.submittedAt), reviewedAt: isoTimestamp(session.reviewedAt), assistedFollowUp: Boolean(session.parentSessionId) };
    if (data.kind === "usage") return { ...common, responses: Number(session.responseCount ?? 0), supportRequests: Number(session.supportUsage ?? 0), aiFallbackEvents: session.aiFallbackEvents?.length ?? 0 };
    if (data.kind === "scorecards") return { ...common, score: session.scorecard?.total ?? null, rubricVersion: session.scorecard?.rubricVersion ?? "legacy", calibrationStatus: session.scorecard?.calibrationStatus ?? "uncalibrated",
      accuracy: session.scorecard?.criteria?.accuracy?.score ?? null, logicalValidity: session.scorecard?.criteria?.logicalValidity?.score ?? null, methodSelection: session.scorecard?.criteria?.methodSelection?.score ?? null, explanationQuality: session.scorecard?.criteria?.explanationQuality?.score ?? null };
    return { ...common, currentPhase: session.currentPhase ?? null };
  });
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\r\n");
}

function pseudonymFor(uid: string): string {
  return `Learner-${uid.slice(0, 12)}`;
}

function isoTimestamp(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return typeof value === "number" ? new Date(value).toISOString() : null;
}
