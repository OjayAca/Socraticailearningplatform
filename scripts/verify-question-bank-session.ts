import { readFile, writeFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { loadOperatorCredentials } from './lib/operator-auth.ts';
import { contentHash } from '../src/lib/learning/content-hash.ts';

// Read-only verification of a real session created through the student interface.
const id = process.argv.find(arg => arg.startsWith('--session='))?.slice(10);
if (!id || !/^[\w-]+$/.test(id)) throw new Error('Provide --session=<real session ID>.');
const env = await readFile('.env', 'utf8');
const projectId = env.match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if (!projectId || projectId.startsWith('demo-') || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use the existing project without an emulator.');
await loadOperatorCredentials();
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore();
const session = await db.doc(`sessions/${id}`).get();
if (!session.exists || !session.get('problemId')) throw new Error('A real prepared-problem session is required.');
const s = session.data()!;
const [problem, reference, scoring, responses, cards, progress] = await Promise.all([
  db.doc(`problems/${s.problemId}`).get(), db.doc(`sessions/${id}/private/reference`).get(),
  db.doc(`problem_scoring/${s.problemId}`).get(), db.collection(`sessions/${id}/responses`).get(),
  db.collection(`sessions/${id}/scorecards`).get(), db.doc(`learning_progress/${s.studentId}`).get(),
]);
const report = {
  checkedAt: new Date().toISOString(), projectId, problemId: s.problemId,
  status: s.status, difficulty: s.difficulty, currentPhase: s.currentPhase,
  originalQuestionMatches: s.originalQuestion === problem.get('problemText'),
  pinnedReferenceMatches: await contentHash(Object.fromEntries(Object.keys(scoring.data() ?? {}).map(key=>[key,reference.get(key)]))) === await contentHash(scoring.data()),
  sourceGuidancePinned: Boolean(reference.get('sourceGuidance')),
  gates: Object.fromEntries(Object.entries(s.gateStates ?? {}).map(([key, value]) => [key, (value as any).status])),
  responseCount: responses.size,
  responseEvaluations: responses.docs.map(doc => ({ phase: doc.get('phase'), status: doc.get('evaluation.status'), category: doc.get('diagnosis.category') })),
  supportUsage: s.supportUsage, solutionReleased: Boolean(s.releasedSolution),
  scorecardTotal: s.scorecard?.total ?? null, persistedScorecards: cards.size,
  scorecardMatchesSavedRecord: cards.size === 1 && s.scorecard ? await contentHash(Object.fromEntries(Object.keys(s.scorecard).map(key => [key, cards.docs[0].get(key)]))) === await contentHash(s.scorecard) : null,
  statsCommitted: Boolean(s.statsCommittedAt), sessionsCompleted: progress.get('sessionsCompleted') ?? null,
};
console.log(JSON.stringify(report, null, 2));
const output = process.argv.find(arg => arg.startsWith('--report='))?.slice(9);
if (output) await writeFile(output, JSON.stringify(report, null, 2));
