import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { isDeepStrictEqual } from "node:util";
import { contentHash } from "../../src/lib/learning/content-hash.ts";
import { assertMarker, type Target } from "./staging-target.ts";
import { sourceHash, type Plan } from "./staging-bank-plan.ts";

export type Mode = "inspect"|"apply"|"rollback-preview"|"rollback";
const fingerprint = (s:{seconds:number;nanoseconds:number}) => [s.seconds,s.nanoseconds];
const collectionName = (p:string) => p.split("/").at(-2)!;

async function checkCatalog(db:Firestore, tx:Transaction, plan:Plan) {
  const subjects = await tx.get(db.collection("subjects"));
  const topics = await tx.get(db.collection("topics"));
  const pilot = await tx.get(db.doc("system_settings/pilot"));
  if (subjects.size !== 2 || topics.size !== 12) throw new Error("Unexpected staging curriculum size.");
  for (const {problem} of plan.records) {
    const subject = subjects.docs.find(d=>d.id === problem.subjectId);
    const topic = topics.docs.find(d=>d.id === problem.topicId);
    if (subject?.get("status") !== "approved" || subject.get("name") !== problem.subject || topic?.get("status") !== "approved" ||
        topic.get("subjectId") !== problem.subjectId || topic.get("name") !== problem.topic ||
        !pilot.get("enabledTopicIds")?.includes(problem.topicId)) throw new Error("Unverified topic: "+problem.topicId);
  }
  const catalog = await tx.get(db.collection("problems").select());
  if (catalog.docs.some(d=>!plan.baseline.has(d.ref.path) && !plan.entries.has(d.ref.path)))
    throw new Error("Unexpected question in staging catalog.");
  const originals = await tx.getAll(...[...plan.baseline.keys()].map(p=>db.doc(p)));
  for (const doc of originals) {
    const expected = plan.baseline.get(doc.ref.path)!;
    if (!doc.exists || Object.entries(expected).some(([k,v])=>!isDeepStrictEqual(doc.get(k),v)))
      throw new Error("Original differs: "+doc.ref.path);
  }
  return contentHash(originals.map(d=>[d.ref.path,fingerprint(d.updateTime!)]).sort());
}

function mentionsOwnedId(value:unknown, ids:Set<string>):boolean {
  if (typeof value === "string") return ids.has(value);
  if (Array.isArray(value)) return value.some(child=>mentionsOwnedId(child,ids));
  return !!value && typeof value === "object" && Object.values(value).some(child=>mentionsOwnedId(child,ids));
}

async function checkRollbackLinks(db:Firestore,tx:Transaction,plan:Plan) {
  const ids = new Set([...plan.entries.keys()].filter(p=>!p.includes("/private/")).map(p=>p.split("/")[1]));
  for (const collection of ["topics","subjects","problems","formula_theorem_references","socratic_prompt_bank",
    "misconception_categories","difficulty_policies","content_validation_records","problem_scoring"]) {
    for (const doc of (await tx.get(db.collection(collection))).docs) {
      if (!plan.entries.has(doc.ref.path) && mentionsOwnedId(doc.data(),ids)) throw new Error("Managed dependency: "+doc.ref.path);
    }
  }
  // Never read conversation text, answers or learner identity to find a configuration link.
  const sessions = await tx.get(db.collection("sessions").select("configurationVersions","problemId"));
  if (sessions.docs.some(d=>mentionsOwnedId(d.data(),ids))) throw new Error("A saved session pins batch content.");
  const problems = [...new Set([...plan.baseline.keys(),...plan.entries.keys()].filter(p=>/^problems\/[^/]+$/.test(p)))];
  // Bound parallel reads so a full rollback preview need not serialize 120 round trips.
  for (let i=0;i<problems.length;i+=12) {
    await Promise.all(problems.slice(i,i+12).map(async path=>{
      const children = db.collection(path+"/private");
      if (plan.entries.has(path)) {
        const docs = await tx.get(children.select());
        if (docs.docs.some(d=>!plan.entries.has(d.ref.path))) throw new Error("Unowned private child for "+path);
      } else {
        const docs = await tx.get(children);
        if (docs.docs.some(d=>mentionsOwnedId(d.data(),ids))) throw new Error("Original private reference depends on the batch.");
      }
    }));
  }
}

async function checkDependencies(db:Firestore, tx:Transaction, plan:Plan) {
  const ids = plan.records.map(r=>r.id);
  for (let i=0;i<ids.length;i+=30) {
    const group = ids.slice(i,i+30);
    for (const name of ["sessions","content_validation_records","socratic_prompt_bank"]) {
      const docs = await tx.get(db.collection(name).where("problemId","in",group).select());
      if (docs.docs.some(doc=>!plan.entries.has(doc.ref.path))) throw new Error("Candidate has a dependency in "+name);
    }
  }
  const scores = await tx.getAll(...ids.map(id=>db.doc("problem_scoring/"+id)));
  if (scores.some(d=>d.exists)) throw new Error("Candidate already has scoring material.");
}

// All target checks, content preconditions and the ownership journal share the transaction.
// A group receipt and every document it identifies have the same Firestore commit time.
export async function runStage(db:Firestore,target:Target,plan:Plan,batchId:string,mode:Mode, onAttempt:(paths:string[])=>void = ()=>{}) {
  if (!["inspect","apply","rollback-preview","rollback"].includes(mode)) throw new Error("Unknown staging mode.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(batchId)) throw new Error("Invalid batch ID.");
  if (!("projectId" in db) || db.projectId !== target.projectId || db.databaseId !== target.database || target.projectId === "socratic-ai-a7765")
    throw new Error("Database client is not bound to the verified staging target.");
  const root = db.doc("question_bank_imports/"+batchId);
  const manifest = {batchId, projectId:target.projectId, database:target.database, sourceHash,
    verificationId:target.verificationId, documentCount:plan.entries.size,
    collections:Object.fromEntries([...new Set([...plan.entries.keys()].map(collectionName))].map(name=>
      [name,[...plan.entries.keys()].filter(p=>collectionName(p)===name).length])), planned:plan.groups.flat()};
  for (;;) {
    const result = await db.runTransaction(async tx=>{
      onAttempt([]);
      const marker = await tx.get(db.doc("system_settings/staging_verification"));
      assertMarker(marker.data(),target);
      const saved = await tx.get(root);
      const baseline = await checkCatalog(db,tx,plan);
      if (saved.exists && (!isDeepStrictEqual(saved.get("manifest"),manifest) || saved.get("baseline") !== baseline))
        throw new Error("Manifest, original versions or verification changed.");
      await checkDependencies(db,tx,plan);
      const created:number[] = [], removed:number[] = [];
      const receipts = [];
      for (const [i,paths] of plan.groups.entries()) {
        const receipt = await tx.get(root.collection("events").doc("create-"+i));
        const rollback = await tx.get(root.collection("events").doc("rollback-"+i));
        if (receipt.exists) {
          if (!saved.exists || !isDeepStrictEqual(receipt.get("paths"),paths) || !receipt.createTime!.isEqual(receipt.updateTime!))
            throw new Error("Invalid ownership receipt for group "+i);
          created.push(i);
          receipts.push({event:"create",paths,commitTime:fingerprint(receipt.createTime!)});
        }
        if (rollback.exists) {
          if (!receipt.exists || !isDeepStrictEqual(rollback.get("paths"),paths) || !rollback.createTime!.isEqual(rollback.updateTime!))
            throw new Error("Invalid rollback receipt for group "+i);
          removed.push(i);
          receipts.push({event:"rollback",paths,commitTime:fingerprint(rollback.createTime!)});
        }
        const docs = await tx.getAll(...paths.map(p=>db.doc(p)));
        for (const doc of docs) {
          if (!receipt.exists || rollback.exists) {
            if (doc.exists) throw new Error("Collision at "+doc.ref.path);
          } else if (!doc.exists || !doc.createTime!.isEqual(receipt.createTime!) || !doc.updateTime!.isEqual(receipt.createTime!) ||
            !isDeepStrictEqual(doc.data(),plan.entries.get(doc.ref.path))) throw new Error("Missing or modified owned document: "+doc.ref.path);
        }
      }
      const rolling = mode.startsWith("rollback");
      if (rolling) await checkRollbackLinks(db,tx,plan);
      if (rolling && !saved.exists) throw new Error("Cannot roll back without an import manifest.");
      if (mode === "apply" && (removed.length || saved.get("status") === "rolled_back")) throw new Error("Rolled-back batch cannot be imported again.");
      const remaining = plan.groups.map((_,i)=>i).filter(i=>rolling ? created.includes(i) && !removed.includes(i) : !created.includes(i));
      const status = saved.exists ? saved.get("status") : "planned";
      if (mode === "inspect" || mode === "rollback-preview" || !remaining.length) {
        const failures = await tx.get(root.collection("failures"));
        return {done:true, manifest, status, created, removed, receipts, failedOperations:failures.docs.map(d=>d.data()),
          pendingPaths:remaining.flatMap(i=>plan.groups[i])};
      }
      const i = remaining[0], paths = plan.groups[i];
      onAttempt(paths);
      const finished = remaining.length === 1;
      const nextStatus = rolling ? finished ? "rolled_back" : "rolling_back" : finished ? "complete" : "importing";
      if (!saved.exists) tx.create(root,{manifest,baseline,status:nextStatus,createdAt:FieldValue.serverTimestamp()});
      else tx.update(root,{status:nextStatus,updatedAt:FieldValue.serverTimestamp()});
      for (const path of paths) {
        if (rolling) tx.delete(db.doc(path));
        else tx.create(db.doc(path),plan.entries.get(path)!);
      }
      tx.create(root.collection("events").doc((rolling?"rollback-":"create-")+i),
        {batchId,paths,count:paths.length,at:FieldValue.serverTimestamp()});
      return {done:false};
    });
    if (result.done) return result;
  }
}
