import { readFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth";

// Dry run by default. Preserve the real policy and retention; never create learner consent.
const source = await readFile(".env", "utf8");
const project = source.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!project || project.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Use the existing real Firebase project.");
await loadOperatorCredentials();
initializeApp({ projectId: project, credential: applicationDefault() });
const db = getFirestore();
const settings = await db.doc("system_settings/privacy").get();
const current = settings.get("currentConsentVersion");
if (typeof current !== "string" || current.includes("/")) throw new Error("An existing privacy policy is required.");
const original = await db.doc(`policy_documents/${current}`).get();
if (!original.exists || !original.get("retention")) throw new Error("Existing policy and retention details must be configured first.");
if (original.get("aiProcessingVersion") === "gemini-free-v1") { console.log("Current policy already covers Gemini processing."); process.exit(0); }
const version = `${current}-gemini-v1`;
const disclosure = "Gemini processes mathematical problems, relevant conversation history and your reasoning to provide tutoring, misconception feedback and formative scores. Account IDs, names and emails are excluded from the AI request. Google may use free-tier inputs and outputs to improve its products; do not enter personal or sensitive information. Cloudflare securely processes requests and Firebase stores the learning record. AI feedback can be inaccurate and is not an official grade.";
const updated = { ...original.data(), version, title: "Privacy and Responsible AI Notice", status: "active", aiProcessingVersion: "gemini-free-v1", summary: `${original.get("summary")}\n\n${disclosure}`, collectedData: [...new Set([...(original.get("collectedData") ?? []), "Socratic conversation, reasoning evidence, assistance history and formative AI feedback"])], updatedAt: FieldValue.serverTimestamp() };
console.log(JSON.stringify({ project, previousVersion: current, nextVersion: version, disclosure, retention: original.get("retention"), apply: process.argv.includes("--apply") }, null, 2));
if (process.argv.includes("--apply")) {
  await db.runTransaction(async tx => {
    const latest = await tx.get(settings.ref);
    if (latest.get("currentConsentVersion") !== current) throw new Error("Privacy settings changed; run the preview again.");
    tx.create(db.doc(`policy_documents/${version}`), updated);
    tx.update(settings.ref, { currentConsentVersion: version, updatedAt: FieldValue.serverTimestamp() });
  });
  console.log("Published the new notice. Every learner must acknowledge it themselves before AI processing.");
}
