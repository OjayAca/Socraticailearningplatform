// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { stagingPlan, type Plan } from "../../scripts/lib/staging-bank-plan";
import { MemoryStore } from "../helpers/memory-learning-store";
import { LearningService } from "../../server/services/LearningService";
import type { Env } from "../../server/platform";
import { VALIDATED_TOPICS } from "../../src/data/validated-curriculum";

let plan:Plan;
beforeAll(async()=>{plan=await stagingPlan();});
it.each(VALIDATED_TOPICS)("excludes both unpublished statuses and selects an approved original in $name",async topic=>{
  const db=new MemoryStore();
  db.put("subjects/"+topic.subjectId,{status:"approved",name:topic.subject});
  db.put("topics/"+topic.id,{status:"approved",name:topic.name,subjectId:topic.subjectId,subject:topic.subject});
  const service=new LearningService(db,{generate:async()=>{throw new Error("Unexpected AI call");}},{} as Env,"unit");
  const prepare=()=>(service as any).prepare({topicId:topic.id,mode:"curated"},{});
  for(const status of ["draft","pending_validation"]) {
    for(const r of plan.records) db.put("problems/"+r.id,{...r.problem,status});
    await expect(prepare()).rejects.toMatchObject({code:"question-bank-exhausted"});
  }
  for(const [path,fields] of plan.baseline) db.put(path,fields);
  const {session}=await prepare();
  expect(plan.baseline.has("problems/"+session.problemId)).toBe(true);
  expect(session.difficulty).toBe("Basic");
});
