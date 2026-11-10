// Read only: project-scoped QA history and normal policy decisions; no learner responses exported.
import {readFile,writeFile} from 'node:fs/promises';
import {initializeApp, applicationDefault} from 'firebase-admin/app';
import {getFirestore,Timestamp,type DocumentData} from 'firebase-admin/firestore';
import {loadOperatorCredentials} from './lib/operator-auth.ts';
import {recommendDifficulty} from '../server/learning-policy.ts';
const [anchor,out]=process.argv.slice(2);
if(!/^[\w-]+$/.test(anchor??'')||!out) throw new Error('Pass the known QA session ID and local evidence path.');
const projectId=(await readFile('.env','utf8')).match(/^VITE_FIREBASE_PROJECT_ID\s*=\s*["']?([^\s"'\r\n]+)/m)?.[1];
if(projectId!=='socratic-ai-a7765'||process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Incorrect project.');
await loadOperatorCredentials();
const db=getFirestore(initializeApp({projectId,credential:applicationDefault()}));
const owner=(await db.doc('sessions/'+anchor).get()).get('studentId');
if(!owner) throw new Error('No QA learner.');
const [sessions,progress,quota]=await Promise.all([db.collection('sessions').where('studentId','==',owner)
  .select('topicId','difficulty','workflowVersion','problemId','status','statsCommittedAt','submittedAt','scorecard','supportHistory','gateEvaluations','diagnosisSummary','difficultyRecommendation','adaptiveRecommendation','releasedSolution','currentPhase','needsOpening').get(),
  db.doc('learning_progress/'+owner).get(),db.doc('ai_usage/shared').get()]);
const rows=sessions.docs.map((doc):DocumentData & {id:string}=>{const data=doc.data();return {...data,id:doc.id,submittedAt:data.submittedAt instanceof Timestamp?data.submittedAt.toDate():data.submittedAt};});
const cells=[];
for(const topic of new Set(rows.map(s=>s.topicId))) for(const difficulty of ['Basic','Intermediate','Advanced'] as const) {
  const r=recommendDifficulty(difficulty,rows.filter(s=>s.problemId),6,topic);
  if(r.evidence.completedSessions) cells.push({topic,difficulty,decision:r.decision,recommended:r.recommendedDifficulty,
    distinctIds:r.evidence.sessionIds.map(id=>rows.find(s=>s.id===id)?.problemId),sessions:r.evidence.sessionIds});
}
const summary=await Promise.all(rows.filter(s=>s.problemId).map(async s=>{
  const cards=await db.collection('sessions/'+s.id+'/scorecards').get();
  const assigned=s.adaptiveRecommendation, sources:string[]=assigned?.evidence?.sessionIds??[];
  const sourceRows=sources.map(id=>rows.find(row=>row.id===id));
  return {id:s.id,topic:s.topicId,problem:s.problemId,difficulty:s.difficulty,status:s.status,score:s.scorecard?.total??null,
    persistedCards:cards.size,statsCommitted:!!s.statsCommittedAt,solutionReleased:!!s.releasedSolution,needsOpening:s.needsOpening??false,
    phase:s.currentPhase,decisionAfterSubmission:s.difficultyRecommendation?.decision??null,
    assignment:assigned ? {decision:assigned.decision,recommended:assigned.recommendedDifficulty,sources,
      distinctProblemIds:sourceRows.map(row=>row?.problemId??null),validDistinctSources:sourceRows.every(row=>row?.problemId &&
        row.topicId===s.topicId && row.difficulty===assigned.evidence.currentDifficulty && row.status==='submitted' &&
        row.statsCommittedAt && row.scorecard) && new Set(sourceRows.map(row=>row?.problemId)).size===sources.length}:null};
}));
await writeFile(out,JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,projectId,workflow:6,cells,
  curatedSessions:summary,sessionCount:rows.length,statsCompletions:progress.get('sessionsCompleted'),sharedAllowance:quota.data()},null,2));
