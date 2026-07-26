#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

await loadLocalEnvironment();
const projectId =
  argumentValue("--project")
  || process.env.FIREBASE_PROJECT_ID
  || process.env.GCLOUD_PROJECT
  || process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Missing Firebase project ID. Pass --project=<id>.");
if (getApps().length === 0) initializeApp({ credential: applicationDefault(), projectId });
const database = getFirestore();

const [subjects, topics, problems, references, prompts, misconceptions, policies, privacy] = await Promise.all([
  database.collection("subjects").where("status", "==", "approved").get(),
  database.collection("topics").where("status", "==", "approved").get(),
  database.collection("problems").get(),
  database.collection("formula_theorem_references").where("status", "==", "approved").get(),
  database.collection("socratic_prompt_bank").where("status", "==", "approved").get(),
  database.collection("misconception_categories").where("status", "==", "approved").get(),
  database.collection("difficulty_policies").where("status", "==", "approved").get(),
  database.doc("system_settings/privacy").get(),
]);

const approvedProblems = problems.docs.filter((problem) =>
  problem.get("status") === "approved" && problem.get("validationRecordId")
);
const cells = new Map<string, Set<number>>();
for (const problem of approvedProblems) {
  const key = `${problem.get("topicId")}::${problem.get("difficulty")}`;
  const variants = cells.get(key) ?? new Set<number>();
  variants.add(Number(problem.get("variant")));
  cells.set(key, variants);
}
const issues: string[] = [];
if (subjects.size !== 2) issues.push(`Expected 2 approved subjects; found ${subjects.size}.`);
if (topics.size !== 11) issues.push(`Expected 11 approved topics; found ${topics.size}.`);
if (problems.size !== 99) issues.push(`Expected 99 total problems; found ${problems.size}.`);
if (approvedProblems.length !== 99) issues.push(`Expected 99 faculty-approved problems; found ${approvedProblems.length}.`);
if (cells.size !== 33 || [...cells.values()].some((variants) => variants.size !== 3)) {
  issues.push("Every one of the 33 topic/difficulty cells must contain three approved variants.");
}
if (references.size === 0) issues.push("No approved formula/theorem references are configured.");
if (prompts.size !== 693) issues.push(`Expected 693 approved phase prompts; found ${prompts.size}.`);
if (misconceptions.size < 12) issues.push(`Expected at least 12 approved misconception policies; found ${misconceptions.size}.`);
if (policies.size === 0) issues.push("No approved adaptive-difficulty policy is configured.");
if (!privacy.exists || !privacy.get("studyClosedAt")) issues.push("The study-closure date is not configured.");

const externalGates = [
  "billing_and_required_apis",
  "least_privilege_functions_iam",
  "app_check_registration_and_metrics",
  "gemini_secret_and_old_credential_rotation",
  "managed_export_restore_evidence",
  "staging_migration_and_authenticated_smoke_test",
  "production_latency_and_release_tag_approval",
].map((name) => ({
  name,
  evidenced: process.env[`MINDGUIDE_GATE_${name.toUpperCase()}`] === "true",
}));
for (const gate of externalGates) {
  if (!gate.evidenced) issues.push(`External owner evidence missing: ${gate.name}.`);
}

const report = {
  schemaVersion: 4,
  projectId,
  generatedAt: new Date().toISOString(),
  ready: issues.length === 0,
  counts: {
    approvedSubjects: subjects.size,
    approvedTopics: topics.size,
    totalProblems: problems.size,
    facultyApprovedProblems: approvedProblems.length,
    readyCells: [...cells.values()].filter((variants) => variants.size === 3).length,
    approvedReferences: references.size,
    approvedPrompts: prompts.size,
    approvedMisconceptionPolicies: misconceptions.size,
    approvedDifficultyPolicies: policies.size,
  },
  privacyConfigured: privacy.exists && Boolean(privacy.get("studyClosedAt")),
  externalGates,
  issues,
};
const output = argumentValue("--output");
if (output) await writeFile(path.resolve(output), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 1;

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
