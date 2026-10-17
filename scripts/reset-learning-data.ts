/** Explicit operator-only learning reset. Never changes Firebase Authentication accounts. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { loadOperatorCredentials } from './lib/operator-auth.ts';
import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from '../src/data/validated-curriculum.ts';
const env = await readFile('.env', 'utf8');
const projectId = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!projectId || projectId.startsWith('demo-') || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use the existing .env project without an emulator.');
await loadOperatorCredentials();
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const resetCollections = new Set(['sessions','learning_progress','notifications','ai_operations','ai_locks','idempotency','problems','problem_scoring','formula_theorem_references','socratic_prompt_bank','misconception_categories','difficulty_policies','content_validation_records','announcements','scorecards','performance_records','analytics','achievements']);
const preservedCollections = new Set(['users','subjects','topics','system_settings','pilot_roster','policy_documents','audit_logs','ai_usage','rate_limits','rubrics']);
const curriculum = new Set([...VALIDATED_SUBJECTS.map(item => `subjects/${item.id}`), ...VALIDATED_TOPICS.map(item => `topics/${item.id}`)]);
const zeroStats = { sessionsCompleted: 0, averageCTScore: 0, currentStreak: 0, lastSessionDate: null, topicPerformance: [] };
const historicalFields = ['achievements','subjectProgress','topicRecommendations','accuracyEvidence','latestScorecard','lastActivityAt','lastSessionAt','lastSessionDate','sessionsCompleted','scoreTotal','averageCTScore','currentStreak','topicPerformance'];
function encode(value: any): any {
  if (value instanceof Timestamp) return { __timestamp: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, encode(value[key])]));
  return value;
}
function decode(value: any): any {
  if (value?.__timestamp) return new Timestamp(value.__timestamp[0], value.__timestamp[1]);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  return value;
}
const hash = (value: any) => createHash('sha256').update(JSON.stringify(encode(value))).digest('hex');
async function inventory() {
  const records: Record<string, any> = {};
  async function visit(collection: FirebaseFirestore.CollectionReference) {
    for (const ref of await collection.listDocuments()) {
      const doc = await ref.get();
      if (doc.exists) records[ref.path] = encode(doc.data());
      for (const child of await ref.listCollections()) await visit(child);
    }
  }
  const roots = await db.listCollections();
  for (const root of roots) {
    if (!resetCollections.has(root.id) && !preservedCollections.has(root.id)) throw new Error(`Unclassified collection: ${root.id}`);
    await visit(root);
  }
  return records;
}
async function accounts() {
  const users = []; let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    users.push(...page.users.map(user => ({ uid: user.uid, email: user.email ?? null, disabled: user.disabled, claims: user.customClaims ?? {}, providers: user.providerData })));
    pageToken = page.pageToken;
  } while (pageToken);
  return users.sort((a,b) => a.uid.localeCompare(b.uid));
}
function shouldDelete(path: string) {
  const parts = path.split('/');
  return resetCollections.has(parts[0]) || (['subjects','topics'].includes(parts[0]) && !curriculum.has(parts.slice(0,2).join('/'))) || (parts[0] === 'users' && ['operations','assignment_state','learning_progress','achievements'].includes(parts[2]));
}
const mode = process.argv[2];
const manifestArg = process.argv.find(arg => arg.startsWith('--manifest='))?.slice(11);
if (mode === 'prepare') {
  const records = await inventory();
  const auth = await accounts();
  if (auth.length !== 6 || Object.keys(records).filter(path => /^users\/[^/]+$/.test(path)).length !== 6) throw new Error('Expected six accounts/profiles; inspect changed inventory.');
  if (!records['system_settings/pilot']) throw new Error('Pilot settings missing.');
  const payload = { projectId, createdAt: new Date().toISOString(), records, auth, deletePaths: Object.keys(records).filter(shouldDelete), profilePaths: Object.keys(records).filter(path => /^users\/[^/]+$/.test(path)) };
  await mkdir('.local-backups', { recursive: true });
  const file = resolve('.local-backups', `fresh-start-${Date.now()}.json`);
  await writeFile(file, JSON.stringify({ ...payload, hash: hash(payload) }, null, 2), { flag: 'wx', mode: 0o600 });
  await db.runTransaction(async tx => {
    const pilot = await tx.get(db.doc('system_settings/pilot'));
    if (hash(pilot.data()) !== hash(records['system_settings/pilot'])) throw new Error('Pilot changed during backup.');
    tx.update(pilot.ref, { state: 'write-freeze' });
  });
  console.log(JSON.stringify({ manifest: file, backedUpDocuments: Object.keys(records).length, deleteDocuments: payload.deletePaths.length, profiles: payload.profilePaths.length, state: 'write-freeze' }, null, 2));
} else if (['apply','verify'].includes(mode)) {
  if (!manifestArg) throw new Error('Supply the exact --manifest path.');
  const { hash: savedHash, ...saved } = JSON.parse(await readFile(resolve(manifestArg), 'utf8'));
  if (saved.projectId !== projectId || hash(saved) !== savedHash) throw new Error('Manifest hash/project mismatch.');
  if (hash(await accounts()) !== hash(saved.auth)) throw new Error('Authentication accounts changed.');
  if (mode === 'apply') {
    const pilot = await db.doc('system_settings/pilot').get();
    if (pilot.get('state') !== 'write-freeze') throw new Error('Learning must remain frozen.');
    const locks = await db.collection('ai_locks').get();
    if (locks.docs.some(doc => Number(doc.get('expiresAt')) > Date.now())) throw new Error('An in-flight lease remains; wait for its expiry, then resume with this manifest.');
    const current = await inventory();
    for (const [path, data] of Object.entries(current)) {
      if (shouldDelete(path) && (!saved.deletePaths.includes(path) || hash(data) !== hash(saved.records[path]))) throw new Error(`Data changed after backup: ${path}. Back up again before deleting.`);
    }
    // Delete leaves first, including descendants whose parent document is already absent.
    for (const path of [...saved.deletePaths].sort((a: string,b: string) => b.split('/').length - a.split('/').length)) await db.doc(path).delete();
    for (const path of saved.profilePaths) {
      const patch: Record<string, any> = { stats: zeroStats };
      for (const key of historicalFields) patch[key] = FieldValue.delete();
      await db.doc(path).update(patch);
    }
  }
  const after = await inventory();
  const problems: string[] = [];
  for (const path of Object.keys(after)) if (shouldDelete(path)) problems.push(`Remaining reset data: ${path}`);
  for (const [path, value] of Object.entries(saved.records)) {
    if (shouldDelete(path)) continue;
    const expected = structuredClone(value) as any;
    if (saved.profilePaths.includes(path)) { expected.stats = zeroStats; for (const field of historicalFields) delete expected[field]; }
    if (path === 'system_settings/pilot' && mode === 'apply') expected.state = 'write-freeze';
    if (hash(after[path] ?? null) !== hash(expected)) problems.push(`Preserved record mismatch: ${path}`);
  }
  for (const topic of VALIDATED_TOPICS) {
    const actual = after[`topics/${topic.id}`];
    if (!actual || actual.status !== 'approved' || actual.name !== topic.name || actual.subjectId !== topic.subjectId || hash(actual.subtopics) !== hash(topic.subtopics)) problems.push(`Invalid curriculum: ${topic.id}`);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  if (mode === 'apply') await db.doc('system_settings/pilot').set(decode(saved.records['system_settings/pilot']));
  console.log(JSON.stringify({ verified: true, sessions: 0, historyDocuments: 0, accounts: saved.auth.length, subjects: Object.keys(after).filter(path => /^subjects\/[^/]+$/.test(path)).length, topics: Object.keys(after).filter(path => /^topics\/[^/]+$/.test(path)).length, preservedConfiguration: true, originalPilotRestored: true }, null, 2));
} else throw new Error('Use prepare, apply, or verify.');
