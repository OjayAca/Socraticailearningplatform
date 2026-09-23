// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearningService } from "../../server/services/LearningService";
import { AI_WORKFLOW_VERSION, allowedSupport, checkMath, educationalContext, initialGates, numericValue, recommendation, GeminiTutor, type Turn, type Score, type Tutor } from "../../server/gemini";
import { ServiceError, type Env, type RecordDoc, type Store } from "../../server/platform";
import { REASONING_PHASES } from "@mindguide/contracts";

// In-memory unit fixtures only. Never seed or connect a Firebase project.
class MemoryStore implements Store {
  records = new Map<string,{data:any;version:number}>();
  put(path:string,data:any) {this.records.set(path,{data:structuredClone(data),version:(this.records.get(path)?.version??0)+1});}
  async get(path:string):Promise<RecordDoc> {const r=this.records.get(path);return{path,data:r?structuredClone(r.data):null,version:r?String(r.version):undefined};}
  async query(collection:string,field?:string,value?:unknown) {return Promise.all([...this.records].filter(([path,r])=>path.startsWith(collection+"/") && path.split("/").length===collection.split("/").length+1 && (!field||r.data[field]===value)).map(([path])=>this.get(path)));}
  async commit(writes:Array<{doc:RecordDoc;data:any}>) {
    for(const {doc} of writes) if(String(this.records.get(doc.path)?.version??"")!==(doc.version??"")) throw new ServiceError(409,"conflict","Stale document");
    for(const {doc,data} of writes)this.put(doc.path,data);
  }
}
const env={GEMINI_API_KEY:"unit-test-only",AI_ENABLED:"true",AI_FREE_TIER_CONFIRMED:"true",GEMINI_MODEL:"gemini-3.6-flash",GEMINI_RPM:"100",GEMINI_TPM:"10000000",GEMINI_RPD:"1000"} as Env;
const response=(overrides:Partial<Turn>={}):Turn=>({feedback:"Your reasoning identifies the target.",question:"Which information is given?",accepted:false,confidence:"high",category:"none",evidence:["Student identifies the target quantity."],intent:"answer",leaksSolution:false,...overrides});
let db:MemoryStore, generate:ReturnType<typeof vi.fn>, service:LearningService;
const baseReference={answerSpecification:{kind:"number",value:8},expectedConcepts:["mean"],solutionSteps:["Sum and divide by the count."],finalAnswer:"8",interpretation:"The average is 8.",problemVersion:1,validationRecordId:"approval"};
beforeEach(()=>{
  db=new MemoryStore();generate=vi.fn().mockResolvedValue(response());service=new LearningService(db,{generate} as Tutor,env,"alice");
  db.put("users/alice",{status:"active",displayName:"Private name",email:"private@example.invalid"});
  db.put("system_settings/privacy",{currentConsentVersion:"ai-notice"});db.put("policy_documents/ai-notice",{status:"active",aiProcessingVersion:"gemini-free-v1"});db.put("users/alice/consents/ai-notice",{version:"ai-notice"});
  db.put("system_settings/pilot",{state:"open",enabledTopicIds:["mean"]});db.put("pilot_roster/alice",{status:"admitted"});
  db.put("topics/mean",{status:"approved",subjectId:"math",name:"Measures of Central Tendency"});db.put("subjects/math",{status:"approved",name:"Quantitative Methods"});
  db.put("problems/problem",{status:"approved",topicId:"mean",difficulty:"Basic",validationRecordId:"approval",version:1,problemText:"Find the mean of 4, 8 and 12."});
  db.put("content_validation_records/approval",{decision:"approved",problemId:"problem",problemVersion:1});db.put("problem_scoring/problem",baseReference);
});
const start=()=>service.operation("startLearningSession",{mode:"curated",topicId:"mean",requestId:crypto.randomUUID()});
const answer=(session:any,intent="answer",requestId=crypto.randomUUID())=>service.operation("evaluatePhaseResponse",{sessionId:session.id,expectedPhase:session.currentPhase,revision:session.revision,intent,response:{plainText:"The target is the average of the given values."},requestId});

describe("AI session authority and recovery",()=>{
  it("recovers only the authenticated user's exact saved operation without generating again", async () => {
    const input = { mode: "curated", topicId: "mean", requestId: crypto.randomUUID() };
    const result = await service.operation("startLearningSession", input);
    const calls = generate.mock.calls.length;
    const recovery = { operation: "startLearningSession", input };
    expect(await service.operation("getLearningOperationResult", recovery)).toEqual({ status: "complete", result });
    await expect(service.operation("getLearningOperationResult", { ...recovery, input: { ...input, topicId: "different" } })).rejects.toThrow("does not match");
    const own = db.records.get(`ai_operations/alice_${input.requestId}`)!;
    db.records.delete(`ai_operations/alice_${input.requestId}`);
    db.records.set(`ai_operations/bob_${input.requestId}`, own);
    expect(await service.operation("getLearningOperationResult", recovery)).toEqual({ status: "missing" });
    expect(generate).toHaveBeenCalledTimes(calls);
  });
  it("keeps the request lease valid through a slow retried provider call", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    generate.mockImplementation(async () => { clock.mockReturnValue(now + 95000); return response(); });
    try { expect((await start()).session.needsOpening).toBe(false); }
    finally { clock.mockRestore(); }
  });
  it("pins private references and starts an AI conversation",async()=>{
    const {session}=await start();expect(session.workflowVersion).toBe(AI_WORKFLOW_VERSION);expect(session.needsOpening).toBe(false);
    expect((await db.get(`sessions/${session.id}/private/reference`)).data.finalAnswer).toBe("8");expect(JSON.stringify(session)).not.toContain('"finalAnswer"');
    expect(await db.query(`sessions/${session.id}/messages`)).toHaveLength(1);
  });
  it("requires the current AI processing consent",async()=>{
    db.put("policy_documents/ai-notice",{status:"active"});await expect(start()).rejects.toThrow("privacy notice");expect(generate).not.toHaveBeenCalled();
  });
  it("requires active accounts and real pilot admission",async()=>{
    db.put("pilot_roster/alice",{status:"revoked"});await expect(start()).rejects.toThrow("not currently admitted");
    db.put("users/alice",{status:"suspended"});await expect(start()).rejects.toThrow("not active");
  });
  it("reports remaining launch blockers together before reserving work",async()=>{
    db.put("system_settings/pilot",{state:"closed",enabledTopicIds:[]});
    db.records.delete("problems/problem");
    const disabled=new LearningService(db,{generate} as Tutor,{...env,AI_ENABLED:"false"},"alice");
    const failure=await disabled.operation("startLearningSession",{mode:"curated",topicId:"mean",requestId:crypto.randomUUID()}).catch(error=>error);
    expect(failure.message).toContain("sessions are paused");
    expect(failure.message).toContain("topic is not enabled");
    expect(failure.message).toContain("AI service is disabled");
    expect(failure.message).toContain("no approved prepared questions");
    expect(generate).not.toHaveBeenCalled();
    expect(await db.query("sessions")).toHaveLength(0);
  });
  it("does not assign stale or unapproved content",async()=>{
    db.put("content_validation_records/approval",{decision:"approved",problemId:"problem",problemVersion:2});await expect(start()).rejects.toThrow("No unanswered");
  });
  it("does not assign an altered approved snapshot",async()=>{
    db.put("content_validation_records/approval",{decision:"approved",problemId:"problem",problemVersion:1,scoringSnapshotHash:"wrong"});await expect(start()).rejects.toThrow("No unanswered");
  });
  it("accepts assessed reasoning and advances only one gate",async()=>{
    const {session}=await start();generate.mockResolvedValue(response({accepted:true}));const result=await answer(session);
    expect(result.session.currentPhase).toBe("relevant_information_identification");expect(result.session.gates.problem_understanding.status).toBe("accepted");expect(result.session.releasedSolution).toBeNull();
  });
  it.each(["question","help"])("%s does not count as a failed attempt",async(intent)=>{
    const {session}=await start();generate.mockResolvedValue(response({intent:intent as "question"|"help"}));const result=await answer(session,intent);
    expect(result.session.responseCount).toBe(0);expect(result.session.currentPhase).toBe(session.currentPhase);
    expect((await db.get(`sessions/${session.id}`)).data.gateStates.problem_understanding.attemptCount).toBe(0);
  });
  it.each(["question", "help"] as const)("recognizes natural %s messages sent using the answer action",async(intent)=>{
    const {session}=await start();generate.mockResolvedValue(response({intent}));
    const result = await answer(session);
    expect(result.session.responseCount).toBe(0);
    expect(result.session.currentPhase).toBe(session.currentPhase);
    expect((await db.get(`sessions/${session.id}`)).data.gateStates.problem_understanding.attemptCount).toBe(0);
  });
  it("progresses requested help without marking it as a failed answer",async()=>{
    let {session}=await start();generate.mockResolvedValue(response({intent:"help"}));
    for (const expected of ["targeted_hint","stronger_hint","partial_step"]) {
      ({session}=await answer(session,"help"));
      expect(session.allowedSupport).toContain(expected);
      expect(session.responseCount).toBe(0);
      expect(session.currentPhase).toBe("problem_understanding");
    }
    expect(session.supportHistory.at(-1).level).toBe("stronger_hint");
  });
  it("replays a duplicate request without a second model call",async()=>{
    const {session}=await start();const requestId=crypto.randomUUID();const first=await answer(session,"answer",requestId);const calls=generate.mock.calls.length;
    expect(await answer(session,"answer",requestId)).toEqual(first);expect(generate).toHaveBeenCalledTimes(calls);
  });
  it("rejects stale tabs before calling Gemini",async()=>{
    const {session}=await start();await answer(session);const calls=generate.mock.calls.length;await expect(answer(session)).rejects.toThrow("changed");expect(generate).toHaveBeenCalledTimes(calls);
  });
  it("does not overwrite a draft changed during request reservation",async()=>{
    const {session}=await start();const calls=generate.mock.calls.length;
    const original=db.commit.bind(db);let changed=false;
    vi.spyOn(db,"commit").mockImplementation(async writes=>{
      await original(writes);
      if(!changed && writes.some(w=>w.doc.path.startsWith("ai_locks/"))){
        changed=true;const doc=await db.get(`sessions/${session.id}`);
        db.put(doc.path,{...doc.data,revision:doc.data.revision+1,draft:{methodology:"New work from another tab"}});
      }
    });
    await expect(answer(session)).rejects.toThrow("changed while");
    expect(generate).toHaveBeenCalledTimes(calls);
    expect((await db.get(`sessions/${session.id}`)).data.draft.methodology).toBe("New work from another tab");
  });
  it("preserves student work on quota failure and retries the same operation",async()=>{
    const {session}=await start();generate.mockRejectedValueOnce(new ServiceError(429,"ai-quota","Free quota exhausted"));const requestId=crypto.randomUUID();
    await expect(answer(session,"answer",requestId)).rejects.toThrow("quota");
    expect((await db.get(`sessions/${session.id}`)).data.revision).toBe(session.revision);
    expect((await db.query(`sessions/${session.id}/messages`)).filter(m=>m.data.role==="student")).toHaveLength(1);
    generate.mockResolvedValue(response());await answer(session,"answer",requestId);expect((await db.query(`sessions/${session.id}/messages`)).filter(m=>m.data.role==="student")).toHaveLength(1);
  });
  it("recovers the reserved session when the opening call fails",async()=>{
    generate.mockRejectedValueOnce(new Error("network"));await expect(start()).rejects.toThrow("network");
    expect(await db.query("sessions")).toHaveLength(1);generate.mockResolvedValue(response());const result=await start();expect(result.session.needsOpening).toBe(false);expect(await db.query("sessions")).toHaveLength(1);
  });
  it("enforces shared free quota before calling the model",async()=>{
    const limited=new LearningService(db,{generate} as Tutor,{...env,GEMINI_RPM:"1"},"alice");const result=await limited.operation("startLearningSession",{mode:"curated",topicId:"mean",requestId:crypto.randomUUID()});
    await expect(limited.operation("evaluatePhaseResponse",{sessionId:result.session.id,expectedPhase:result.session.currentPhase,revision:result.session.revision,response:{plainText:"Find the requested average"},requestId:crypto.randomUUID()})).rejects.toThrow("free AI allowance");expect(generate).toHaveBeenCalledTimes(1);
  });
  it("does not accept low confidence or an answer leak",async()=>{
    const {session}=await start();generate.mockResolvedValue(response({accepted:true,confidence:"low"}));await expect(answer(session)).rejects.toThrow("reliably");
    generate.mockResolvedValue(response({leaksSolution:true}));await expect(answer(session)).rejects.toThrow("revision");
    expect((await db.get(`sessions/${session.id}`)).data.revision).toBe(session.revision);
  });
  it("does not unlock a solution before all reasoning and a final draft",async()=>{
    const {session}=await start();await expect(service.operation("finalizeScorecard",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()})).rejects.toThrow("all reasoning");
  });
  it("rejects ownership changes and conflicting mathematical acceptance",async()=>{
    const {session}=await start();const stored=(await db.get(`sessions/${session.id}`)).data;
    db.put(`sessions/${session.id}`,{...stored,currentPhase:"guided_computation_or_proof"});generate.mockResolvedValue(response({accepted:true}));
    await expect(service.operation("evaluatePhaseResponse",{sessionId:session.id,expectedPhase:"guided_computation_or_proof",revision:session.revision,response:{plainText:"9"},requestId:crypto.randomUUID()})).rejects.toThrow("disagree");
    db.put(`sessions/${session.id}`,{...stored,studentId:"bob"});await expect(answer(session)).rejects.toThrow("unavailable");
  });
  it("scores four criteria, unlocks after scoring, and submits exactly once",async()=>{
    let {session}=await start();const stored=(await db.get(`sessions/${session.id}`)).data;
    const gates=Object.fromEntries(REASONING_PHASES.map(p=>[p,{status:"accepted",attemptCount:1,correctiveCycleCount:0}]));
    db.put(`sessions/${session.id}`,{...stored,currentPhase:"controlled_solution_release",gateStates:gates,draft:{answer:{plainText:"8"},methodology:"Sum and divide",reflection:"Average value"}});
    const criterion={score:20,evidence:["Student response: sum and divide"],evidenceIds:["final_methodology"],reason:"Appropriate method",improvementAdvice:"Explain the equal weights",confidence:"high"};
    const score={accuracy:criterion,logicalValidity:criterion,methodSelection:criterion,explanationQuality:criterion,feedback:"Strong method; explain the conditions.",solution:{method:"Mean",justification:"Equal-weight observations",steps:["Add and divide by three"],answer:"8",verification:"Recompute the total",interpretation:"Average value is 8"}} as Score;
    generate.mockResolvedValue(score);const finished=await service.operation("finalizeScorecard",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()});session=finished.session;
    expect(session.scorecard.total).toBe(80);expect(session.releasedSolution.answer).toBe("8");
    const input={sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()};await service.operation("submitLearningSession",input);await service.operation("submitLearningSession",input);
    expect((await db.get("learning_progress/alice")).data.sessionsCompleted).toBe(1);
  });
  it("walks every reasoning phase, saves a draft and awards progress and notifications",async()=>{
    let {session}=await start();
    generate.mockResolvedValue(response({intent:"help"}));
    ({session}=await service.operation("requestSessionSupport",{sessionId:session.id,revision:session.revision,requestedLevel:"socratic_prompt",requestId:crypto.randomUUID()}));
    generate.mockResolvedValue(response({accepted:true}));
    for (const phase of REASONING_PHASES) {
      expect(session.currentPhase).toBe(phase);
      ({session}=await service.operation("evaluatePhaseResponse",{sessionId:session.id,revision:session.revision,expectedPhase:phase,response:{plainText:phase==="guided_computation_or_proof"?"8":"The observations have equal weight; sum them and divide by their count."},requestId:crypto.randomUUID()}));
    }
    ({session}=await service.operation("saveSessionDraft",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID(),draft:{answer:{plainText:"8"},methodology:"Sum and divide by three",reflection:"Each observation has equal weight"}}));
    const criterion={score:20,evidence:["Saved methodology"],evidenceIds:["final_methodology"],reason:"Appropriate method",improvementAdvice:"State the units",confidence:"high"};
    generate.mockResolvedValue({accuracy:criterion,logicalValidity:criterion,methodSelection:criterion,explanationQuality:criterion,feedback:"Sound reasoning",solution:{method:"Mean",justification:"Equal weights",steps:["Add and divide"],answer:"8",verification:"Recompute",interpretation:"The average is 8"}});
    ({session}=await service.operation("finalizeScorecard",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()}));
    const input={sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()};
    await service.operation("submitLearningSession",input);
    await service.operation("submitLearningSession",input);
    expect((await db.get(`sessions/${session.id}`)).data.status).toBe("submitted");
    const progress=(await db.get("learning_progress/alice")).data;
    expect(progress.sessionsCompleted).toBe(1);
    expect(progress.achievements.first_step.sourceSessionId).toBe(session.id);
    expect(await db.query("notifications")).toHaveLength(2);
    expect((await db.get("learning_progress/alice/assignment_state/mean")).data.activeSessionId).toBeNull();
  });
});

describe("Mathematics and adaptation",()=>{
  it.each([["(4+8+12)/3",8],["-2^2",-4],["2^-2",0.25],["50%",0.5],["1/0",null],["2;process.exit()",null],["2**3",null]])("bounded arithmetic %s",(input,expected)=>expect(numericValue(String(input))).toBe(expected));
  it("keeps proofs and unsupported notation distinct from wrong mathematics",()=>{
    expect(checkMath({plainText:"Suppose each box has at most one object..."},{kind:"proof"})).toBe("unsupported");
    expect(checkMath({plainText:"9"},baseReference.answerSpecification)).toBe("incorrect");
    expect(checkMath({plainText:"(4+8+12)/3"},baseReference.answerSpecification)).toBe("correct");
    expect(checkMath({plainText:"x+x"},{kind:"expression",expression:"2x"})).toBe("unsupported");
  });
  it("unlocks progressively stronger help without accepting gates",()=>{
    const gates=initialGates();gates.problem_understanding.attemptCount=3;gates.problem_understanding.correctiveCycleCount=3;
    expect(allowedSupport(gates)).toEqual(["socratic_prompt","targeted_hint","stronger_hint","partial_step"]);expect(gates.problem_understanding.status).toBe("pending");
  });
  const history=(score:number,support=false)=>Array.from({length:3},(_,i)=>({workflowVersion:6,statsCommittedAt:new Date(),submittedAt:new Date(i),scorecard:{criteria:Object.fromEntries(["accuracy","logicalValidity","methodSelection","explanationQuality"].map(k=>[k,{score}]))},supportHistory:support?[{level:"partial_step"}]:[]}));
  it("uses reasoning and assistance, not only answer accuracy",()=>{
    expect(recommendation("Basic",history(22)).recommendedDifficulty).toBe("Intermediate");expect(recommendation("Basic",history(22,true)).recommendedDifficulty).toBe("Basic");expect(recommendation("Intermediate",history(10)).recommendedDifficulty).toBe("Basic");
    expect(recommendation("Basic",history(22).slice(0,2)).recommendedDifficulty).toBe("Basic");
  });
  it("does not send account identity or secrets as educational context",()=>{
    const context=educationalContext({session:{studentId:"secret-uid",studentName:"Private Name",email:"email@private.invalid",currentPhase:"method_selection"},reference:{apiKey:"secret-api"},messages:[],intent:"question"});
    expect(JSON.stringify(context)).not.toMatch(/secret-uid|Private Name|private.invalid|secret-api/);
  });
  it("rejects malformed or truncated Gemini output",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:'{"accepted":'}]}}]})));
    try {await expect(new GeminiTutor(env).generate({session:{},reference:{},messages:[],intent:"opening"})).rejects.toThrow("incomplete");} finally {vi.unstubAllGlobals();}
  });
});
