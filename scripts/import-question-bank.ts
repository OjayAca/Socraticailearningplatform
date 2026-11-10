import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadOperatorCredentials } from './lib/operator-auth.ts';
import { prepareQuestionBank } from './question-bank-core.ts';
import { questionBankDocuments } from './question-bank-documents.ts';
import { contentHash } from '../src/lib/learning/content-hash.ts';

const option = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourcePath = option('source');
if (!sourcePath) throw new Error('Provide --source=<question-bank.json>. Default is read-only; use --apply or --verify.');
const raw = await readFile(sourcePath, 'utf8');
const records = await prepareQuestionBank(JSON.parse(raw));
const sourceFileHash = createHash('sha256').update(raw).digest('hex');
const approvedExpansion = process.argv.includes('--approved-expansion');
if (process.argv.includes('--apply') && !approvedExpansion) {
  const expansion = JSON.parse(await readFile('docs/question-bank-expansion/MINDGUIDE_84_Question_Expansion.json', 'utf8'));
  const draftIds = new Set(expansion.problems.map((p: {problem_id:string}) => p.problem_id));
  if (records.some(r => draftIds.has(r.id))) throw new Error('Expansion IDs require the staging-only draft importer.');
}
const evidencePath = option('approval');
const evidence = evidencePath ? JSON.parse(await readFile(evidencePath, 'utf8')) : null;
if (evidence && (evidence.sourceFileHash !== sourceFileHash || !evidence.statement || !evidence.confirmedAt || !evidence.confirmedBy || !evidence.reference)) throw new Error('Approval evidence must identify this exact source file and the real confirmation.');
const env = await readFile('.env', 'utf8');
const projectId = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!projectId || projectId.startsWith('demo-') || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use the existing configured Firebase project; no emulators.');
await loadOperatorCredentials();
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const status = evidence ? 'approved' : 'draft';
if (sourceFileHash === '5579cfa063b1cb640948662f0399acabd51ad8d6b8271d445390508e7cf93ce0') {
  for (const record of records) record.problem.importSource = 'MINDGUIDE_84_Question_Expansion';
}
const expected = await questionBankDocuments(records, sourceFileHash, evidence);
if (approvedExpansion) {
  const { runApprovedExpansion } = await import('./lib/approved-expansion.ts');
  const result = await runApprovedExpansion({db, projectId, records, sourceFileHash, expected, evidence,
    apply:process.argv.includes('--apply'), verify:process.argv.includes('--verify'), backup:process.argv.includes('--backup')});
  console.log(JSON.stringify(result, null, 2));
  if (option('report')) await writeFile(option('report')!, JSON.stringify(result,null,2));
  process.exit(0);
}
// Read the catalog and reject duplicates under other IDs as well as changed existing imports.
const [existingProblems, subjects, topics, pilot] = await Promise.all([
  db.collection('problems').get(), db.collection('subjects').get(), db.collection('topics').get(), db.doc('system_settings/pilot').get(),
]);
for (const record of records) {
  const topic = topics.docs.find(d => d.id === record.problem.topicId);
  if (!topic || topic.get('status') !== 'approved' || topic.get('subjectId') !== record.problem.subjectId || topic.get('name') !== record.problem.topic || !subjects.docs.some(d => d.id === record.problem.subjectId && d.get('status') === 'approved')) throw new Error(`Broken curriculum relationship: ${record.id}`);
  const duplicate = existingProblems.docs.find(d => d.id !== record.id && (d.get('sourceProblemId') === record.id || [record.problem.problemText, record.source.student_facing.problem_statement].includes(d.get('problemText'))));
  if (duplicate) throw new Error(`Duplicate question ${record.id} already exists at ${duplicate.ref.path}; no writes made.`);
}
const paths = [...expected.keys()];
const existing = await db.getAll(...paths.map(path => db.doc(path)));
const missing: string[] = [];
for (const [index, path] of paths.entries()) {
  const actual = existing[index];
  if (!actual.exists) { missing.push(path); continue; }
  const fields = expected.get(path)!;
  const projected = Object.fromEntries(Object.keys(fields).map(key => [key, actual.get(key)]));
  if (await contentHash(projected) !== await contentHash(fields)) throw new Error(`Existing record differs: ${path}. Refusing to overwrite edits or approvals.`);
}
const report = { projectId, sourceFileHash, mode: process.argv.includes('--apply') ? 'apply' : process.argv.includes('--verify') ? 'verify' : 'inspect',
  questions: records.length, publicationStatus: status, newQuestions: missing.filter(p => /^problems\/[^/]+$/.test(p)).length,
  skippedQuestions: records.length - missing.filter(p => /^problems\/[^/]+$/.test(p)).length, duplicates: 0,
  plannedDocuments: expected.size, missingDocuments: missing.length, topics: new Set(records.map(r => r.problem.topicId)).size,
  pilotState: pilot.get('state'), enabledTopics: pilot.get('enabledTopicIds')?.length ?? 0,
  missingAnswers: 0, missingSolutions: 0, semanticAssessmentQuestions: records.length,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--verify') && missing.length) throw new Error('Verification failed: missing documents.');
if (process.argv.includes('--apply') && missing.length) {
  if (missing.length > 480) throw new Error('Import exceeds atomic transaction limit.');
  await mkdir('.local-backups', { recursive: true });
  await writeFile(`.local-backups/question-bank-${Date.now()}.json`, JSON.stringify({ report, before: existing.map(d => ({ path: d.ref.path, data: d.data() ?? null })), source: JSON.parse(raw), evidence }, null, 2));
  await db.runTransaction(async tx => {
    const fresh = await tx.getAll(...paths.map(p => db.doc(p)));
    const catalog = await tx.get(db.collection('problems'));
    const links = await tx.getAll(...[...new Set(records.flatMap(r => [`topics/${r.problem.topicId}`, `subjects/${r.problem.subjectId}`]))].map(p => db.doc(p)));
    if (links.some(d => d.get('status') !== 'approved')) throw new Error('Curriculum approval changed during import.');
    if (catalog.docs.some(d => !existingProblems.docs.some(old => old.id === d.id && old.updateTime.isEqual(d.updateTime)))) throw new Error('Question catalog changed during import; inspect again.');
    for (const [index, doc] of fresh.entries()) {
      const before = existing[index];
      if (doc.exists !== before.exists || doc.exists && !doc.updateTime!.isEqual(before.updateTime!)) throw new Error(`Concurrent edit: ${doc.ref.path}`);
    }
    for (const path of missing) tx.create(db.doc(path), expected.get(path)!);
    tx.create(db.collection('audit_logs').doc(), { action: 'question_bank_import', actorId: 'operator-import', createdAt: new Date(), details: report, evidenceReference: evidence?.reference ?? null });
  });
  console.log('Atomic import committed. Run --verify with the same source and approval evidence.');
}
if (option('report')) await writeFile(option('report')!, JSON.stringify(report, null, 2));
