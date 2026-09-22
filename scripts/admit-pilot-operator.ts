import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth";

// Admit only the signed-in operator's existing learner account, on explicit --apply.
// Never grants admin role, manufactures consent, or opens the pilot globally.
const source = await readFile(".env", "utf8");
const project = source.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!project || project.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Use the existing real Firebase project.");
await loadOperatorCredentials();
const require = createRequire(import.meta.url);
const operator = require("firebase-tools/lib/auth").getProjectDefaultAccount(process.cwd());
if (!operator?.user?.email) throw new Error("Sign in with the existing Firebase operator account.");
initializeApp({ projectId: project, credential: applicationDefault() });
const account = await getAuth().getUserByEmail(operator.user.email);
if (account.disabled) throw new Error("The operator's application account is disabled.");
const db = getFirestore();
const profileRef = db.doc(`users/${account.uid}`);
const rosterRef = db.doc(`pilot_roster/${account.uid}`);
const profile = await profileRef.get();
if (profile.get("status") !== "active" || profile.get("role") !== "student") throw new Error("An existing active learner account is required.");
console.log(JSON.stringify({ project, account: account.email, previousStatus: (await rosterRef.get()).get("status") ?? "not admitted", apply: process.argv.includes("--apply") }, null, 2));
if (process.argv.includes("--apply")) {
  await db.runTransaction(async tx => {
    const [latest, roster] = await Promise.all([tx.get(profileRef), tx.get(rosterRef)]);
    if (latest.get("status") !== "active" || latest.get("role") !== "student") throw new Error("Account status changed; review before admitting.");
    if (roster.get("status") === "admitted") return;
    tx.set(rosterRef, { status: "admitted", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(db.collection("audit_logs").doc(), { actorId: account.uid, actorType: "firebase_operator", action: "adminPilotRoster", target: account.uid, details: { status: "admitted", reason: "User requested access for their own AI practice account" }, createdAt: FieldValue.serverTimestamp() });
  });
  const saved = await rosterRef.get();
  if (saved.get("status") !== "admitted") throw new Error("Admission could not be verified.");
  console.log("Verified: the existing operator learner account is admitted to AI practice.");
}
