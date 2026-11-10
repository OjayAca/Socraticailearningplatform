// @vitest-environment node
import { beforeAll, beforeEach, expect, it } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { stagingPlan, type Plan } from "../../scripts/lib/staging-bank-plan";
import { runStage, type Mode } from "../../scripts/lib/staging-bank-run";
import { validateTarget, validateKey, assertMarker, type Target } from "../../scripts/lib/staging-target";
import { runApprovedExpansion } from "../../scripts/lib/approved-expansion";
import { questionBankDocuments } from "../../scripts/question-bank-documents";
import { sourceHash } from "../../scripts/lib/staging-bank-plan";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const target:Target = {classification:"non-production",projectId:"offline-unit",database:"(default)",
  origin:"https://unit.invalid",verificationId:"1f8e9a78-2288-4bb7-b26e-676adbb47497",verifiedBy:"Unit fixture",
  evidenceReference:"in-process only",expiresAt:"2099-01-01T00:00:00Z"};
it("requires independent, current target selection and matching staging credentials",()=>{
  const check = (data:unknown, selected:string|undefined, env={})=>validateTarget(data,["socratic-ai-a7765","configured-app"],selected,env);
  expect(check(target,target.projectId)).toEqual(target);
  for (const id of ["socratic-ai-a7765","configured-app","demo-unit"]) expect(()=>check({...target,projectId:id},id)).toThrow();
  expect(()=>check(target,undefined)).toThrow();
  expect(()=>check({...target,classification:"test"},target.projectId)).toThrow();
  expect(()=>check({...target,expiresAt:"2000-01-01T00:00:00Z"},target.projectId)).toThrow();
  expect(()=>check(target,target.projectId,{FIRESTORE_EMULATOR_HOST:"localhost"})).toThrow();
  expect(()=>check({...target,origin:"http://unit.invalid"},target.projectId)).toThrow();
  expect(()=>validateKey({type:"service_account",project_id:"socratic-ai-a7765"},target)).toThrow();
  expect(()=>validateKey({type:"service_account",project_id:target.projectId,client_email:"x@elsewhere.invalid",private_key:"test"},target)).toThrow();
  expect(()=>assertMarker(undefined,target)).toThrow();
  expect(()=>assertMarker({...target,verificationId:"foreign"},target)).toThrow();
});

// Firestore-shaped in-memory transaction double. Writes become visible together and timestamps
// represent commit versions. No SDK client, credentials, emulator or external connection.
class OfflineDB {
  projectId = target.projectId;
  databaseId = target.database;
  rows = new Map<string,{data:any,create:Timestamp,update:Timestamp}>();
  sequence = 0;
  interruptAfter = -1;
  commits:number[] = [];
  doc(path:string) { return {path,collection:(name:string)=>this.collection(path+"/"+name)}; }
  collection(path:string) { return {path, query:true,doc:(id:string)=>this.doc(path+"/"+id),
    select:()=>({query:true,path}), where:(key:string,_op:string,ids:string[])=>({select:()=>({query:true,path,key,ids})})}; }
  put(path:string,data:any,time = new Timestamp(++this.sequence,0)) {
    this.rows.set(path,{data,create:this.rows.get(path)?.create ?? time,update:time});
  }
  snapshot(path:string) {
    const row=this.rows.get(path);
    return {exists:!!row,ref:this.doc(path),id:path.split("/").at(-1),data:()=>row?.data,
      get:(key:string)=>row?.data[key],createTime:row?.create,updateTime:row?.update};
  }
  async runTransaction(fn:(tx:any)=>Promise<any>) {
    const writes:{op:string,path:string,data?:any}[]=[];
    const write=(op:string,ref:{path:string},data?:any)=>writes.push({op,path:ref.path,data});
    const get=(ref:any)=>{
      if (writes.length) throw new Error("Read after write");
      if (!ref.query) return this.snapshot(ref.path);
      const docs=[...this.rows.keys()].filter(p=>p.startsWith(ref.path+"/") &&
        !p.slice(ref.path.length+1).includes("/")).map(p=>this.snapshot(p)).filter(d=>!ref.key || ref.ids.includes(d.get(ref.key)));
      return {docs,size:docs.length};
    };
    const value=await fn({get,getAll:(...refs:any[])=>refs.map(get),create:(ref:any,data:any)=>write("create",ref,data),
      update:(ref:any,data:any)=>write("update",ref,data),delete:(ref:any)=>write("delete",ref)});
    if (writes.length) {
      if (writes.length>480) throw new Error("Exceeded transaction guard");
      for (const w of writes) if ((w.op==="create")===this.rows.has(w.path)) throw new Error("Write precondition failed: "+w.path);
      const time = new Timestamp(++this.sequence,0);
      for (const w of writes) {
        if (w.op==="delete") this.rows.delete(w.path);
        else this.put(w.path,w.op==="update"?{...this.rows.get(w.path)!.data,...w.data}:w.data,time);
      }
      this.commits.push(writes.length);
      if (this.commits.length===this.interruptAfter) throw new Error("Simulated lost acknowledgement");
    }
    return value;
  }
}
let plan:Plan, db:OfflineDB;
beforeAll(async()=>{plan=await stagingPlan();});
beforeEach(()=>{
  db=new OfflineDB();
  for (const [path,data] of plan.baseline) db.put(path,data);
  db.put("system_settings/staging_verification",target);
  db.put("system_settings/pilot",{enabledTopicIds:[...new Set(plan.records.map(r=>r.problem.topicId))]});
  for (const {problem} of plan.records) {
    db.put("subjects/"+problem.subjectId,{status:"approved",name:problem.subject});
    db.put("topics/"+problem.topicId,{status:"approved",subjectId:problem.subjectId,name:problem.topic});
  }
});
const run = (mode:Mode,batch="unit-run")=>runStage(db as unknown as Firestore,target,plan,batch,mode);
it("keeps all 84 invisible until the final commit; rejects collisions and resumes a lost acknowledgement without duplicates",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"mindguide-import-test-"));
  const backup=join(dir,"before.json");
  try {
    db.projectId="socratic-ai-a7765";
    db.put("system_settings/pilot",{state:"open",enabledTopicIds:[...new Set(plan.records.map(r=>r.problem.topicId))]});
    const evidence=JSON.parse(await readFile("docs/question-bank-expansion/approved-integration-2026-11-02/approval.json","utf8"));
    const records=plan.records.map(r=>({...r,problem:{...r.problem,importSource:"MINDGUIDE_84_Question_Expansion"}}));
    const expected=await questionBankDocuments(records,sourceHash,evidence);
    const opts={db:db as unknown as Firestore,projectId:db.projectId,records,sourceFileHash:sourceHash,expected,evidence,apply:false,verify:false,backup:false};
    await expect(runApprovedExpansion({...opts,evidence:{...evidence,confirmedBy:"unexpected"}},backup)).rejects.toThrow("confirmation");
    const collision="problems/"+records[0].id+"/private/solution";
    db.put(collision,expected.get(collision));
    await expect(runApprovedExpansion({...opts,backup:true},backup)).rejects.toThrow("Unowned");
    db.rows.delete(collision);
    const original=await runApprovedExpansion({...opts,backup:true},backup);
    expect(original.questions).toBe(36);
    db.interruptAfter=1;
    await expect(runApprovedExpansion({...opts,apply:true},backup)).rejects.toThrow("lost acknowledgement");
    expect(records.some(r=>db.rows.has("problems/"+r.id))).toBe(false);
    const done=await runApprovedExpansion({...opts,apply:true},backup);
    expect(done.questions).toBe(120);
    expect(done.originalVersionHash).toBe(original.originalVersionHash);
    expect(db.commits).toEqual([337,337,337,85]);
    expect((await runApprovedExpansion({...opts,apply:true},backup)).committedThisRun).toEqual([]);
    db.put(collision,expected.get(collision));
    await expect(runApprovedExpansion({...opts,verify:true},backup)).rejects.toThrow("modified");
  } finally {await rm(join(dir,"before.json"),{force:true}); await rm(dir,{recursive:true});}
},30_000);
it("reconciles all 924 content documents, bounded atomic retries and rollback with the 468 originals unchanged",async()=>{
  const originals = [...plan.baseline.keys()].map(p=>db.rows.get(p));
  const before = await run("inspect");
  expect(before.pendingPaths).toHaveLength(924);
  expect(before.manifest?.collections).toEqual({problems:84,private:168,formula_theorem_references:84,socratic_prompt_bank:588});
  db.interruptAfter=1;
  await expect(run("apply")).rejects.toThrow("lost acknowledgement");
  expect((await run("inspect")).pendingPaths).toHaveLength(462);
  const done=await run("apply");
  expect(done.status).toBe("complete"); expect(done.receipts?.map(r=>r.paths.length)).toEqual([462,462]);
  expect(db.commits).toEqual([464,464]);
  for (const {id} of plan.records) expect(db.snapshot("problems/"+id).get("status")).toBe("draft");
  await run("apply"); expect(db.commits).toHaveLength(2);
  await expect(run("apply","other-batch")).rejects.toThrow("Collision");
  expect((await run("rollback-preview")).pendingPaths).toHaveLength(924);
  db.interruptAfter=3;
  await expect(run("rollback")).rejects.toThrow("lost acknowledgement");
  expect((await run("rollback-preview")).pendingPaths).toHaveLength(462);
  expect((await run("rollback")).status).toBe("rolled_back");
  await run("rollback"); expect(db.commits).toHaveLength(4);
  await expect(run("apply")).rejects.toThrow("Rolled-back");
  expect([...plan.entries.keys()].filter(p=>db.rows.has(p))).toEqual([]);
  expect([...plan.baseline.keys()].map(p=>db.rows.get(p))).toEqual(originals);
});
it.each(["private collision","original edit","missing marker","wrong client","scoring","unowned rollback"])("blocks %s before any write",async reason=>{
  if(reason==="private collision") db.put(plan.groups[1][1],plan.entries.get(plan.groups[1][1]));
  if(reason==="original edit") db.put([...plan.baseline.keys()][0],{status:"approved"});
  if(reason==="missing marker") db.rows.delete("system_settings/staging_verification");
  if(reason==="wrong client") db.projectId="socratic-ai-a7765";
  if(reason==="scoring") db.put("problem_scoring/"+plan.records[0].id,{});
  await expect(run(reason==="unowned rollback"?"rollback":"apply")).rejects.toThrow();
  expect(db.commits).toHaveLength(0);
});
it.each(["same-data rewrite","lost document","decision","session","reference","private child","receipt edit","original version"])("refuses rollback on %s before deleting the first group",async reason=>{
  await run("apply");
  const path=plan.groups[1][0];
  if(reason==="same-data rewrite") db.put(path,db.snapshot(path).data());
  if(reason==="lost document") db.rows.delete(path);
  if(reason==="decision" || reason==="session") db.put((reason==="session"?"sessions":"content_validation_records")+"/dependency",{problemId:plan.records[83].id});
  if(reason==="reference") db.put("difficulty_policies/dependency",{links:[plan.records[83].referenceId]});
  if(reason==="private child") db.put("problems/"+plan.records[83].id+"/private/other",{});
  if(reason==="receipt edit") {const p="question_bank_imports/unit-run/events/create-1"; db.put(p,db.snapshot(p).data());}
  if(reason==="original version") {const p=[...plan.baseline.keys()][0]; db.put(p,db.snapshot(p).data());}
  await expect(run("rollback")).rejects.toThrow();
  expect(db.commits).toHaveLength(2);
});

it("rolls back an interrupted first group without touching the absent group",async()=>{
  db.interruptAfter=1;
  await expect(run("apply")).rejects.toThrow("lost acknowledgement");
  const preview=await run("rollback-preview");
  expect(preview.pendingPaths).toEqual(plan.groups[0]);
  expect((await run("rollback")).status).toBe("rolled_back");
  expect(db.commits).toEqual([464,464]);
  expect([...plan.entries.keys()].some(p=>db.rows.has(p))).toBe(false);
});
