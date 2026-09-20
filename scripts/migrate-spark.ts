import { loadOperatorCredentials } from "./lib/operator-auth.ts";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { scoringReference } from "../src/lib/learning/scoring-reference.ts";
import { contentHash } from "./lib/content-hash.ts";

// Never switch to a demo project or write fabricated learning configuration.
const env = await readFile(".env", "utf8");
const configured = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
const explicit = process.argv.find(value => value.startsWith("--project="))?.slice(10);
if (!configured || configured.startsWith("demo-") || (explicit && explicit !== configured)) throw new Error("The target must match the existing Firebase project in .env.");
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("This migration must not run against an emulator.");
await loadOperatorCredentials();
initializeApp({ projectId: configured, credential: applicationDefault() });
const db = getFirestore();
const apply = process.argv.includes("--apply");
const verify = process.argv.includes("--verify");
if (apply && verify) throw new Error("Choose --apply or --verify, not both.");
const { requireMatchingApproval } = await import("./lib/content-manifest.ts");
const problems = await db.collection("problems").where("status", "==", "approved").get();
const issues: string[] = [];
const changes: Array<{ path: string; before: unknown; after: Record<string, unknown> }> = [];
for (const problem of problems.docs) {
  try {
    const validationId = problem.get("validationRecordId");
    if (typeof validationId !== "string" || !validationId || validationId.includes("/")) throw new Error("No recorded approval.");
    const [approval, solution, published] = await Promise.all([
      db.doc(`content_validation_records/${validationId}`).get(), problem.ref.collection("private").doc("solution").get(), db.doc(`problem_scoring/${problem.id}`).get(),
    ]);
    const privateData = solution.data() ?? {};
    if (approval.get("manifestHash")) await requireMatchingApproval(problem);
    else if (!approval.get("scoringSnapshotHash")) throw new Error("Approval has no verifiable content snapshot; record a new faculty decision.");
    const [prompts, references, misconceptions] = await Promise.all([
      db.collection("socratic_prompt_bank").where("problemId", "==", problem.id).where("status", "==", "approved").get(),
      Promise.all((problem.get("formulaTheoremReferenceIds") ?? []).map((id: string) => db.doc(`formula_theorem_references/${id}`).get())),
      db.collection("misconception_categories").where("status", "==", "approved").get(),
    ]);
    const merged = { ...privateData,
      ...(prompts.size ? { socraticPrompts: Object.fromEntries(prompts.docs.map(item => [item.get("phase"), item.get("prompt")])) } : {}),
      ...(references.length ? { formulaTheoremConditions: references.flatMap(item => item.get("conditions") ?? []) } : {}),
      ...(misconceptions.size ? { misconceptionPrompts: Object.fromEntries(misconceptions.docs.filter(item => typeof item.get("correctivePrompt") === "string").map(item => [item.id, item.get("correctivePrompt")])) } : {}),
    };
    for (const reference of references) {
      if (reference.get("status") !== "approved") throw new Error("Linked instructional reference is not approved.");
      if (reference.get("kind") === "formula") merged.requiredFormula = reference.get("statement");
      if (reference.get("kind") === "theorem") merged.requiredTheorem = reference.get("statement");
    }
    const next = scoringReference(approval.get("scoringSnapshotHash") ? privateData : merged, { ...problem.data(), id: problem.id }, approval.data() ?? {});
    if (approval.get("scoringSnapshotHash") && approval.get("scoringSnapshotHash") !== contentHash(next)) throw new Error("Scoring material changed after approval.");
    if (contentHash(published.data() ?? null) !== contentHash(next)) changes.push({ path: published.ref.path, before: published.data() ?? null, after: next });
  } catch (error) { issues.push(`${problem.id}: ${error instanceof Error ? error.message : String(error)}`); }
}
console.log(JSON.stringify({ project: configured, mode: apply ? "apply" : verify ? "verify" : "dry-run", approvedProblems: problems.size, changes: changes.length, issues }, null, 2));
if (issues.length) throw new Error("Scoring readiness failed. No documents were changed; resolve the listed real-content issues first.");
if (verify && changes.length) throw new Error("Scoring references need conversion. Run dry-run, review, then --apply.");
if (apply && changes.length) {
  await mkdir(".local-backups", { recursive: true });
  await writeFile(`.local-backups/spark-${Date.now()}.json`, JSON.stringify({ project: configured, changes }, null, 2));
  for (const change of changes) {
    await db.runTransaction(async tx => {
      const current = await tx.get(db.doc(change.path));
      if (contentHash(current.data() ?? null) !== contentHash(change.before)) throw new Error(`Concurrent change at ${change.path}; rerun the dry-run.`);
      tx.set(db.doc(change.path), change.after);
    });
  }
  console.log("Published validated scoring references. Original content, approvals, and learning history were retained.");
}
