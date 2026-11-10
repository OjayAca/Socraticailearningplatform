import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertMarker, loadTarget, stagingApp } from "./lib/staging-target.ts";
import { stagingPlan } from "./lib/staging-bank-plan.ts";
import { runStage, type Mode } from "./lib/staging-bank-run.ts";

const [mode,batchId,...unexpected] = process.argv.slice(2);
if (!["inspect","apply","rollback-preview","rollback"].includes(mode) || !batchId || unexpected.length)
  throw new Error("Usage: stage-question-bank.ts <inspect|apply|rollback-preview|rollback> <batch-id>. No source or approval arguments allowed.");
const target = await loadTarget();
if (["apply","rollback"].includes(mode) && process.env.MINDGUIDE_CONFIRM_ACTION !== [mode,target.projectId,batchId].join("/"))
  throw new Error("Missing exact MINDGUIDE_CONFIRM_ACTION for the inspected batch and target.");
const plan = await stagingPlan();
const app = await stagingApp(target);
const dir = ".mindguide-staging/audit";
await mkdir(dir,{recursive:true});
const attemptId = randomUUID();
const audit = dir+"/"+attemptId+".json";
const db = getFirestore(app);
let attemptedPaths:string[] = [];
const metadata = {batchId,mode,projectId:target.projectId,startedAt:new Date().toISOString()};
try {
  const result = await runStage(db,target,plan,batchId,mode as Mode,paths=>{attemptedPaths=paths;});
  await writeFile(audit,JSON.stringify({...metadata,finishedAt:new Date().toISOString(),result},null,2),{flag:"wx"});
  console.log(JSON.stringify({audit,status:result.status,remaining:result.pendingPaths?.length}));
} catch (error) {
  // Atomic content groups can be reconciled from their receipts after an ambiguous network outcome.
  const failure = {...metadata,attemptedPaths,failedAt:new Date().toISOString(),error:error instanceof Error ? error.message : String(error),
    manifest:"question_bank_imports/"+batchId, reconciliation:"Run inspect before retrying."};
  await writeFile(audit,JSON.stringify(failure,null,2),{flag:"wx"});
  if (attemptedPaths.length && ["apply","rollback"].includes(mode)) {
    await db.runTransaction(async tx=>{
      assertMarker((await tx.get(db.doc("system_settings/staging_verification"))).data(),target);
      const root = db.doc("question_bank_imports/"+batchId);
      const current = await tx.get(root);
      if (current.get("manifest.verificationId") === target.verificationId)
        tx.create(root.collection("failures").doc(attemptId),failure);
    }).catch(()=>console.error("Failure evidence retained in "+audit));
  }
  throw error;
} finally { await deleteApp(app); }
