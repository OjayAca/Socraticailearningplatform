import { createHash } from "node:crypto";
import type { ReportKind } from "@mindguide/contracts";
import { database, Timestamp } from "./runtime.js";

export async function queryReportRows(data: {
  kind: ReportKind;
  subject?: string;
  topic?: string;
  from?: number;
  to?: number;
  includeIdentity: boolean;
  limit: number;
}): Promise<Record<string, unknown>[]> {
  if (data.kind === "learning_progress") {
    const snapshot = await database.collection("learning_progress").limit(data.limit).get();
    const profiles = data.includeIdentity && snapshot.size
      ? await database.getAll(...snapshot.docs.map((document) => database.doc(`users/${document.id}`)))
      : [];
    const names = new Map(profiles.map((profile) => [profile.id, profile.get("displayName")]));
    return snapshot.docs.map((document) => {
      const progress = document.data();
      return {
        kind: data.kind,
        learner: data.includeIdentity ? names.get(document.id) ?? "Learner" : pseudonymFor(document.id),
        sessionsCompleted: Number(progress.sessionsCompleted ?? 0),
        averageCTScore: Number(progress.averageCTScore ?? 0),
        currentStreak: Number(progress.currentStreak ?? 0),
        lastSessionAt: isoTimestamp(progress.lastSessionAt),
      };
    });
  }

  let query: FirebaseFirestore.Query = database.collection("sessions").orderBy("updatedAt", "desc");
  if (data.subject) query = query.where("subject", "==", data.subject);
  if (data.topic) query = query.where("topic", "==", data.topic);
  if (data.from) query = query.where("updatedAt", ">=", Timestamp.fromMillis(data.from));
  if (data.to) query = query.where("updatedAt", "<=", Timestamp.fromMillis(data.to));
  const snapshot = await query.limit(data.limit).get();
  if (data.kind === "misconceptions") {
    const counts = new Map<string, { category: string; subject: string; topic: string; count: number }>();
    snapshot.docs.forEach((document) => {
      const session = document.data();
      const categories = Array.isArray(session.diagnosisSummary) ? session.diagnosisSummary : [];
      categories.forEach((category) => {
        if (typeof category !== "string" || category === "none") return;
        const key = `${session.subject}\u0000${session.topic}\u0000${category}`;
        const existing = counts.get(key);
        counts.set(key, {
          category,
          subject: String(session.subject ?? ""),
          topic: String(session.topic ?? ""),
          count: (existing?.count ?? 0) + 1,
        });
      });
    });
    return [...counts.values()].map((row) => ({ kind: data.kind, ...row }));
  }

  return snapshot.docs.map((document) => {
    const session = document.data();
    const common = {
      kind: data.kind,
      sessionId: document.id,
      learner: data.includeIdentity ? session.studentName : pseudonymFor(String(session.studentId)),
      subject: session.subject,
      topic: session.topic,
      difficulty: session.difficulty,
      status: session.status,
      updatedAt: isoTimestamp(session.updatedAt),
    };
    if (data.kind === "scorecards") {
      const criteria = session.scorecard?.criteria ?? {};
      return {
        ...common,
        score: session.scorecard?.total ?? null,
        accuracy: criteria.accuracy?.score ?? null,
        logicalValidity: criteria.logicalValidity?.score ?? null,
        methodSelection: criteria.methodSelection?.score ?? null,
        explanationQuality: criteria.explanationQuality?.score
          ?? Math.round((Number(criteria.justificationQuality?.score ?? 0) + Number(criteria.interpretationQuality?.score ?? 0)) / 2),
      };
    }
    if (data.kind === "usage") {
      return {
        ...common,
        supportRequests: Number(session.supportUsage ?? 0),
        hintsUsed: Number(session.hintsUsed ?? 0),
        aiFallbackEvents: Array.isArray(session.aiFallbackEvents) ? session.aiFallbackEvents.length : 0,
        responses: Array.isArray(session.phaseResponses) ? session.phaseResponses.length : 0,
      };
    }
    return { ...common, currentPhase: session.currentPhase, submittedAt: isoTimestamp(session.submittedAt), reviewedAt: isoTimestamp(session.reviewedAt) };
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
  return `Learner-${createHash("sha256").update(uid).digest("hex").slice(0, 12)}`;
}

function isoTimestamp(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return typeof value === "number" ? new Date(value).toISOString() : null;
}
