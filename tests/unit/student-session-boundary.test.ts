// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../app/api/learning/route";
import { MemoryStore } from "../helpers/memory-learning-store";
import { digest } from "../../server/platform";
import { initialGates } from "../../server/gemini";
import { validateOperation } from "../../src/lib/learning/validation";
import { studentHistory, studentSession } from "../../src/lib/learning/student-response";
import { REASONING_PHASES, SOLVER_STAGES } from "../../packages/contracts/src/index";

const db = new MemoryStore();
vi.mock("../../server/auth",()=>({authenticate:async()=>"student"}));
vi.mock("../../server/config",()=>({getServerEnv:()=>({AI_ENABLED:"true",AI_FREE_TIER_CONFIRMED:"true"})}));
vi.mock("../../server/firestore",()=>({Firestore:class {constructor(){return db;}}}));
const secrets = Object.fromEntries(["instructor_only","sourceGuidance","expected_final_answer","solutionSteps","expected_reasoning",
  "answerSpecification","common_errors","scoring_references","expected_evidence","adminReview","answerKey"].map(k=>[k,"SECRET-"+k]));
const topicId = "discrete-mathematics-logic";
const input = {requestId:"67bcb95b-eaf4-4895-a172-74f46c418347",mode:"curated",subjectId:"discrete-mathematics",requestedDifficulty:"Basic",topicId};
const session = {id:"unit-session",studentId:"student",workflowVersion:6,topicId,subjectId:"discrete-mathematics",problemMode:"curated",difficulty:"Basic",status:"in_progress",currentPhase:REASONING_PHASES[0],
  revision:1,originalQuestion:"Translate the sentence.",currentPrompt:"What must you establish?",gateStates:initialGates(),
  gateEvaluations:{problem_understanding:{phase:"problem_understanding",status:"pending",...secrets},internal:secrets},
  supportHistory:[{level:"socratic_prompt",content:["State your goal."],...secrets}],lastDiagnosis:{category:"none",...secrets},
  draft:{answer:{plainText:"My work",mathJson:secrets,...secrets},methodology:"logic",...secrets},
  adaptiveRecommendation:{recommendedDifficulty:"Basic",reason:"Entry level",...secrets},
  scorecard:null,releasedSolution:{answer:secrets.expected_final_answer,steps:[secrets.solutionSteps]},...secrets};
const call=(operation:string,params:object)=>POST(new Request("http://localhost/api/learning",{method:"POST",
  body:JSON.stringify({operation,input:params})}));
beforeEach(()=>{
  db.records.clear();
  db.put("subjects/discrete-mathematics",{name:"Discrete Mathematics",status:"approved"});
  db.put("topics/"+topicId,{subjectId:"discrete-mathematics",subject:"Discrete Mathematics",name:"Logic",status:"approved"});
  db.put("users/student",{status:"active"});
  db.put("system_settings/privacy",{currentConsentVersion:"v1"});
  db.put("policy_documents/v1",{status:"active",aiProcessingVersion:"gemini-free-v1"});
  db.put("users/student/consents/v1",{version:"v1"});
  db.put("system_settings/pilot",{state:"open",enabledTopicIds:[topicId]});
  db.put("pilot_roster/student",{status:"admitted"});
  db.put("learning_progress/student/assignment_state/"+topicId,{activeSessionId:session.id});
  db.put("sessions/"+session.id,session);
});
it.each(["resume","mutation","replay","recovery"])("strips private markers from the actual learning HTTP response on %s",async path=>{
  const normal=await call("startLearningSession",input);
  expect(normal.status).toBe(200);
  let result=await normal.json();
  if (path==="mutation") {
    const response=await call("abandonLearningSession",{sessionId:session.id,revision:1,requestId:crypto.randomUUID()});
    expect(response.status).toBe(200); result=await response.json();
  }
  if (path==="replay" || path==="recovery") {
    const saved={...secrets,session:{...result.session,...secrets,releasedSolution:session.releasedSolution},
      tutorMessage:{id:"tutor",role:"assistant",text:"Try a premise.",phase:REASONING_PHASES[0],createdAt:1,...secrets},
      completion:{releasedSolution:session.releasedSolution,...secrets}};
    db.put("ai_operations/student_"+input.requestId,{status:"complete",result:saved,
      fingerprint:await digest({name:"startLearningSession",input:validateOperation("startLearningSession",input)})});
    const response=path==="replay" ? await call("startLearningSession",input) :
      await call("getLearningOperationResult",{operation:"startLearningSession",input});
    expect(response.status).toBe(200); result=await response.json(); if(path==="recovery") result=result.result;
    expect(result.completion).toBeNull();
  }
  expect(result.session).toMatchObject({id:session.id,currentPrompt:session.currentPrompt,originalQuestion:session.originalQuestion,
    supportHistory:[{content:["State your goal."]}],draft:{answer:{plainText:"My work"}},releasedSolution:null});
  for(const [field,marker] of Object.entries(secrets)) {
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(JSON.stringify(result)).not.toContain('"'+field+'"');
  }
});
it("disallows a foreign assignment session before projecting its fields",async()=>{
  db.put("sessions/"+session.id,{...session,studentId:"someone-else"});
  const response=await call("startLearningSession",input);
  expect(response.status).toBe(403); expect(await response.text()).not.toContain(session.originalQuestion);
});
it("after release selects only approved solution and scorecard fields",()=>{
  const progress=Object.fromEntries(SOLVER_STAGES.map(stage=>[stage,{stage,status:"completed",acceptedGates:1,totalGates:1}]));
  const safe=studentSession({...session,stageProgress:progress,status:"ready_for_submission",scorecard:{total:80,
    criteria:{accuracy:{score:20,...secrets},internal:secrets},...secrets},releasedSolution:{answer:"Released answer",steps:["Released step"],...secrets}});
  expect(safe.releasedSolution).toEqual({answer:"Released answer",steps:["Released step"]});
  expect(JSON.stringify(safe)).not.toContain("SECRET-");
});

it("keeps instructor data and unreleased solutions out of history, preserving older recorded releases",()=>{
  const history=studentHistory(session.id,{...session,scorecard:{total:20,...secrets},status:"submitted",
    adminReview:{comment:"Learner-visible feedback",...secrets},problemContext:{promptSnapshot:"Prior question",...secrets}});
  expect(history.adminReview).toEqual({comment:"Learner-visible feedback"});
  expect(history.releasedSolution).toBeNull(); expect(JSON.stringify(history)).not.toContain("SECRET-");
  const legacy=studentHistory(session.id,{workflowVersion:5,status:"returned",scorecard:{total:80},
    releasedSolution:{answer:"Previously released",...secrets}});
  expect(legacy.releasedSolution).toEqual({answer:"Previously released"});
});
