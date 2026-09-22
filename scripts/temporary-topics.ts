import { readFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth.ts";

// Explicitly requested temporary catalog entries; never fabricate problem approvals.
const env = await readFile(".env", "utf8");
const projectId = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!projectId || projectId.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Use the existing Firebase project in .env, without an emulator.");
}
await loadOperatorCredentials();
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const apply = process.argv.includes("--apply");
const archive = process.argv.includes("--archive");
if (apply && archive) throw new Error("Choose --apply or --archive.");
const marker = "temporary-solver-topics-2026-09-21";
const subjectId = "temporary-solver-testing";
const subject = "Temporary Solver Testing";
const entries = [
  { path: `subjects/${subjectId}`, value: { name: subject } },
  ...[
    ["temporary-central-tendency", "Measures of Central Tendency"],
    ["temporary-counting-principles", "Counting Principles"],
  ].map(([id, name]) => ({ path: `topics/${id}`, value: { name, subjectId, subject } })),
];
await db.runTransaction(async tx => {
  const snapshots = await Promise.all(entries.map(entry => tx.get(db.doc(entry.path))));
  for (const [index, entry] of entries.entries()) {
    const existing = snapshots[index];
    if (existing.exists && existing.get("temporaryBatch") !== marker) {
      throw new Error(`Refusing to overwrite existing content: ${entry.path}`);
    }
  }
  if (apply || archive) {
    for (const [index, entry] of entries.entries()) {
      const existing = snapshots[index];
      if (archive) {
        if (existing.exists) tx.update(existing.ref, { status: "archived", updatedAt: FieldValue.serverTimestamp() });
      } else if (!existing.exists) {
        tx.create(db.doc(entry.path), {
          ...entry.value, status: "approved", version: 1, temporary: true,
          temporaryBatch: marker, purpose: "User-requested testing of verified typed problems; no faculty problem approval.",
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }
});
const saved = await Promise.all(entries.map(entry => db.doc(entry.path).get()));
console.log(JSON.stringify({ projectId, mode: apply ? "apply" : archive ? "archive" : "inspect", entries: saved.map(item => ({ path: item.ref.path, exists: item.exists, status: item.get("status") ?? null })) }, null, 2));
