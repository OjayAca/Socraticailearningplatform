import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth";

// Configure topic access for the existing, admitted operator; never enable the AI backend.
const source = await readFile(".env", "utf8");
const project = source.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!project || project.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Use the existing real Firebase project.");
await loadOperatorCredentials();
const require = createRequire(import.meta.url);
const operator = require("firebase-tools/lib/auth").getProjectDefaultAccount(process.cwd());
if (!operator?.user?.email) throw new Error("Sign in with the existing Firebase operator account.");
initializeApp({ projectId: project, credential: applicationDefault() });
const account = await getAuth().getUserByEmail(operator.user.email);
if (account.disabled) throw new Error("This account is disabled.");
const db = getFirestore();
const settingsRef = db.doc("system_settings/pilot");
const result = await db.runTransaction(async tx => {
  const [profile, roster, admitted, topics, subjects, settings] = await Promise.all([
    tx.get(db.doc(`users/${account.uid}`)), tx.get(db.doc(`pilot_roster/${account.uid}`)),
    tx.get(db.collection("pilot_roster").where("status", "==", "admitted")),
    tx.get(db.collection("topics").where("status", "==", "approved")),
    tx.get(db.collection("subjects").where("status", "==", "approved")), tx.get(settingsRef),
  ]);
  if (profile.get("status") !== "active" || roster.get("status") !== "admitted") throw new Error("The operator must be active and already admitted.");
  if (admitted.docs.some(doc => doc.id !== account.uid)) throw new Error("Other students are admitted; review cohort scope before opening topic access.");
  const approvedSubjects = new Set(subjects.docs.map(doc => doc.id));
  const enabledTopicIds = topics.docs.filter(doc => approvedSubjects.has(doc.get("subjectId"))).map(doc => doc.id);
  if (!enabledTopicIds.length) throw new Error("No genuinely approved topics are available.");
  if (process.argv.includes("--apply")) {
    tx.set(settingsRef, { state: "open", enabledTopicIds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(db.collection("audit_logs").doc(), { actorId: account.uid, actorType: "firebase_operator", action: "adminSetPilot", target: settingsRef.path, details: { previousState: settings.get("state") ?? "not configured", state: "open", enabledTopicIds, reason: "User requested topic access for their own admitted account; AI backend remains disabled" }, createdAt: FieldValue.serverTimestamp() });
  }
  return { project, account: account.email, previousState: settings.get("state") ?? "not configured", enabledTopicIds, apply: process.argv.includes("--apply") };
});
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--apply")) {
  const saved = await settingsRef.get();
  if (saved.get("state") !== "open" || JSON.stringify(saved.get("enabledTopicIds")) !== JSON.stringify(result.enabledTopicIds)) throw new Error("Topic access verification failed.");
  console.log("Verified topic access for the admitted operator. The separate AI backend switch is unchanged.");
}
