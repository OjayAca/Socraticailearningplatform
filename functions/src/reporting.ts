import { contentHash } from "./content-hash.js";
import { createHash } from "node:crypto";
import type { ReportKind } from "@mindguide/contracts";
import { database, Timestamp } from "./runtime.js";

export interface ReportInput {
  kind: ReportKind; subject?: string; topic?: string; from?: number; to?: number; includeIdentity: boolean; limit: number; cursor?: string;
}
export async function queryReportPage(data: ReportInput) {
  const fingerprint = createHash("sha256").update(JSON.stringify([data.kind, data.subject, data.topic, data.from, data.to, data.includeIdentity])).digest("hex");
  let offset = 0, asOf = Date.now();
  let expectedPopulationHash: string | undefined;
  if (data.cursor) {
    const cursor = JSON.parse(Buffer.from(data.cursor, "base64url").toString("utf8"));
    if (cursor.fingerprint !== fingerprint || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || !Number.isSafeInteger(cursor.asOf) || cursor.asOf > asOf) throw new Error("Invalid report cursor or changed filters");
    offset = cursor.offset; asOf = cursor.asOf; expectedPopulationHash = cursor.populationHash;
  }
  if (data.from !== undefined && data.to !== undefined && data.from > data.to) throw new Error("The report start date must not follow its end date");
  const eventField = ["activity", "usage"].includes(data.kind) ? "createdAt" : "submittedAt";
  let source: FirebaseFirestore.Query = database.collection("sessions").orderBy(eventField).orderBy("__name__");
  if (data.subject) source = source.where("subject", "==", data.subject);
  if (data.topic) source = source.where("topic", "==", data.topic);
  if (data.from !== undefined) source = source.where(eventField, ">=", Timestamp.fromMillis(data.from));
  source = source.where(eventField, "<=", Timestamp.fromMillis(Math.min(data.to ?? asOf, asOf)));
  const records: Array<Record<string, any>> = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    const page = await (last ? source.startAfter(last) : source).limit(250).get();
    for (const document of page.docs) {
      const session = document.data();
      if (eventField === "submittedAt" && !session.statsCommittedAt) continue;
      records.push({ id: document.id, ...session });
    }
    if (page.size < 250) break;
    last = page.docs.at(-1);
  }
  const rows = aggregateReport(records, data);
  const populationHash = contentHash(rows);
  if (data.cursor && expectedPopulationHash !== populationHash) throw new Error("The report population changed during export. Restart the export to obtain a complete consistent result.");
  const selected = rows.slice(offset, offset + data.limit);
  const next = offset + selected.length;
  return { rows: selected, totalRows: rows.length, populationCount: records.length, eventField, asOf,
    complete: next >= rows.length, nextCursor: next < rows.length ? Buffer.from(JSON.stringify({ fingerprint, populationHash, offset: next, asOf })).toString("base64url") : null };
}

function aggregateReport(records: Array<Record<string, any>>, data: Pick<ReportInput, "kind" | "includeIdentity">): Record<string, unknown>[] {
  const learner = (session: Record<string, any>) => data.includeIdentity ? session.studentName ?? "Learner" : pseudonymFor(String(session.studentId));
  if (data.kind === "learning_progress") {
    const groups = new Map<string, { kind: string; learner: string; sessionsCompleted: number; scoreTotal: number; averageCTScore: number | null; calibratedSessions: number; excludedUncalibratedSessions: number }>();
    for (const session of records) {
      const key = String(session.studentId);
      const row = groups.get(key) ?? { kind: data.kind, learner: learner(session), sessionsCompleted: 0, scoreTotal: 0, averageCTScore: null, calibratedSessions: 0, excludedUncalibratedSessions: 0 };
      row.sessionsCompleted++;
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
      status: session.status ?? null, createdAt: isoTimestamp(session.createdAt), submittedAt: isoTimestamp(session.submittedAt), reviewedAt: isoTimestamp(session.reviewedAt), assistedFollowUp: Boolean(session.parentSessionId) };
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
  return `Learner-${createHash("sha256").update(uid).digest("hex").slice(0, 12)}`;
}

function isoTimestamp(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return typeof value === "number" ? new Date(value).toISOString() : null;
}
