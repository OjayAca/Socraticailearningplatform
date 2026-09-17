import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { buildPilotProblemSeeds } from "./problem-bank-v5-core.ts";
import { contentHash } from "../functions/src/content-hash.ts";

const arg = (name: string) => process.argv.find(item => item.startsWith(`${name}=`))?.slice(name.length+1);
const projectId = arg("--project");
if (!projectId) throw new Error("Pass an explicit --project=<isolated-staging-project>.");
if (projectId.startsWith("demo-") && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error("A demo project requires FIRESTORE_EMULATOR_HOST.");
initializeApp({ projectId });
const db = getFirestore();
const apply = process.argv.includes("--apply"), rollback = process.argv.includes("--rollback"), verify = process.argv.includes("--verify");
const pilotRef = db.doc("system_settings/pilot");
const pilot = await pilotRef.get();
if ((apply || rollback) && pilot.exists && !["closed", "write-freeze"].includes(pilot.get("state"))) throw new Error("Close or freeze the pilot before migration.");
const timestampKey = "__mindguide_timestamp";
function encode(value: any): any {
  if (value instanceof Timestamp) return { [timestampKey]: [value.seconds,value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]));
  return value;
}
function decode(value: any): any {
  if (value?.[timestampKey]) return new Timestamp(...value[timestampKey] as [number,number]);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
  return value;
}
if (rollback) {
  const file = arg("--backup"); if (!file) throw new Error("Rollback requires the exact --backup path.");
  const manifest = JSON.parse(await readFile(path.resolve(file),"utf8"));
  if (manifest.projectId !== projectId || manifest.version !== 5 || contentHash(manifest.records) !== manifest.hash) throw new Error("Backup project, version or hash mismatch.");
  for (const record of [...manifest.records].reverse()) {
    const ref = db.doc(record.path), current = await ref.get();
    const hash = current.exists ? contentHash(encode(current.data())) : null;
    if (hash !== record.afterHash && hash !== record.beforeHash) throw new Error(`Rollback conflict at ${record.path}; stop and investigate.`);
    if (record.before === null) await ref.delete(); else await ref.set(decode(record.before));
  }
  // Restoring older data never reopens participant access.
  await pilotRef.set({ state: "closed", enabledTopicIds: [] }, { merge: true });
  console.log("Rollback verified; participant access remains closed.");
  process.exit(0);
}
const sessions = await db.collection("sessions").get();
for (const session of sessions.docs) {
  if (Number(session.get("schemaVersion") ?? 0) < 3) throw new Error(`Run and verify the v3 private-reference security conversion first: ${session.id}`);
  const forbidden = ["finalAnswer", "solutionSteps", "referenceAnswer", "privateSolution", "answerSpecification", "safeHints", "apiKey", "rawOutput"];
  const scan = (value: any): boolean => Boolean(value && typeof value === "object" && Object.entries(value).some(([key,item]) => forbidden.includes(key) || scan(item)));
  if (scan(session.data())) throw new Error(`Private material remains on a learner-readable session: ${session.id}`);
}
const operations: Array<{ path: string; data: Record<string,any> }> = [];
const addMissing = async (documentPath: string, data: Record<string,any>) => { if (!(await db.doc(documentPath).get()).exists) operations.push({ path: documentPath, data }); };
await addMissing("system_settings/pilot", { state: "closed", enabledTopicIds: [], schemaVersion: 5 });
await addMissing("rubrics/pilot-v5", { version: 1, status: "draft", rubricVersion: "pilot-v5-draft", calibrationStatus: "pending", criteria: ["accuracy", "logicalValidity", "methodSelection", "explanationQuality"], anchors: { 0: "Absent, unrelated or contradictory", 5: "Unsupported assertion", 10: "Relevant with substantial gaps", 15: "Mostly valid with gaps", 20: "Sound and justified", 25: "Complete, consistent and independently checked" }, facultyEvidence: null });
for (const seed of buildPilotProblemSeeds()) {
  const { privateSolution, prompts, ...publicProblem } = seed;
  await addMissing(`subjects/${seed.subjectId}`, { name: seed.subject, version: 1, status: "draft" });
  await addMissing(`topics/${seed.topicId}`, { name: seed.topic, subject: seed.subject, subjectId: seed.subjectId, version: 1, status: "draft" });
  await addMissing(`problems/${seed.id}`, { ...publicProblem, schemaVersion: 5, version: 1, supportedResponseFormats: ["text","latex"] });
  await addMissing(`problems/${seed.id}/private/solution`, privateSolution);
  for (const [phase,prompt] of Object.entries(prompts)) await addMissing(`socratic_prompt_bank/${seed.id}-${phase}`, { problemId: seed.id, phase, prompt, status: "draft", version: 1 });
  await addMissing(`formula_theorem_references/${seed.formulaTheoremReferenceIds[0]}`, { kind: "formula", statement: privateSolution.requiredFormula, conditions: ["Use the confirmed givens and the operation's stated assumptions."], status: "draft", version: 1 });
}
await addMissing("difficulty_policies/pilot-v5", { version: 1, status: "draft", minimumCompletedSessions: 2, increaseScoreThreshold: 80, decreaseScoreThreshold: 60, maxHintsForIncrease: 1, arithmeticErrorAloneLowersDifficulty: false });
for (const session of sessions.docs) {
  const data = session.data(), responses = await session.ref.collection("responses").count().get();
  const updated = { ...data, responseCount: responses.data().count };
  if (Number(data.workflowVersion) < 5 && ["in_progress","ready_for_submission"].includes(data.status)) Object.assign(updated, { status: "archived", archiveReason: "Workflow v5 requires a new approved problem; historical scores remain unchanged." });
  if (contentHash(encode(data)) !== contentHash(encode(updated))) operations.push({ path: session.ref.path, data: updated });
}
if (verify) {
  if (operations.length) throw new Error(`v5 verification failed: ${operations.length} missing or incomplete migration operations.`);
  console.log("v5 schema verification passed. This does not constitute faculty or release approval."); process.exit(0);
}
console.log(JSON.stringify({ projectId, mode: apply ? "apply" : "dry-run", changes: operations.map(item => item.path), participantAccess: "closed" }, null, 2));
if (apply && operations.length) {
  const records = [];
  for (const operation of operations) {
    const current = await db.doc(operation.path).get();
    records.push({ path: operation.path, before: current.exists ? encode(current.data()) : null, beforeHash: current.exists ? contentHash(encode(current.data())) : null, after: encode(operation.data), afterHash: contentHash(encode(operation.data)) });
  }
  await mkdir(".local-backups", { recursive: true });
  const file = path.resolve(".local-backups",`v5-${projectId}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify({ version: 5, projectId, hash: contentHash(records), records },null,2));
  console.log(`Backup: ${file}`);
  for (const record of records) await db.runTransaction(async transaction => {
    const ref = db.doc(record.path), current = await transaction.get(ref);
    const hash = current.exists ? contentHash(encode(current.data())) : null;
    if (hash !== record.beforeHash && hash !== record.afterHash) throw new Error(`Migration conflict: ${record.path}`);
    transaction.set(ref, decode(record.after));
  });
  console.log("Migration applied. Run --verify and rehearse rollback before release.");
}
