#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { SUBJECT_TOPICS } from "../src/types/index.ts";
import { findForbiddenPublicKeys } from "./migration-v3-core.ts";
import { buildSchemaV4ProblemSeeds } from "./problem-bank-v4-core.ts";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");
const ROLLBACK = process.argv.includes("--rollback");
const BACKUP_DIRECTORY = path.resolve(".local-backups");
const seeds = buildSchemaV4ProblemSeeds();

await loadLocalEnvironment();
const projectId =
  argumentValue("--project")
  || process.env.FIREBASE_PROJECT_ID
  || process.env.GCLOUD_PROJECT
  || process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Missing Firebase project ID. Pass --project=<id> or configure VITE_FIREBASE_PROJECT_ID.");
if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId });
const database = getFirestore();
database.settings({ ignoreUndefinedProperties: true });

if (ROLLBACK) {
  await rollback(argumentValue("--backup"));
  process.exit(0);
}
if (VERIFY) {
  await verifySchemaV4(true);
  process.exit(0);
}

const [users, sessions, notifications, existingProblems, existingPrompts, existingReferences] = await Promise.all([
  database.collection("users").get(),
  database.collection("sessions").get(),
  database.collection("notifications").get(),
  database.collection("problems").get(),
  database.collection("socratic_prompt_bank").get(),
  database.collection("formula_theorem_references").get(),
]);
const operations = buildOperations(
  users.docs,
  sessions.docs,
  notifications.docs,
  existingProblems.docs,
  existingPrompts.docs,
  existingReferences.docs
);
const backup = await createBackup(operations.map((operation) => operation.path));
console.log(`MINDGUIDE schema-v4 migration (${APPLY ? "APPLY" : "DRY RUN"})`);
console.log(`Firebase project: ${projectId}`);
console.log(`Backup manifest: ${backup}`);
console.log(`Planned document writes: ${operations.length}`);
console.log(`Prepared problem records: ${seeds.length} (33 cells x 3 variants)`);

if (!APPLY) {
  console.log("Dry run complete. Existing records were not changed.");
  process.exit(0);
}

const writer = database.bulkWriter();
writer.onWriteError((error) => {
  console.error(`Write failed for ${error.documentRef.path}: ${error.message}`);
  return error.failedAttempts < 3;
});
for (const operation of operations) {
  writer.set(
    database.doc(operation.path),
    operation.data,
    operation.merge ? { merge: true } : undefined
  );
}
await writer.close();

try {
  await verifySchemaV4(false);
  console.log("Schema-v4 migration applied and verified. Formal evaluation remains blocked until all 99 validation decisions are recorded.");
} catch (error) {
  console.error(error);
  console.error(`Rollback with: npm run migrate:v4:rollback -- --backup="${backup}" --project="${projectId}"`);
  process.exit(1);
}

function buildOperations(
  userDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  sessionDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  notificationDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  problemDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  promptDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  referenceDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Array<{ path: string; data: DocumentData; merge: boolean }> {
  const operations: Array<{ path: string; data: DocumentData; merge: boolean }> = [];
  const now = Timestamp.now();
  const existingProblemVersions = new Map(problemDocs.map((problem) => [
    problem.id,
    Number(problem.get("schemaVersion") ?? 0),
  ]));
  const existingPromptIds = new Set(promptDocs.map((prompt) => prompt.id));
  const existingReferenceIds = new Set(referenceDocs.map((reference) => reference.id));

  for (const [subject, topics] of Object.entries(SUBJECT_TOPICS)) {
    const subjectId = slug(subject);
    operations.push({
      path: `subjects/${subjectId}`,
      merge: true,
      data: {
        schemaVersion: 4,
        name: subject,
        status: "approved",
        version: 2,
        updatedAt: now,
        updatedBy: "migration-v4",
      },
    });
    for (const topic of topics) {
      operations.push({
        path: `topics/${slug(`${subject}-${topic}`)}`,
        merge: true,
        data: {
          schemaVersion: 4,
          subjectId,
          subject,
          name: topic,
          status: "approved",
          version: 2,
          updatedAt: now,
          updatedBy: "migration-v4",
        },
      });
    }
  }

  for (const seed of seeds) {
    const referenceId = seed.formulaTheoremReferenceIds[0];
    if (existingReferenceIds.has(referenceId)) continue;
    existingReferenceIds.add(referenceId);
    const requiredFormula = seed.privateSolution.requiredFormula;
    const requiredTheorem = seed.privateSolution.requiredTheorem;
    operations.push({
      path: `formula_theorem_references/${referenceId}`,
      merge: false,
      data: {
        kind: requiredFormula ? "formula" : "theorem",
        statement: requiredFormula || requiredTheorem,
        variables: [],
        conditions: ["The learner must connect the selected reference to the given information and state why its conditions apply."],
        domain: seed.subject,
        supportedTopics: [seed.topic],
        equivalentNotation: [],
        status: "approved",
        version: 1,
        createdAt: now,
        createdBy: "migration-v4",
        updatedAt: now,
        updatedBy: "migration-v4",
        archivedAt: null,
      },
    });
  }

  for (const seed of seeds) {
    if (existingProblemVersions.get(seed.id) !== 4) {
      operations.push({
        path: `problems/${seed.id}`,
        merge: false,
        data: {
          schemaVersion: 4,
          sourceProblemId: seed.sourceProblemId,
          subjectId: seed.subjectId,
          topicId: seed.topicId,
          subject: seed.subject,
          topic: seed.topic,
          difficulty: seed.difficulty,
          variant: seed.variant,
          problemText: seed.problemText,
          supportedResponseFormats: ["text", "latex"],
          formulaTheoremReferenceIds: seed.formulaTheoremReferenceIds,
          status: seed.status,
          validationRecordId: null,
          version: 1,
          createdAt: now,
          createdBy: "migration-v4",
          updatedAt: now,
          updatedBy: "migration-v4",
          archivedAt: null,
        },
      });
      operations.push({
        path: `problems/${seed.id}/private/solution`,
        merge: false,
        data: {
          ...seed.privateSolution,
          version: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: "migration-v4",
        },
      });
    }
    for (const [phase, prompt] of Object.entries(seed.prompts)) {
      if (existingPromptIds.has(`${seed.id}__${phase}`)) continue;
      operations.push({
        path: `socratic_prompt_bank/${seed.id}__${phase}`,
        merge: false,
        data: {
          problemId: seed.id,
          phase,
          prompt,
          status: "approved",
          version: 1,
          createdAt: now,
          createdBy: "migration-v4",
          updatedAt: now,
          updatedBy: "migration-v4",
          archivedAt: null,
        },
      });
    }
  }

  const correctivePrompts: Record<string, string> = {
    conceptual_error: "Identify the concept that connects the givens to the requested result.",
    procedural_error: "Check the order and justification of each operation or proof step.",
    wrong_formula: "Compare the formula or theorem conditions with the information given in the problem.",
    theorem_condition_violation: "State the theorem conditions and identify which condition is not yet established.",
    invalid_logic: "Explain why this conclusion follows from the previous statement.",
    misinterpreted_variable: "Define each variable or mathematical object before using it.",
    computational_error: "Recalculate the most recent operation and verify its signs and substitutions.",
    incorrect_interpretation: "Connect the verified result back to the quantity or statement asked for.",
    weak_justification: "Name a required condition and show exactly where the problem satisfies it.",
    skipped_reasoning: "Write the missing calculation, implication, or case explicitly.",
    unsupported_response: "Provide a phase-specific explanation using text or supported mathematical notation.",
    none: "Continue to the next Socratic reasoning gate.",
  };
  for (const [category, correctivePrompt] of Object.entries(correctivePrompts)) {
    operations.push({
      path: `misconception_categories/${category}`,
      merge: true,
      data: {
        name: category,
        phases: [],
        correctivePrompt,
        priority: 0,
        status: "approved",
        version: 2,
        updatedAt: now,
        updatedBy: "migration-v4",
      },
    });
  }
  operations.push({
    path: "difficulty_policies/default",
    merge: true,
    data: {
      subjectId: null,
      topicId: null,
      minimumCompletedSessions: 2,
      increaseScoreThreshold: 80,
      decreaseScoreThreshold: 60,
      maxHintsForIncrease: 1,
      arithmeticErrorAloneLowersDifficulty: false,
      status: "approved",
      version: 2,
      updatedAt: now,
      updatedBy: "migration-v4",
    },
  });

  for (const user of userDocs) {
    const existing = user.get("academicProfile");
    const complete = academicProfileComplete(existing);
    operations.push({
      path: user.ref.path,
      merge: true,
      data: {
        schemaVersion: 4,
        academicProfile: complete ? existing : null,
        academicProfileComplete: complete,
        academicProfileCompletedAt: complete
          ? user.get("academicProfileCompletedAt") ?? now
          : null,
        updatedAt: now,
      },
    });
  }
  for (const session of sessionDocs) {
    const subject = String(session.get("subject") ?? "");
    const topic = String(session.get("topic") ?? "");
    operations.push({
      path: session.ref.path,
      merge: true,
      data: {
        migrationVersion: 4,
        subjectId: slug(subject),
        topicId: slug(`${subject}-${topic}`),
        configurationVersions: session.get("configurationVersions") ?? null,
        updatedAt: session.get("updatedAt") ?? now,
      },
    });
  }
  for (const notification of notificationDocs) {
    operations.push({ path: notification.ref.path, merge: true, data: { schemaVersion: 4 } });
  }
  operations.push({
    path: "system_settings/release",
    merge: true,
    data: {
      schemaVersion: 4,
      formalEvaluationEnabled: false,
      requiredValidatedProblems: 99,
      updatedAt: now,
      updatedBy: "migration-v4",
    },
  });
  return operations;
}

async function verifySchemaV4(logSuccess: boolean): Promise<void> {
  const [problems, users, prompts, references, topics, policies] = await Promise.all([
    database.collection("problems").get(),
    database.collection("users").get(),
    database.collection("socratic_prompt_bank").where("status", "==", "approved").get(),
    database.collection("formula_theorem_references").where("status", "==", "approved").get(),
    database.collection("topics").where("status", "==", "approved").get(),
    database.collection("difficulty_policies").where("status", "==", "approved").get(),
  ]);
  const failures: string[] = [];
  const referenceIds = new Set(references.docs.map((reference) => reference.id));
  const topicIds = new Set(topics.docs.map((topic) => topic.id));
  const promptPhases = new Map<string, Set<string>>();
  for (const prompt of prompts.docs) {
    const phases = promptPhases.get(String(prompt.get("problemId"))) ?? new Set<string>();
    phases.add(String(prompt.get("phase")));
    promptPhases.set(String(prompt.get("problemId")), phases);
  }
  if (policies.size === 0) failures.push("No approved difficulty policy exists.");
  if (problems.size !== 99) failures.push(`Expected 99 problem records, found ${problems.size}.`);
  for (const problem of problems.docs) {
    failures.push(...findForbiddenPublicKeys(problem.data(), problem.ref.path));
    if (!problem.get("topicId") || !problem.get("subjectId") || ![1, 2, 3].includes(problem.get("variant"))) {
      failures.push(`${problem.ref.path}: missing schema-v4 catalog or variant fields.`);
    }
    if (!topicIds.has(String(problem.get("topicId")))) {
      failures.push(`${problem.ref.path}: linked approved topic is missing.`);
    }
    const linkedReferences = Array.isArray(problem.get("formulaTheoremReferenceIds"))
      ? problem.get("formulaTheoremReferenceIds") as unknown[]
      : [];
    if (linkedReferences.length === 0 || linkedReferences.some((referenceId) => !referenceIds.has(String(referenceId)))) {
      failures.push(`${problem.ref.path}: linked approved formula/theorem reference is missing.`);
    }
    if (promptPhases.get(problem.id)?.size !== 7) {
      failures.push(`${problem.ref.path}: expected seven approved phase prompts.`);
    }
    if (problem.get("status") === "approved") {
      const validationId = problem.get("validationRecordId");
      const [validation, privateSolution] = await Promise.all([
        validationId ? database.doc(`content_validation_records/${validationId}`).get() : null,
        problem.ref.collection("private").doc("solution").get(),
      ]);
      if (!validation?.exists || validation.get("decision") !== "approved" || !privateSolution.exists) {
        failures.push(`${problem.ref.path}: approved without matching validation evidence and private solution.`);
      }
    }
  }
  const cells = new Map<string, Set<number>>();
  for (const problem of problems.docs) {
    const key = `${problem.get("topicId")}::${problem.get("difficulty")}`;
    const variants = cells.get(key) ?? new Set<number>();
    variants.add(Number(problem.get("variant")));
    cells.set(key, variants);
  }
  if (cells.size !== 33) failures.push(`Expected 33 topic/difficulty cells, found ${cells.size}.`);
  for (const [cell, variants] of cells) {
    if (variants.size !== 3) failures.push(`${cell}: expected three variants, found ${variants.size}.`);
  }
  for (const user of users.docs) {
    if (user.get("academicProfileComplete") === true && !academicProfileComplete(user.get("academicProfile"))) {
      failures.push(`${user.ref.path}: academicProfileComplete is inconsistent.`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  if (logSuccess) console.log("Schema-v4 verification passed: 99 variants, faculty approval integrity, profile consistency, and public-data safety are valid.");
}

async function createBackup(paths: string[]): Promise<string> {
  await mkdir(BACKUP_DIRECTORY, { recursive: true });
  const unique = [...new Set(paths)].sort();
  const records: Array<{ path: string; exists: boolean; data: unknown }> = [];
  for (let index = 0; index < unique.length; index += 250) {
    const snapshots = await database.getAll(
      ...unique.slice(index, index + 250).map((item) => database.doc(item))
    );
    records.push(...snapshots.map((snapshot) => ({
      path: snapshot.ref.path,
      exists: snapshot.exists,
      data: snapshot.exists ? encode(snapshot.data()) : null,
    })));
  }
  const filename = path.join(
    BACKUP_DIRECTORY,
    `migration-v4-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await writeFile(filename, JSON.stringify({
    schema: 1,
    projectId,
    createdAt: new Date().toISOString(),
    records,
  }, null, 2), "utf8");
  return filename;
}

async function rollback(requestedFile?: string): Promise<void> {
  const filename = requestedFile ? path.resolve(requestedFile) : await latestBackup();
  const backup = JSON.parse(await readFile(filename, "utf8"));
  if (backup.projectId !== projectId) {
    throw new Error(`Backup project ${backup.projectId} does not match ${projectId}.`);
  }
  const writer = database.bulkWriter();
  for (const record of backup.records) {
    const ref = database.doc(record.path);
    if (record.exists) writer.set(ref, decode(record.data));
    else writer.delete(ref);
  }
  await writer.close();
  console.log(`Rollback restored ${backup.records.length} document states from ${filename}.`);
}

async function latestBackup(): Promise<string> {
  const entries = (await readdir(BACKUP_DIRECTORY))
    .filter((name) => name.startsWith("migration-v4-") && name.endsWith(".json"))
    .sort();
  if (!entries.length) throw new Error("No schema-v4 backup was found. Pass --backup=<file>.");
  return path.join(BACKUP_DIRECTORY, entries.at(-1)!);
}

function academicProfileComplete(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return ["studentNumber", "course", "yearLevel", "section"].every((field) =>
    typeof profile[field] === "string" && String(profile[field]).trim().length > 0
  );
}

function encode(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __type: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encode(nested)]));
  }
  return value;
}

function decode(value: any): any {
  if (value?.__type === "timestamp") return new Timestamp(value.seconds, value.nanoseconds);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decode(nested)]));
  }
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
