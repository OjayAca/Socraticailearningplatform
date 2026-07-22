#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { mindGuideProblems } from "../src/data/mindguide-problems.ts";
import { SUBJECT_TOPICS } from "../src/types/index.ts";
import {
  buildPrivateProblem,
  findForbiddenPublicKeys,
  sanitizePublicProblemContext,
  shouldPreserveCurrentSession,
} from "./migration-v3-core.ts";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const ROLLBACK = process.argv.includes("--rollback");
const BACKUP_DIRECTORY = path.resolve(".local-backups");

await loadLocalEnvironment();
const projectId =
  argumentValue("--project") ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Missing Firebase project ID. Pass --project=<id> or configure VITE_FIREBASE_PROJECT_ID.");
if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId });
const database = getFirestore();
database.settings({ ignoreUndefinedProperties: true });

if (ROLLBACK) {
  await rollback(argumentValue("--backup"));
  process.exit(0);
}
if (VERIFY) {
  const failures = await verifyPublicData();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("Schema-v3 verification passed: no private instructional keys were found in public documents.");
  process.exit(0);
}

const [users, sessions, notifications, learningProgress] = await Promise.all([
  database.collection("users").get(),
  database.collection("sessions").get(),
  database.collection("notifications").get(),
  database.collection("learning_progress").get(),
]);
const operations = buildOperations(users.docs, sessions.docs, notifications.docs, learningProgress.docs);
const backup = await createBackup(operations.map((operation) => operation.path));

console.log(`MINDGUIDE schema-v3 migration (${APPLY ? "APPLY" : "DRY RUN"})`);
console.log(`Firebase project: ${projectId}`);
console.log(`Backup manifest: ${backup}`);
console.log(`Planned document writes: ${operations.length}`);
console.log(`Prepared problems: ${mindGuideProblems.length}`);
console.log(`Existing users/sessions/notifications: ${users.size}/${sessions.size}/${notifications.size}`);

if (!APPLY) {
  console.log("Dry run complete. Review the backup and re-run with --apply.");
  process.exit(0);
}

const writer = database.bulkWriter();
writer.onWriteError((error) => {
  console.error(`Write failed for ${error.documentRef.path}: ${error.message}`);
  return error.failedAttempts < 3;
});
for (const operation of operations) {
  const ref = database.doc(operation.path);
  writer.set(ref, operation.data, operation.merge ? { merge: true } : undefined);
}
await writer.close();

for (const user of users.docs) {
  const role = user.get("role") === "admin" || user.get("role") === "teacher" ? "admin" : "student";
  const record = await getAuth().getUser(user.id).catch(() => null);
  if (record) await getAuth().setCustomUserClaims(user.id, { ...(record.customClaims ?? {}), role });
}

const failures = await verifyPublicData();
if (failures.length) {
  console.error("Migration applied but verification failed:");
  console.error(failures.join("\n"));
  console.error(`Rollback with: npm run migrate:v3:rollback -- --backup="${backup}" --project="${projectId}"`);
  process.exit(1);
}
console.log("Schema-v3 migration applied and verified successfully.");

function buildOperations(
  userDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  sessionDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  notificationDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  progressDocs: FirebaseFirestore.QueryDocumentSnapshot[]
) {
  const operations: Array<{ path: string; data: DocumentData; merge: boolean }> = [];
  const now = Timestamp.now();

  for (const [subject, topics] of Object.entries(SUBJECT_TOPICS)) {
    const subjectId = slug(subject);
    operations.push({
      path: `subjects/${subjectId}`,
      merge: true,
      data: { name: subject, status: "approved", version: 1, createdAt: now, updatedAt: now, createdBy: "migration-v3", updatedBy: "migration-v3", archivedAt: null },
    });
    for (const topic of topics) {
      operations.push({
        path: `topics/${slug(`${subject}-${topic}`)}`,
        merge: true,
        data: { subjectId, subject, name: topic, status: "approved", version: 1, createdAt: now, updatedAt: now, createdBy: "migration-v3", updatedBy: "migration-v3", archivedAt: null },
      });
    }
  }

  const references = new Map<string, DocumentData>();
  for (const problem of mindGuideProblems) {
    operations.push({
      path: `problems/${problem.id}`,
      merge: false,
      data: {
        subject: problem.subject,
        topic: problem.topic,
        difficulty: problem.difficulty,
        problemText: problem.problemText,
        supportedResponseFormats: ["text", "latex"],
        status: "approved",
        version: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: "migration-v3",
        updatedBy: "migration-v3",
        archivedAt: null,
      },
    });
    operations.push({
      path: `problems/${problem.id}/private/solution`,
      merge: false,
      data: { ...buildPrivateProblem(problem), createdAt: now, updatedAt: now },
    });
    for (const [phase, prompt] of Object.entries(buildPrivateProblem(problem).socraticPrompts)) {
      operations.push({
        path: `socratic_prompt_bank/${problem.id}__${phase}`,
        merge: true,
        data: { problemId: problem.id, phase, prompt, status: "approved", version: 1, createdAt: now, updatedAt: now, createdBy: "migration-v3", updatedBy: "migration-v3", archivedAt: null },
      });
    }
    const value = problem.requiredFormula || problem.requiredTheorem;
    if (value) {
      const referenceId = `ref-${createStableId(`${problem.subject}:${problem.topic}:${value}`)}`;
      references.set(referenceId, {
        kind: problem.requiredFormula ? "formula" : "theorem",
        statement: value,
        variables: [],
        conditions: ["The learner must connect the selected reference to the given information."],
        domain: problem.subject,
        supportedTopics: [problem.topic],
        equivalentNotation: [],
        status: "approved",
        version: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: "migration-v3",
        updatedBy: "migration-v3",
        archivedAt: null,
      });
    }
  }
  for (const [id, data] of references) operations.push({ path: `formula_theorem_references/${id}`, data, merge: true });

  const categories = [
    "conceptual_error", "procedural_error", "wrong_formula", "theorem_condition_violation",
    "invalid_logic", "misinterpreted_variable", "computational_error", "incorrect_interpretation",
    "weak_justification", "skipped_reasoning", "unsupported_response", "none",
  ];
  for (const category of categories) {
    operations.push({ path: `misconception_categories/${category}`, merge: true, data: { name: category, status: "approved", version: 1, createdAt: now, updatedAt: now, createdBy: "migration-v3", updatedBy: "migration-v3", archivedAt: null } });
  }
  operations.push({
    path: "difficulty_policies/default",
    merge: true,
    data: { minimumCompletedSessions: 2, increaseScoreThreshold: 80, decreaseScoreThreshold: 60, maxHintsForIncrease: 1, arithmeticErrorAloneLowersDifficulty: false, status: "approved", version: 1, createdAt: now, updatedAt: now, createdBy: "migration-v3", updatedBy: "migration-v3", archivedAt: null },
  });

  const existingProgressIds = new Set(progressDocs.map((document) => document.id));
  for (const user of userDocs) {
    const role = user.get("role") === "admin" || user.get("role") === "teacher" ? "admin" : "student";
    operations.push({
      path: user.ref.path,
      merge: true,
      data: { schemaVersion: 3, role, status: user.get("status") ?? "active", updatedAt: now, lastActivityAt: user.get("lastActivityAt") ?? user.get("createdAt") ?? now },
    });
    if (!existingProgressIds.has(user.id) && role === "student") {
      const stats = user.get("stats") ?? {};
      const completed = Number(stats.sessionsCompleted ?? 0);
      const average = Number(stats.averageCTScore ?? 0);
      operations.push({
        path: `learning_progress/${user.id}`,
        merge: true,
        data: {
          userId: user.id,
          sessionsCompleted: completed,
          scoreTotal: completed * average,
          averageCTScore: average,
          currentStreak: Number(stats.currentStreak ?? 0),
          lastSessionAt: stats.lastSessionDate ?? null,
          lastSessionDate: timestampDateKey(stats.lastSessionDate),
          topicRecommendations: {},
          updatedAt: now,
        },
      });
    }
  }

  for (const session of sessionDocs) {
    if (shouldPreserveCurrentSession(session.data())) continue;
    const source = session.data();
    const privateReference = privateReferenceFromLegacy(source);
    if (privateReference) operations.push({ path: `${session.ref.path}/private/reference`, data: privateReference, merge: false });
    const publicContext = sanitizePublicProblemContext(source.problemContext);
    const legacyStatus = source.status === "completed" ? "submitted" : source.status;
    operations.push({
      path: session.ref.path,
      merge: true,
      data: {
        workflowVersion: 2,
        migrationVersion: 3,
        legacyReadOnly: true,
        status: legacyStatus === "in_progress" ? "abandoned" : legacyStatus,
        migrationState: legacyStatus === "in_progress" ? "archived_restart_required" : "preserved_history",
        problemContext: publicContext,
        selectedProblem: FieldValue.delete(),
        updatedAt: now,
      },
    });
  }

  for (const notification of notificationDocs) {
    operations.push({ path: notification.ref.path, merge: true, data: { schemaVersion: 3 } });
  }

  operations.push({
    path: "system_settings/privacy",
    merge: true,
    data: { currentConsentVersion: "privacy-2026-07-18", aiLogRetentionDays: 90, identifiableRetentionMonths: 12, studyClosedAt: null, updatedAt: now, updatedBy: "migration-v3" },
  });
  operations.push({
    path: "policy_documents/privacy-2026-07-18",
    merge: true,
    data: {
      version: "privacy-2026-07-18",
      title: "MINDGUIDE Privacy and Responsible AI Notice",
      status: "active",
      summary: "MINDGUIDE stores learning responses, formative scorecards, and limited AI service logs for capstone evaluation. AI feedback may be inaccurate and should be verified.",
      collectedData: ["account profile", "learning responses", "reasoning evaluations", "formative scorecards", "system activity"],
      purpose: "Capstone system operation, acceptability evaluation, support, and security.",
      retention: "Raw AI logs: 90 days. Identifiable learning records: study closure plus 12 months, followed by anonymization.",
      createdAt: now,
      updatedAt: now,
    },
  });
  return operations;
}

function privateReferenceFromLegacy(source: DocumentData): DocumentData | null {
  if (source.selectedProblem) return { ...buildPrivateProblem(source.selectedProblem), migratedAt: Timestamp.now() };
  const problem = mindGuideProblems.find((item) => item.id === source.selectedProblemId || item.id === source.problemContext?.problemId);
  if (problem) return { ...buildPrivateProblem(problem), migratedAt: Timestamp.now() };
  const analysis = source.problemContext?.analysis;
  if (!analysis) return null;
  return {
    expectedConcepts: analysis.expectedConcepts ?? [],
    requiredFormula: analysis.requiredFormula ?? null,
    requiredTheorem: analysis.requiredTheorem ?? null,
    solutionSteps: analysis.solutionOutline ?? [],
    finalAnswer: analysis.referenceAnswer ?? "Legacy reference unavailable",
    interpretation: analysis.interpretation ?? "Legacy interpretation unavailable",
    socraticPrompts: {},
    migratedAt: Timestamp.now(),
  };
}

async function verifyPublicData(): Promise<string[]> {
  const failures: string[] = [];
  for (const collection of ["problems", "sessions"]) {
    const snapshot = await database.collection(collection).get();
    for (const document of snapshot.docs) failures.push(...findForbiddenPublicKeys(document.data(), document.ref.path));
  }
  const problems = await database.collection("problems").get();
  if (problems.size !== 33) failures.push(`problems: expected 33 prepared problems, found ${problems.size}.`);
  return failures;
}

async function createBackup(paths: string[]): Promise<string> {
  await mkdir(BACKUP_DIRECTORY, { recursive: true });
  const unique = [...new Set(paths)].sort();
  const records = [];
  for (let index = 0; index < unique.length; index += 250) {
    const chunk = unique.slice(index, index + 250);
    const snapshots = await database.getAll(...chunk.map((item) => database.doc(item)));
    records.push(...snapshots.map((snapshot) => ({ path: snapshot.ref.path, exists: snapshot.exists, data: snapshot.exists ? encode(snapshot.data()) : null })));
  }
  const filename = path.join(BACKUP_DIRECTORY, `migration-v3-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(filename, JSON.stringify({ schema: 1, projectId, createdAt: new Date().toISOString(), records }, null, 2), "utf8");
  return filename;
}

async function rollback(requestedFile?: string): Promise<void> {
  const filename = requestedFile ? path.resolve(requestedFile) : await latestBackup();
  const backup = JSON.parse(await readFile(filename, "utf8"));
  if (backup.projectId !== projectId) throw new Error(`Backup project ${backup.projectId} does not match ${projectId}.`);
  const writer = database.bulkWriter();
  for (const record of backup.records) {
    const ref = database.doc(record.path);
    if (record.exists) writer.set(ref, decode(record.data));
    else writer.delete(ref);
  }
  await writer.close();
  const users = await database.collection("users").get();
  for (const user of users.docs) {
    const authUser = await getAuth().getUser(user.id).catch(() => null);
    if (!authUser) continue;
    const role = user.get("role") === "admin" || user.get("role") === "teacher" ? "admin" : "student";
    await getAuth().setCustomUserClaims(user.id, { ...(authUser.customClaims ?? {}), role });
  }
  console.log(`Rollback restored ${backup.records.length} document states from ${filename}.`);
}

async function latestBackup(): Promise<string> {
  const entries = (await readdir(BACKUP_DIRECTORY)).filter((name) => name.startsWith("migration-v3-") && name.endsWith(".json")).sort();
  if (!entries.length) throw new Error("No schema-v3 backup was found. Pass --backup=<file>.");
  return path.join(BACKUP_DIRECTORY, entries.at(-1)!);
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
        if (!match || process.env[match[1]] !== undefined) continue;
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function argumentValue(name: string): string | undefined {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1).replace(/^['"]|['"]$/g, "");
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function createStableId(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function timestampDateKey(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("toDate" in value)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts((value as Timestamp).toDate());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
