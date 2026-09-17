import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash, verify } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { contentHash, canonicalJson } from "../functions/src/content-hash.ts";
const arg = (name: string) => process.argv.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
const projectId = arg("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error("An explicit --project is required.");
initializeApp({ projectId });
const db = getFirestore();
const { buildCatalogReadiness } = await import("../functions/src/configuration.ts");
const closedStaging = process.argv.includes("--closed-staging");
const issues: string[] = [];
const files: Record<string,string> = {};
async function fingerprint(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory,entry.name);
    if (entry.isDirectory()) await fingerprint(file);
    else files[file.replaceAll("\\","/")] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
}
await fingerprint("dist"); await fingerprint("functions/lib");
for (const file of ["firestore.rules","firestore.indexes.json","functions/package.json","package-lock.json"]) files[file] = createHash("sha256").update(await readFile(file)).digest("hex");
const artifactHash = contentHash(files);
const pilot = await db.doc("system_settings/pilot").get();
const readiness = await buildCatalogReadiness();
if (closedStaging) {
  if (!["closed","write-freeze"].includes(pilot.get("state"))) issues.push("Closed staging requires a closed or frozen pilot.");
  if (!projectId.startsWith("demo-") && process.env.MINDGUIDE_STAGING_PROJECT !== projectId) issues.push("The target must match the explicitly configured MINDGUIDE_STAGING_PROJECT.");
} else {
  issues.push(...readiness.issues);
  if (!readiness.ready && !readiness.issues.length) issues.push("Enabled pilot catalog is not ready.");
}
const requiredEvidence = ["faculty_content", "rubric_calibration", "research_protocol", "privacy_policy", "billing_iam_secrets", "app_check_rules_indexes", "authenticated_staging", "load_and_quota", "backup_restore", "migration_rollback", "monitoring_and_budget"];
let evidence: Record<string,unknown> | null = null;
if (!closedStaging) {
  const evidenceFile = arg("--evidence"), publicKeyFile = arg("--owner-key");
  if (!evidenceFile || !publicKeyFile) issues.push("Signed project-owner evidence and the owner's public verification key are required.");
  else {
    const envelope = JSON.parse(await readFile(evidenceFile,"utf8"));
    if (!verify(null, Buffer.from(canonicalJson(envelope.payload)), await readFile(publicKeyFile), Buffer.from(envelope.signature,"base64"))) issues.push("Owner evidence signature is invalid.");
    const payload = envelope.payload;
    if (payload.projectId !== projectId || payload.artifactHash !== artifactHash || !payload.commit) issues.push("Owner evidence must match this project, artifact and commit.");
    for (const name of requiredEvidence) if (!payload.evidence?.[name]?.reference || !/^[a-f0-9]{64}$/.test(payload.evidence?.[name]?.sha256 ?? "")) issues.push(`Missing referenced evidence: ${name}`);
    evidence = payload;
  }
  const privacy = await db.doc("system_settings/privacy").get();
  if (!privacy.get("studyClosedAt") || !privacy.get("policyEvidenceReference") || !Number.isFinite(privacy.get("aiLogRetentionDays")) || !Number.isFinite(privacy.get("identifiableRetentionMonths"))) issues.push("Approved privacy settings are incomplete.");
}
const report = { schemaVersion: 5, projectId, artifactHash, files, mode: closedStaging ? "closed-staging" : "participant-release", enabledTopicIds: pilot.get("enabledTopicIds") ?? [], machineChecks: { catalog: readiness }, ownerEvidence: evidence, ready: issues.length === 0, issues, generatedAt: new Date().toISOString() };
if (arg("--output")) await writeFile(path.resolve(arg("--output")!),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (issues.length) process.exitCode = 1;

if (process.argv.includes("--register")) {
  if (closedStaging || !report.ready || !evidence) throw new Error("Only a successful signed participant-release preflight may register an approved artifact.");
  await db.doc(`release_artifacts/${artifactHash}`).create({ status: "approved", artifactHash, projectId, enabledTopicIds: report.enabledTopicIds, ownerEvidence: evidence, registeredAt: new Date().toISOString() });
}
