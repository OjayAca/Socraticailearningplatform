import { observedWriter } from "../functions/src/observed-writer.ts";

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import type { Difficulty, Subject } from "@mindguide/contracts";
import { rebuildP1Progress, type P1SessionRecord } from "./p1-progress-core.ts";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const ROLLBACK = process.argv.includes("--rollback");
const BACKUP_DIRECTORY = path.resolve(".local-backups");
const descriptions: Record<Subject, string> = {
  "Quantitative Methods": "Practice interpreting data, probability, correlation, and descriptive statistics through justified calculations.",
  "Discrete Mathematics": "Practice logic, counting, proof, and combinatorial reasoning through explicit, verifiable steps.",
};

await loadLocalEnvironment();
const projectId = argumentValue("--project") || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Missing Firebase project ID. Pass --project=<id> or configure VITE_FIREBASE_PROJECT_ID.");
if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId });
const database = getFirestore();
database.settings({ ignoreUndefinedProperties: true });

if (ROLLBACK) {
  await rollback(argumentValue("--backup"));
  process.exit(0);
}
if (VERIFY) {
  await verify(true);
  process.exit(0);
}

const [sessions, existingProgress, existingNotifications] = await Promise.all([
  database.collection("sessions").get(),
  database.collection("learning_progress").get(),
  database.collection("notifications").get(),
]);
const progressByUser = new Map(existingProgress.docs.map((document) => [document.id, document.data()]));
const notificationIds = new Set(existingNotifications.docs.map((document) => document.id));
const grouped = new Map<string, P1SessionRecord[]>();
for (const document of sessions.docs) {
  const value = document.data();
  if (!value.scorecard || (!value.statsCommittedAt && !["submitted", "reviewed", "returned"].includes(value.status))) continue;
  const submittedAt = millis(value.submittedAt ?? value.updatedAt);
  const list = grouped.get(String(value.studentId)) ?? [];
  list.push({
    id: document.id,
    subject: value.subject as Subject,
    topic: String(value.topic ?? ""),
    score: Number(value.scorecard.total ?? value.ctScore ?? 0),
    summary: String(value.scorecard.feedback ?? "Your critical-thinking scorecard is ready."),
    generatedAt: Number(value.scorecard.generatedAt ?? submittedAt),
    submittedAt,
    recommendedDifficulty: (value.difficultyRecommendation?.recommendedDifficulty ?? value.adaptiveRecommendation?.recommendedDifficulty) as Difficulty | undefined,
    recommendationReason: value.difficultyRecommendation?.reason ?? value.adaptiveRecommendation?.reason,
  });
  grouped.set(String(value.studentId), list);
}

const operations: Array<{ path: string; data: Record<string, unknown>; merge: boolean }> = Object.entries(descriptions).map(([subject, description]) => ({
  path: `subjects/${slug(subject)}`,
  data: { description, updatedAt: FieldValue.serverTimestamp(), updatedBy: "migration-p1" },
  merge: true,
}));
for (const [uid, records] of grouped) {
  const rebuilt = rebuildP1Progress(uid, records);
  const current = progressByUser.get(uid) ?? {};
  operations.push({
    path: `learning_progress/${uid}`,
    data: { ...rebuilt, topicRecommendations: current.topicRecommendations ?? {}, updatedAt: FieldValue.serverTimestamp() },
    merge: true,
  });
  for (const award of Object.values(rebuilt.achievements)) {
    if (!award) continue;
    const notificationId = `achievement_awarded__${award.id}__${uid}`;
    if (notificationIds.has(notificationId)) continue;
    operations.push({
      path: `notifications/${notificationId}`,
      data: {
        eventType: "achievement_awarded",
        senderId: "system",
        recipientId: uid,
        sessionId: award.sourceSessionId,
        achievementId: award.id,
        title: `Achievement unlocked: ${award.title}`,
        message: award.description,
        actionUrl: "/student/profile",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      },
      merge: true,
    });
  }
}

const backup = await createBackup(operations.map((operation) => operation.path));
console.log(`MINDGUIDE P1 migration (${APPLY ? "APPLY" : "DRY RUN"})`);
console.log(`Firebase project: ${projectId}`);
console.log(`Backup manifest: ${backup}`);
console.log(`Planned document writes: ${operations.length}`);
if (!APPLY) {
  console.log("Dry run complete. Existing records were not changed.");
  process.exit(0);
}
const writer = observedWriter(database.bulkWriter());
for (const operation of operations) writer.set(database.doc(operation.path), operation.data, operation.merge ? { merge: true } : undefined);
await writer.close();
await verify(false);
console.log("P1 migration applied and verified.");

async function verify(logSuccess: boolean): Promise<void> {
  for (const [subject, description] of Object.entries(descriptions)) {
    const snapshot = await database.doc(`subjects/${slug(subject)}`).get();
    if (!snapshot.exists || snapshot.get("description") !== description) throw new Error(`Subject description verification failed for ${subject}.`);
  }
  const progress = await database.collection("learning_progress").get();
  for (const document of progress.docs) {
    if (Number(document.get("sessionsCompleted") ?? 0) > 0 && !document.get("latestScorecard")) {
      throw new Error(`Progress verification failed for ${document.id}: latestScorecard is missing.`);
    }
  }
  if (logSuccess) console.log("P1 verification passed.");
}

async function createBackup(paths: string[]): Promise<string> {
  await mkdir(BACKUP_DIRECTORY, { recursive: true });
  const records = [];
  for (const item of [...new Set(paths)].sort()) {
    const snapshot = await database.doc(item).get();
    records.push({ path: item, exists: snapshot.exists, data: snapshot.exists ? encode(snapshot.data()) : null });
  }
  const filename = path.join(BACKUP_DIRECTORY, `migration-p1-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(filename, JSON.stringify({ schema: 1, projectId, createdAt: new Date().toISOString(), records }, null, 2), "utf8");
  return filename;
}

async function rollback(requestedFile?: string): Promise<void> {
  const filename = requestedFile ? path.resolve(requestedFile) : await latestBackup();
  const backup = JSON.parse(await readFile(filename, "utf8"));
  if (backup.projectId !== projectId) throw new Error(`Backup project ${backup.projectId} does not match ${projectId}.`);
  const writer = observedWriter(database.bulkWriter());
  for (const record of backup.records) {
    const ref = database.doc(record.path);
    if (record.exists) writer.set(ref, decode(record.data)); else writer.delete(ref);
  }
  await writer.close();
  console.log(`Rollback restored ${backup.records.length} document states from ${filename}.`);
}

async function latestBackup(): Promise<string> {
  const entries = (await readdir(BACKUP_DIRECTORY)).filter((name) => name.startsWith("migration-p1-") && name.endsWith(".json")).sort();
  if (!entries.length) throw new Error("No P1 backup was found. Pass --backup=<file>.");
  return path.join(BACKUP_DIRECTORY, entries.at(-1)!);
}

function millis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) return (value as Timestamp).toMillis();
  return typeof value === "number" ? value : Date.now();
}
function encode(value: unknown): unknown {
  if (value instanceof Timestamp) return { __type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encode(nested)]));
  return value;
}
function decode(value: any): any {
  if (value?.__type === "timestamp") return new Timestamp(value.seconds, value.nanoseconds);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decode(nested)]));
  return value;
}
async function loadLocalEnvironment(): Promise<void> {
  for (const filename of [".env", ".env.local"]) {
    try {
      const contents = await readFile(path.resolve(filename), "utf8");
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  }
}
function argumentValue(name: string): string | undefined {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1).replace(/^['"]|['"]$/g, "");
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
