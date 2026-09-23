import { readFile } from "node:fs/promises";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth";
import { contentHash } from "../src/lib/learning/content-hash";
import { findForbiddenPublicKeys } from "../src/lib/learning/validation";

// Read-only: never creates questions, consent, approvals, sessions, or emulator data.
const source = await readFile(".env", "utf8");
const project = source.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!project || project.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Use only the existing real Firebase project from .env.");
const requestedProject = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
if (requestedProject && requestedProject !== project) throw new Error("Deployment target must match the existing Firebase project in .env.");
await loadOperatorCredentials();
initializeApp({ projectId: project, credential: applicationDefault() });
const db = getFirestore();
const [problems, topics, privacy, pilot] = await Promise.all([db.collection("problems").where("status","==","approved").get(),db.collection("topics").where("status","==","approved").get(),db.doc("system_settings/privacy").get(),db.doc("system_settings/pilot").get()]);
const valid: Array<{topic:string;difficulty:string;concepts:string}> = [];
const gaps: string[] = [];
for (const problem of problems.docs) {
  const id = problem.get("validationRecordId");
  if (typeof id !== "string" || !id || id.includes("/")) { gaps.push(`${problem.id}: missing recorded approval`); continue; }
  const [approval, reference] = await Promise.all([db.doc(`content_validation_records/${id}`).get(),db.doc(`problem_scoring/${problem.id}`).get()]);
  if (findForbiddenPublicKeys(problem.data()).length) gaps.push(`${problem.id}: protected fields exist in public problem document`);
  if (approval.get("decision") !== "approved" || approval.get("problemId") !== problem.id || approval.get("problemVersion") !== problem.get("version") || reference.get("problemVersion") !== problem.get("version") || reference.get("validationRecordId") !== id) { gaps.push(`${problem.id}: approval/reference version mismatch`); continue; }
  if (approval.get("scoringSnapshotHash") && await contentHash(reference.data()) !== approval.get("scoringSnapshotHash")) { gaps.push(`${problem.id}: approved scoring snapshot changed`); continue; }
  if (!reference.get("solutionSteps")?.length || !reference.get("expectedConcepts")?.length || !reference.get("finalAnswer") || !reference.get("interpretation")) { gaps.push(`${problem.id}: incomplete worked reference`); continue; }
  valid.push({topic:problem.get("topicId"),difficulty:problem.get("difficulty"),concepts:JSON.stringify([problem.get("topic"),reference.get("expectedConcepts"),reference.get("requiredTheorem"),reference.get("requiredFormula")]).toLowerCase()});
}
const coverage = Object.fromEntries(["pigeonhole","mean","variance","regression"].map(concept=>[concept,valid.filter(p=>p.concepts.includes(concept)).length]));
for (const [concept,count] of Object.entries(coverage)) if (!count) gaps.push(`No ready approved content found for ${concept}`);
const matrix = topics.docs.map(topic=>({topicId:topic.id,topic:topic.get("name"),...Object.fromEntries(["Basic","Intermediate","Advanced"].map(level=>[level,valid.filter(p=>p.topic===topic.id&&p.difficulty===level).length]))}));
const noticeId = privacy.get("currentConsentVersion");
const policy = noticeId ? await db.doc(`policy_documents/${noticeId}`).get() : null;
if (policy?.get("aiProcessingVersion") !== "gemini-free-v1" || policy?.get("status") !== "active") gaps.push("Current notice has not been updated for Gemini free-tier processing.");
console.log(JSON.stringify({project,approvedProblems:problems.size,readyProblems:valid.length,coverage,matrix,pilotState:pilot.get("state")??"not configured",gaps},null,2));
if (process.argv.includes("--verify") && gaps.length) process.exitCode = 1;
