import { readFile, mkdir, writeFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { loadOperatorCredentials } from "./lib/operator-auth.ts";
import { VALIDATED_SUBJECTS, VALIDATED_TOPICS, CURRICULUM_VERSION } from "../src/data/validated-curriculum.ts";
const env = await readFile(".env", "utf8");
const projectId = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!projectId || projectId.startsWith("demo-") || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Use the existing .env Firebase project without an emulator.");
await loadOperatorCredentials();
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const collections = ["subjects", "topics", "problems", "formula_theorem_references", "socratic_prompt_bank", "difficulty_policies", "sessions", "learning_progress"];
const snapshots = await Promise.all(collections.map(name => db.collection(name).get()));
const byName = Object.fromEntries(collections.map((name, i) => [name, snapshots[i].docs]));
const expected = new Map([...VALIDATED_SUBJECTS.map(value => [`subjects/${value.id}`, value] as const), ...VALIDATED_TOPICS.map(value => [`topics/${value.id}`, value] as const)]);
const changes: Array<{ path: string; before: any; patch: any }> = [];
const archive = (doc: typeof snapshots[number]['docs'][number]) => {
  if (doc.get("status") !== "archived") changes.push({ path: doc.ref.path, before: doc.data(), patch: { status: "archived", curriculumArchiveReason: "Outside validated curriculum; retained for historical references", curriculumVersion: CURRICULUM_VERSION } });
};
for (const name of ["subjects", "topics"]) for (const doc of byName[name]) if (!expected.has(doc.ref.path)) archive(doc);
for (const [path, value] of expected) {
  const current = byName[path.split('/')[0]].find(doc => doc.ref.path === path);
  const { id: _id, ...fields } = value;
  const patch = { ...fields, status: "approved", curriculumVersion: CURRICULUM_VERSION };
  if (!current || Object.entries(patch).some(([key, val]) => JSON.stringify(current.get(key)) !== JSON.stringify(val))) changes.push({ path, before: current?.data() ?? null, patch });
}
const validTopicIds = new Set(VALIDATED_TOPICS.map(item => item.id));
const invalidProblems = new Set(byName.problems.filter(doc => !validTopicIds.has(doc.get("topicId"))).map(doc => doc.id));
for (const doc of byName.problems) if (invalidProblems.has(doc.id)) archive(doc);
for (const doc of byName.socratic_prompt_bank) if (invalidProblems.has(doc.get("problemId"))) archive(doc);
for (const doc of byName.formula_theorem_references) {
  const names = doc.get("supportedTopics") ?? [];
  if (doc.get("topicId") && !validTopicIds.has(doc.get("topicId")) || names.some((name: string) => !VALIDATED_TOPICS.some(topic => topic.name === name && topic.subject === doc.get("domain")))) archive(doc);
}
for (const doc of byName.difficulty_policies) if (doc.get("topicId") && !validTopicIds.has(doc.get("topicId"))) archive(doc);
const pilot = await db.doc("system_settings/pilot").get();
if (pilot.exists) {
  const old = pilot.get("enabledTopicIds") ?? [];
  // Curriculum selection changes only; preserve admission, service flags, and pilot state.
  const next = VALIDATED_TOPICS.map(topic => topic.id);
  if (JSON.stringify(old) !== JSON.stringify(next)) changes.push({ path: pilot.ref.path, before: pilot.data(), patch: { enabledTopicIds: next } });
}
console.log(JSON.stringify({ projectId, mode: process.argv.includes('--apply') ? 'apply' : 'inspect', inventory: Object.fromEntries(collections.map(name => [name, byName[name].length])), preservedSessions: byName.sessions.length, changes: changes.map(item => item.path), activeSubjects: 2, activeTopics: 12 }, null, 2));
if (process.argv.includes('--verify') && changes.length) throw new Error(`Curriculum verification failed: ${changes.length} pending changes.`);
if (process.argv.includes('--apply') && changes.length) {
  if (changes.length > 450) throw new Error("Too many changes for one atomic migration; review inventory first.");
  await mkdir('.local-backups', { recursive: true });
  const backup = `.local-backups/curriculum-${Date.now()}.json`;
  await writeFile(backup, JSON.stringify({ projectId, changes }, null, 2));
  await db.runTransaction(async tx => {
    const current = await Promise.all(changes.map(change => tx.get(db.doc(change.path))));
    changes.forEach((change, index) => {
      if (JSON.stringify(current[index].data() ?? null) !== JSON.stringify(change.before)) throw new Error(`Concurrent update: ${change.path}`);
    });
    changes.forEach(change => tx.set(db.doc(change.path), { ...change.patch, version: Number(change.before?.version ?? 0) + 1, updatedAt: new Date() }, { merge: true }));
  });
  console.log(`Applied atomically. Backup: ${backup}. No sessions, scores, progress, or private solution records changed.`);
}
