import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { getFirestore } from "firebase-admin/firestore";
import { CURRICULUM_VERSION, VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "../src/data/validated-curriculum.ts";
import { contentHash } from "../src/lib/learning/content-hash.ts";
import { prepareQuestionBank } from "./question-bank-core.ts";
import { questionBankDocuments } from "./question-bank-documents.ts";
import { assertMarker, loadTarget, stagingApp } from "./lib/staging-target.ts";
import verifyBrowserTarget from "./staging-browser-setup.ts";

const staging = "mindguide-stg-ojay-0823";
const sources = [
  ["scripts/data/E_MINDGUIDE_Problem_Bank.json", "docs/QUESTION_BANK_APPROVAL_2026-10-25.json",
    "f1fded3636d0514fb5f09ae29b7a2d2f65cdf3341a6225853a4cad36a5446dc0", "a9b8794d67dc93c43fbbdce5fe937105e2b8c2d32bc2da88bcca5266ce1c3129"],
  ["docs/question-bank-expansion/MINDGUIDE_84_Question_Expansion.json", "docs/question-bank-expansion/approved-integration-2026-11-02/approval.json",
    "5579cfa063b1cb640948662f0399acabd51ad8d6b8271d445390508e7cf93ce0", "be37114a8a9a51378cad2f0cef454eb642c52f11551a961ecd2cbdee27aa5c13"],
] as const;
const ids = ["DM-04-B01", "DM-04-B02", "DM-04-B03", "DM-04-B04", "DM-04-I01", "DM-04-I02", "DM-04-I03"];

export async function logicPlan() {
  const entries = new Map<string, Record<string, unknown>>();
  const topic = VALIDATED_TOPICS.find(t => t.id === "discrete-mathematics-logic")!;
  const subject = VALIDATED_SUBJECTS.find(s => s.id === topic.subjectId)!;
  for (const [source, receipt, hash, approvalHash] of sources) {
    const raw = await readFile(source);
    const approval = JSON.parse(await readFile(receipt, "utf8"));
    if (createHash("sha256").update(raw).digest("hex") !== hash || approval.sourceFileHash !== hash || await contentHash(approval) !== approvalHash)
      throw new Error("Approved source or approval fingerprint changed.");
    const records = (await prepareQuestionBank(JSON.parse(raw.toString()))).filter(r => ids.includes(r.id));
    for (const r of records) {
      if (r.problem.topicId !== topic.id || r.problem.difficulty !== (r.id.includes("-B") ? "Basic" : "Intermediate"))
        throw new Error("Unexpected topic or difficulty: " + r.id);
      if (source === sources[1][0]) r.problem.importSource = "MINDGUIDE_84_Question_Expansion";
    }
    for (const [path, fields] of await questionBankDocuments(records, hash, approval)) {
      if (entries.has(path)) throw new Error("Duplicate source path: " + path);
      entries.set(path, fields);
    }
  }
  if (!ids.every(id => entries.has("problems/" + id)) || entries.size !== 13 * ids.length)
    throw new Error("Incomplete Logic content plan.");
  for (const [collection, record] of [["subjects", subject], ["topics", topic]] as const) {
    const { id, ...fields } = record;
    entries.set(collection + "/" + id, { ...fields, status: "approved", curriculumVersion: CURRICULUM_VERSION });
  }
  entries.set("system_settings/pilot", { state: "open", enabledTopicIds: [topic.id] });
  return entries;
}

export function missingPaths(plan: Map<string, Record<string, unknown>>, existing: Map<string, unknown>) {
  const missing: string[] = [];
  for (const [path, fields] of plan) {
    if (!existing.has(path)) missing.push(path);
    else if (!isDeepStrictEqual(existing.get(path), fields)) throw new Error("Existing staging data differs: " + path);
  }
  return missing;
}

async function main(mode: string) {
  if (!["plan", "inspect", "apply"].includes(mode)) throw new Error("Expected plan, inspect or apply.");
  const plan = await logicPlan();
  if (mode === "plan") return { mode, project: staging, ids, documents: plan.size, firebaseConnected: false };
  const target = await loadTarget();
  if (target.projectId !== staging) throw new Error("Wrong staging project.");
  await verifyBrowserTarget();
  const app = await stagingApp(target);
  const db = getFirestore(app);
  if (!("projectId" in db) || db.projectId !== staging || db.databaseId !== "(default)") throw new Error("Wrong staging database.");
  // The protected references must stay private even if a client reads Firestore directly.
  const token = await app.options.credential!.getAccessToken();
  async function rulesGet(path: string) {
    const response = await fetch("https://firebaserules.googleapis.com/v1/" + path, {
      headers: { Authorization: "Bearer " + token.access_token }, redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Staging rules verification returned HTTP " + response.status);
    return response.json();
  }
  const release = await rulesGet("projects/" + staging + "/releases/cloud.firestore");
  if (!release.rulesetName?.startsWith("projects/" + staging + "/rulesets/")) throw new Error("Unexpected ruleset.");
  const rules = await rulesGet(release.rulesetName);
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  if (rules.source?.files?.length !== 1 || normalize(rules.source.files[0].content) !== normalize(await readFile("firestore.rules", "utf8")))
    throw new Error("Active staging rules must match the reviewed application rules.");
  const count = await db.runTransaction(async tx => {
    assertMarker((await tx.get(db.doc("system_settings/staging_verification"))).data(), target);
    const snaps = await tx.getAll(...Array.from(plan.keys(), path => db.doc(path)));
    const existing = new Map(snaps.filter(s => s.exists).map(s => [s.ref.path, s.data()]));
    const missing = missingPaths(plan, existing);
    if (mode === "apply") for (const path of missing) tx.create(db.doc(path), plan.get(path)!);
    return missing.length;
  });
  return { mode, project: staging, documents: plan.size, missingBefore: count, created: mode === "apply" ? count : 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await main(process.argv[2] ?? "plan"), null, 2));
