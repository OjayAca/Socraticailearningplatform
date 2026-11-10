import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isDeepStrictEqual as same } from 'node:util';
import type { Firestore } from 'firebase-admin/firestore';
import { contentHash } from '../../src/lib/learning/content-hash.ts';
import { findForbiddenPublicKeys } from '../../src/lib/learning/validation.ts';
import { stagingPlan, sourceHash } from './staging-bank-plan.ts';
import type { prepareQuestionBank } from '../question-bank-core.ts';
import type { questionBankDocuments } from '../question-bank-documents.ts';

const evidenceHash = 'be37114a8a9a51378cad2f0cef454eb642c52f11551a961ecd2cbdee27aa5c13';
const target = 'socratic-ai-a7765';
const defaultBackup = '.local-backups/approved-expansion-2026-11-02-before.json';
const receiptPrefix = 'audit_logs/approved-expansion-' + sourceHash.slice(0,16) + '-';
type Options = {db:Firestore; projectId:string; records:Awaited<ReturnType<typeof prepareQuestionBank>>;
  sourceFileHash:string; expected:Awaited<ReturnType<typeof questionBankDocuments>>; evidence:unknown;
  apply:boolean; verify:boolean; backup:boolean};

export function publicationGroups(paths:string[]) {
  const publicPaths = paths.filter(p=>/^problems\/[^/]+$/.test(p));
  const protectedPaths = paths.filter(p=>!publicPaths.includes(p));
  if (publicPaths.length !== 84 || protectedPaths.length !== 1008 || new Set(paths).size !== paths.length)
    throw new Error('Unexpected approved publication inventory.');
  return [protectedPaths.slice(0,336),protectedPaths.slice(336,672),protectedPaths.slice(672),publicPaths];
}

export async function runApprovedExpansion(o:Options, backupPath=defaultBackup) {
  if (o.projectId!==target || !('projectId' in o.db) || o.db.projectId!==target || o.db.databaseId!=='(default)' ||
      process.env.FIRESTORE_EMULATOR_HOST || o.sourceFileHash!==sourceHash || await contentHash(o.evidence)!==evidenceHash)
    throw new Error('Approved expansion requires the pinned target, full source and owner confirmation.');
  if ([o.apply,o.backup,o.verify].filter(Boolean).length>1) throw new Error('Choose a single operation.');
  const {baseline} = await stagingPlan(); // Existing hash-pinned original manifest and document builder.
  const groups = publicationGroups([...o.expected.keys()]);
  const versions = (t:{seconds:number;nanoseconds:number})=>[t.seconds,t.nanoseconds];
  const ids = new Set(o.records.map(r=>r.id));
  if (o.records.length!==84 || ids.size!==84 || [...o.expected.keys()].some(path=>baseline.has(path))) throw new Error('Source ID conflict.');
  for (const {id} of o.records) {
    const p=o.expected.get('problems/'+id)!;
    const scoring=o.expected.get('problem_scoring/'+id)!;
    const validation=o.expected.get('content_validation_records/'+p.validationRecordId)!;
    if (findForbiddenPublicKeys(p,false).length || p.status!=='approved' || scoring.validationRecordId!==p.validationRecordId ||
        validation.scoringSnapshotHash!==await contentHash(scoring) || p.importSource!=='MINDGUIDE_84_Question_Expansion')
      throw new Error('Invalid approval, scoring or student visibility: '+id);
  }
  const db=o.db;
  const paths=[...baseline.keys(),...groups.flat()];
  const committedThisRun:number[]=[];
  // Only a clean pre-import snapshot can authorize writes. Replays use exactly the same snapshot.
  const saved=o.apply ? JSON.parse(await readFile(backupPath,'utf8')) : undefined;
  if (saved && (saved.projectId!==target || saved.sourceHash!==sourceHash || saved.evidenceHash!==evidenceHash ||
      !same(saved.absent,groups.flat()) || saved.originals?.length!==468 ||
      saved.baselineHash!==await contentHash(saved.originals.map((d:{path:string;version:number[]})=>[d.path,d.version]))))
    throw new Error('Invalid pre-import backup.');
  for (;;) {
    const state=await db.runTransaction(async tx=>{
      const subjects=await tx.get(db.collection('subjects'));
      const topics=await tx.get(db.collection('topics'));
      const pilot=await tx.get(db.doc('system_settings/pilot'));
      const catalog=await tx.get(db.collection('problems').select());
      if (subjects.size!==2 || topics.size!==12 || pilot.get('state')!=='open' || catalog.docs.some(d=>!baseline.has(d.ref.path) && !ids.has(d.id)))
        throw new Error('Unexpected live catalog.');
      for(const {problem:p} of o.records) {
        const s=subjects.docs.find(d=>d.id===p.subjectId), t=topics.docs.find(d=>d.id===p.topicId);
        if(s?.get('status')!=='approved' || s.get('name')!==p.subject || t?.get('status')!=='approved' ||
           t.get('subjectId')!==p.subjectId || t.get('name')!==p.topic || !pilot.get('enabledTopicIds')?.includes(p.topicId))
          throw new Error('Broken topic relationship: '+p.topicId);
      }
      const receipts=await tx.getAll(...groups.map((_,i)=>db.doc(receiptPrefix+i)));
      const docs=await tx.getAll(...paths.map(p=>db.doc(p)));
      const byPath=new Map(docs.map(d=>[d.ref.path,d]));
      const originals=[...baseline].map(([path,fields])=>{
        const doc=byPath.get(path)!;
        if (!doc.exists || Object.entries(fields).some(([k,v])=>!same(doc.get(k),v))) throw new Error('Original changed: '+path);
        return {path,version:versions(doc.updateTime!),data:doc.data()};
      });
      const baselineHash=await contentHash(originals.map(d=>[d.path,d.version]));
      if (saved && saved.baselineHash!==baselineHash) throw new Error('Original versions changed since backup.');
      let pending=-1;
      for(const [i,group] of groups.entries()) {
        const receipt=receipts[i];
        const fields={action:'question_bank_import',actorId:'operator-import',projectId:target,sourceHash,evidenceHash,baselineHash,group:i,paths:group};
        if(receipt.exists && (pending!==-1 || !same(receipt.data(),fields) || !receipt.updateTime!.isEqual(receipt.createTime!)))
          throw new Error('Invalid import receipt '+i);
        for (const path of group) {
          const doc=byPath.get(path)!;
          if(doc.exists!==receipt.exists || doc.exists && (!doc.updateTime!.isEqual(receipt.createTime!) || !same(doc.data(),o.expected.get(path))))
            throw new Error('Unowned, missing or modified path: '+path);
        }
        if(!receipt.exists && pending===-1) pending=i;
      }
      if (catalog.size!==(receipts[3].exists?120:36)) throw new Error('Unexpected question count.');
      // Reject unexpected validation records linked to candidates, including under other IDs.
      const validations=await tx.get(db.collection('content_validation_records').select('problemId'));
      if(validations.docs.some(d=>ids.has(d.get('problemId')) && !o.expected.has(d.ref.path))) throw new Error('Unexpected validation dependency.');
      const remaining=groups.filter((_,i)=>!receipts[i].exists).flat();
      if(o.apply && pending!==-1) {
        const group=groups[pending];
        for(const path of group) tx.create(db.doc(path),o.expected.get(path)!);
        tx.create(db.doc(receiptPrefix+pending),{action:'question_bank_import',actorId:'operator-import',projectId:target,
          sourceHash,evidenceHash,baselineHash,group:pending,paths:group});
      }
      return {pending,remaining,originals,baselineHash,total:catalog.size,
        receipts:receipts.filter(r=>r.exists).map(r=>({path:r.ref.path,commitTime:versions(r.createTime!)}))};
    },o.apply ? {maxAttempts:3} : {readOnly:true});
    if(o.apply && state.pending!==-1) {committedThisRun.push(state.pending); continue;}
    if(o.verify && state.remaining.length) throw new Error('Publication is incomplete.');
    if(o.backup) {
      if(state.remaining.length!==1092) throw new Error('Refusing to replace a pre-import backup from a partial or completed run.');
      await mkdir('.local-backups',{recursive:true});
      const raw=JSON.stringify({projectId:target,database:'(default)',sourceHash,evidenceHash,baselineHash:state.baselineHash,
        originals:state.originals,absent:state.remaining,absentReceipts:groups.map((_,i)=>receiptPrefix+i)},null,2);
      await writeFile(backupPath,raw,{flag:'wx'});
      if(await readFile(backupPath,'utf8')!==raw) throw new Error('Backup verification failed.');
    }
    return {checkedAt:new Date().toISOString(),projectId:target,database:'(default)',sourceHash,evidenceHash,
      originalDocuments:468,originalVersionHash:state.baselineHash,questions:state.total,plannedDocuments:1092,
      missingDocuments:state.remaining.length,groups:groups.map(g=>g.length),committedThisRun,receipts:state.receipts,
      ...(o.backup?{backup:backupPath}:{}),...(state.remaining.length?{pendingPaths:state.remaining}:{})};
  }
}
