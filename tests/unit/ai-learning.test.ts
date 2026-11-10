// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { prepareQuestionBank } from "../../scripts/question-bank-core";
import { questionBankDocuments } from "../../scripts/question-bank-documents";
import { LearningService } from "../../server/services/LearningService";
import { AI_WORKFLOW_VERSION, allowedSupport, checkMath, educationalContext, initialGates, numericValue, recommendation, GeminiTutor, type Turn, type Score, type Tutor } from "../../server/gemini";
import { ServiceError, type Env } from "../../server/platform";
import { REASONING_PHASES } from "@mindguide/contracts";

import { MemoryStore } from "../helpers/memory-learning-store";
const env={GEMINI_API_KEY:"unit-test-only",AI_ENABLED:"true",AI_FREE_TIER_CONFIRMED:"true",GEMINI_MODEL:"gemini-3.6-flash",GEMINI_RPM:"100",GEMINI_TPM:"10000000",GEMINI_RPD:"1000"} as Env;
const response=(overrides:Partial<Turn>={}):Turn=>({feedback:"Your reasoning identifies the target.",question:"Which information is given?",accepted:false,confidence:"high",category:"none",evidence:["Student identifies the target quantity."],intent:"answer",leaksSolution:false,...overrides});
let db:MemoryStore, generate:ReturnType<typeof vi.fn>, service:LearningService;
const baseReference={answerSpecification:{kind:"number",value:8},expectedConcepts:["mean"],solutionSteps:["Sum and divide by the count."],finalAnswer:"8",interpretation:"The average is 8.",problemVersion:1,validationRecordId:"approval"};
beforeEach(()=>{
  db=new MemoryStore();generate=vi.fn().mockResolvedValue(response());service=new LearningService(db,{generate} as Tutor,env,"alice");
  db.put("users/alice",{status:"active",displayName:"Private name",email:"private@example.invalid"});
  db.put("system_settings/privacy",{currentConsentVersion:"ai-notice"});db.put("policy_documents/ai-notice",{status:"active",aiProcessingVersion:"gemini-free-v1"});db.put("users/alice/consents/ai-notice",{version:"ai-notice"});
  db.put("system_settings/pilot",{state:"open",enabledTopicIds:["quantitative-methods-descriptive-statistics"]});db.put("pilot_roster/alice",{status:"admitted"});
  db.put("topics/quantitative-methods-descriptive-statistics",{status:"approved",subjectId:"quantitative-methods",subject:"Quantitative Methods",name:"Descriptive Statistics"});db.put("subjects/quantitative-methods",{status:"approved",name:"Quantitative Methods"});
  db.put("problems/problem",{status:"approved",topicId:"quantitative-methods-descriptive-statistics",difficulty:"Basic",validationRecordId:"approval",version:1,problemText:"Find the mean of 4, 8 and 12."});
  db.put("content_validation_records/approval",{decision:"approved",problemId:"problem",problemVersion:1});db.put("problem_scoring/problem",baseReference);
});
const start=()=>service.operation("startLearningSession",{mode:"curated",topicId:"quantitative-methods-descriptive-statistics",requestId:crypto.randomUUID()});
const answer=(session:any,intent="answer",requestId=crypto.randomUUID())=>service.operation("evaluatePhaseResponse",{sessionId:session.id,expectedPhase:session.currentPhase,revision:session.revision,intent,response:{plainText:"The target is the average of the given values."},requestId});

describe("AI session authority and recovery",()=>{
  it("bounds a premature calculation opening to understanding without accepting evidence", async () => {
    generate.mockResolvedValue(response({accepted:true, question:"What is the sum of the given values?"}));
    const result = await start();
    expect(result.session.currentPhase).toBe("problem_understanding");
    expect(result.session.currentPrompt).toBe("In your own words, what do you need to find, and which given information helps you find it?");
    expect(result.session.responseCount).toBe(0);
    expect((await db.get(`sessions/${result.session.id}`)).data.gateStates.problem_understanding.status).not.toBe("accepted");
    expect(result.tutorMessage.text).not.toContain("sum");
    expect(generate).toHaveBeenCalledOnce();
  });
  it.each(["mean", "logic"])("reassesses conflicting intent through the complete %s workflow and persists one scorecard", async kind => {
    const logic = kind === "logic";
    const problem = logic ? "Evaluate p AND q when p=true and q=false." : "Find the mean of 4, 6, and 8.";
    const finalAnswer = logic ? "false" : "6";
    db.put("problems/problem", {...(await db.get("problems/problem")).data, problemText:problem});
    db.put("problem_scoring/problem", {...baseReference, finalAnswer, answerSpecification:logic ? {kind:"truth",value:false} : {kind:"number",value:6}});
    let {session} = await start();
    const submit = async (text:string, accepted=true, conflict=false) => {
      generate.mockResolvedValue(response({accepted, evidence:[text]}));
      if (conflict) generate.mockResolvedValueOnce(response({intent:"question",accepted:true,feedback:"Task successfully completed."}));
      const input={sessionId:session.id,revision:session.revision,expectedPhase:session.currentPhase,response:{plainText:text},requestId:crypto.randomUUID()};
      const result=await service.operation("evaluatePhaseResponse",input);
      expect(await service.operation("evaluatePhaseResponse",input)).toEqual(result);
      session=result.session;
      return result;
    };
    await submit(logic ? "Determine p AND q, given p is true and q is false." : "Find the arithmetic mean of 4, 6 and 8; there are three values.",true,true);
    expect(session.currentPhase).toBe("method_selection");
    await submit(logic ? "Conjunction requires both propositions to be true." : "Sum divided by count because the observations have equal weight.");
    expect(session.currentPhase).toBe("guided_computation_or_proof");
    const wrong=await submit(logic ? "true" : "(4+6+8)/3 = 8",true);
    expect(wrong.evaluation.status).toBe("needs_revision");
    expect(session.currentPhase).toBe("guided_computation_or_proof");
    await submit(logic ? "p AND q is false because q is false and conjunction requires both true." : "18 / 3 = 6");
    expect(session.currentPhase).toBe("result_interpretation");
    const done=await submit(logic ? "The conjunction is false because q is false; the truth table requires both to be true." : "The mean is 6: sharing the total equally gives 6 per observation. Checking 6 times 3 gives 18.",true,true);
    expect(done.session.currentPhase).toBe("controlled_solution_release");
    expect(done.tutorMessage.text).toContain("All four stages are complete");
    expect(done.session.scorecard).toBeNull();
    const saved=(await db.get(`sessions/${session.id}`)).data;
    expect(REASONING_PHASES.every(p=>saved.gateStates[p].status === "accepted")).toBe(true);
    const ids=(await db.query(`sessions/${session.id}/responses`)).filter(d=>d.data.evaluation.status==="accepted").map(d=>`${d.path.split('/').at(-1)}_student`);
    const criterion={score:20,evidence:["Saved learner reasoning"],evidenceIds:ids,reason:"Supported",improvementAdvice:"Explain clearly",confidence:"high"};
    generate.mockResolvedValue({accuracy:criterion,logicalValidity:criterion,methodSelection:criterion,explanationQuality:criterion,feedback:"Formative assessment",solution:{method:"Verified method",justification:"Given conditions",steps:["Apply the method"],answer:finalAnswer,verification:"Check the result",interpretation:"Answer in context"}});
    const reveal={sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()};
    const scored=await service.operation("finalizeScorecard",reveal);
    expect(scored.session.scorecard.total).toBe(80);
    expect(await service.operation("finalizeScorecard",reveal)).toEqual(scored);
    expect(await db.query(`sessions/${session.id}/scorecards`)).toHaveLength(1);
    const finish={sessionId:session.id,revision:scored.session.revision,requestId:crypto.randomUUID()};
    const submitted=await service.operation("submitLearningSession",finish);
    expect(await service.operation("submitLearningSession",finish)).toEqual(submitted);
    expect((await db.get(`sessions/${session.id}`)).data.scorecard).toEqual(scored.session.scorecard);
    expect(submitted.session.status).toBe("submitted");
  });

  it("keeps unresolved intent gated with explicit recovery and accounts for the extra call", async () => {
    const {session}=await start();
    generate.mockResolvedValue(response({intent:"question",accepted:true,feedback:"You successfully completed everything."}));
    const result=await answer(session);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls.at(-1)![0].reassessIntent).toBe(true);
    expect((await db.get("ai_usage/shared")).data.requests).toBe(3);
    expect(result.session.currentPhase).toBe(session.currentPhase);
    expect(result.session.responseCount).toBe(0);
    expect(result.tutorMessage.text).toContain("could not reliably assess");
    expect(result.tutorMessage.text).not.toContain("successfully completed");
  });

  it("does not accept unsupported praise or empty assessment evidence", async () => {
    const {session}=await start();
    generate.mockResolvedValue(response({accepted:true,evidence:[],feedback:"Everything is complete."}));
    const result=await answer(session);
    expect(result.evaluation.status).toBe("needs_revision");
    expect(result.session.currentPhase).toBe(session.currentPhase);
    expect(result.tutorMessage.text).not.toContain("Everything is complete");
  });

  it.each(["problem_understanding","method_selection","guided_computation_or_proof","result_interpretation"])("bounds hints to %s without granting evidence", async phase => {
    let {session}=await start();
    const stored=(await db.get(`sessions/${session.id}`)).data;
    db.put(`sessions/${session.id}`,{...stored,currentPhase:phase,allowedSupport:["targeted_hint"]});
    generate.mockResolvedValue(response({accepted:true,question:"What is 4 + 6 + 8?",feedback:"Your method is correct."}));
    const result=await service.operation("requestSessionSupport",{sessionId:session.id,revision:session.revision,requestedLevel:"targeted_hint",requestId:crypto.randomUUID()});
    session=result.session;
    expect(session.currentPhase).toBe(phase);
    expect(session.responseCount).toBe(0);
    expect(session.supportHistory.at(-1).phase).toBe(phase);
    expect(session.supportHistory.at(-1).content.join(" ")).not.toContain("4 + 6 + 8");
    if(phase==="result_interpretation") expect(result.tutorMessage.text).toContain("what it represents");
  });
  it.each(["invented", "assistant", "wrong_stage", "wrong_solution", "low_confidence", "quota"])("preserves reasoning on failed reveal: %s, then recovers the same request", async failure => {
    let {session} = await start();
    generate.mockResolvedValue(response({accepted:true}));
    for (let i=0;i<4;i++) {
      ({session}=await service.operation("evaluatePhaseResponse",{sessionId:session.id,revision:session.revision,expectedPhase:session.currentPhase,response:{plainText:session.currentPhase==="guided_computation_or_proof"?"(4+8+12)/3 = 8":"The givens determine the average by equal weighting."},requestId:crypto.randomUUID()}));
    }
    const messages = await db.query(`sessions/${session.id}/messages`);
    const studentIds = messages.filter(m=>m.data.role === "student").map(m=>m.data.id);
    const tutorId = messages.find(m=>m.data.role === "assistant")!.data.id;
    const criterion={score:20,evidence:["learner work"],evidenceIds:studentIds,reason:"Supported",improvementAdvice:"Explain units",confidence:"high"};
    const good={accuracy:criterion,logicalValidity:criterion,methodSelection:criterion,explanationQuality:criterion,feedback:"Reasoning assessed",solution:{method:"Mean",justification:"Equal weighting",steps:["Sum and divide"],answer:"8",verification:"Recompute",interpretation:"Average value"}};
    const bad=structuredClone(good);
    if(failure === "invented") bad.accuracy.evidenceIds=["final_answer"];
    if(failure === "assistant") bad.accuracy.evidenceIds=[tutorId];
    if(failure === "wrong_stage") bad.accuracy.evidenceIds=[messages.find(m=>m.data.role==="student" && m.data.phase==="method_selection")!.data.id];
    if(failure === "wrong_solution") bad.solution.answer="9";
    if(failure === "low_confidence") bad.accuracy.confidence="low";
    if(failure === "quota") generate.mockRejectedValueOnce(new ServiceError(429,"ai-quota","Quota unavailable"));
    else generate.mockResolvedValueOnce(bad);
    const input={sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()};
    await expect(service.operation("finalizeScorecard",input)).rejects.toThrow();
    const saved=(await db.get(`sessions/${session.id}`)).data;
    expect(saved.scorecard).toBeNull();expect(saved.releasedSolution).toBeNull();expect(saved.revision).toBe(session.revision);
    expect(saved.gateStates.result_interpretation.status).toBe("accepted");
    generate.mockResolvedValue(good);
    const result=await service.operation("finalizeScorecard",input);
    expect(result.session.status).toBe("ready_for_submission");
    expect(result.session.scorecard.criteria.accuracy.source).toBe("hybrid");
    expect((await db.get("learning_progress/alice")).data).toBeNull();
    const calls=generate.mock.calls.length;
    expect(await service.operation("finalizeScorecard",input)).toEqual(result);
    expect(generate).toHaveBeenCalledTimes(calls);
  });
  it.each(["wrong_formula", "invalid_logic", "incorrect_interpretation"] as const)("records %s and provides corrective dialogue instead of an error", async category => {
    const {session} = await start();
    generate.mockResolvedValue(response({accepted:true,category,question:"Advance to the next stage.",evidence:["A specific part of the student's reasoning needs correction."]}));
    const requestId = crypto.randomUUID();
    const result = await answer(session,"answer",requestId);
    expect(result.session.currentPhase).toBe(session.currentPhase);
    expect(result.evaluation.status).toBe("needs_revision");
    expect(result.diagnosis).toMatchObject({category,resolutionStatus:"open",correctivePrompt:result.nextPrompt});
    expect(result.session.diagnosisSummary).toContain(category);
    expect(result.tutorMessage.text).not.toContain("Advance to");
    expect(result.tutorMessage.text).not.toContain("8");
    const saved = await db.get(`sessions/${session.id}/responses/${requestId}`);
    expect(saved.data.diagnosis.category).toBe(category);
    expect((await db.get(`sessions/${session.id}/messages/${requestId}_tutor`)).data.text).toBe(result.tutorMessage.text);
    const calls = generate.mock.calls.length;
    expect(await answer(session,"answer",requestId)).toEqual(result);
    expect(generate).toHaveBeenCalledTimes(calls);
    generate.mockResolvedValue(response({accepted:true}));
    expect((await answer(result.session)).session.currentPhase).toBe("method_selection");
  });

  it("preserves a reliable, specific corrective prompt for an ordinary wrong answer", async () => {
    const {session} = await start();
    generate.mockResolvedValue(response({category:"invalid_logic",feedback:"Let's check the implication you used.",question:"Does that conclusion follow from every given condition?"}));
    const result = await answer(session);
    expect(result.nextPrompt).toBe("Does that conclusion follow from every given condition?");
    expect(result.session.currentPhase).toBe(session.currentPhase);
    expect(result.diagnosis.category).toBe("invalid_logic");
  });

  it("keeps an incomplete answer in its stage until mastery is demonstrated", async () => {
    let {session} = await start();
    generate.mockResolvedValue(response({accepted:false,category:"skipped_reasoning"}));
    ({session} = await answer(session));
    expect(session.currentPhase).toBe("problem_understanding");
    expect(session.stageProgress.problem_understanding.status).toBe("active");
    generate.mockResolvedValue(response({accepted:true}));
    ({session} = await answer(session));
    expect(session.currentPhase).toBe("method_selection");
    expect(session.stageProgress.problem_understanding.status).toBe("completed");
    expect(session.gates.problem_understanding.attemptCount).toBe(2);
  });

  it("advances an existing partially completed stage without repeating accepted criteria", async () => {
    const {session} = await start();
    const stored = (await db.get(`sessions/${session.id}`)).data;
    const earlier = {phase:"method_selection",status:"accepted",attemptCount:1,correctiveCycleCount:0};
    db.put(`sessions/${session.id}`, {...stored,currentPhase:"formula_theorem_justification",gateStates:{...stored.gateStates,method_selection:earlier},gateEvaluations:{method_selection:earlier}});
    generate.mockResolvedValue(response({accepted:true}));
    const result = await answer({...session,currentPhase:"formula_theorem_justification"});
    expect(result.session.currentPhase).toBe("guided_computation_or_proof");
    expect(result.session.gates.method_selection).toEqual(earlier);
    expect(result.session.gates.formula_theorem_justification.status).toBe("accepted");
    const context = educationalContext(generate.mock.calls.at(-1)![0]);
    expect(context.currentStageCriteria).toEqual(["method_selection","formula_theorem_justification"]);
    expect(context.nextStage).toBe("computation");
    expect(context.nextPhase).toBe("guided_computation_or_proof");
  });

  it("recovers only the authenticated user's exact saved operation without generating again", async () => {
    const input = { mode: "curated", topicId: "quantitative-methods-descriptive-statistics", requestId: crypto.randomUUID() };
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
    const failure=await disabled.operation("startLearningSession",{mode:"curated",topicId:"quantitative-methods-descriptive-statistics",requestId:crypto.randomUUID()}).catch(error=>error);
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
    expect(result.session.currentPhase).toBe("method_selection");expect(result.session.gates.problem_understanding.status).toBe("accepted");expect(result.session.gates.relevant_information_identification.status).toBe("accepted");expect(result.session.responseCount).toBe(1);expect(result.session.releasedSolution).toBeNull();
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
    const limited=new LearningService(db,{generate} as Tutor,{...env,GEMINI_RPM:"1"},"alice");const result=await limited.operation("startLearningSession",{mode:"curated",topicId:"quantitative-methods-descriptive-statistics",requestId:crypto.randomUUID()});
    await expect(limited.operation("evaluatePhaseResponse",{sessionId:result.session.id,expectedPhase:result.session.currentPhase,revision:result.session.revision,response:{plainText:"Find the requested average"},requestId:crypto.randomUUID()})).rejects.toThrow("free AI allowance");expect(generate).toHaveBeenCalledTimes(1);
  });
  it("asks for clarification on low confidence without falsely diagnosing a misconception",async()=>{
    let {session}=await start();generate.mockResolvedValue(response({accepted:true,confidence:"low",category:"wrong_formula",question:"Move on to the next stage.",incorrectStep:"A guessed error",explanation:"Your formula is definitely wrong.",recommendedAction:"Replace the formula immediately."}));
    const result = await answer(session);
    expect(result.session.currentPhase).toBe(session.currentPhase);
    expect(result.evaluation.status).toBe("needs_revision");
    expect(result.diagnosis.category).toBe("none");
    expect(result.diagnosis.incorrectStep).toBeNull();
    expect(result.diagnosis.recommendedAction).not.toContain("Replace the formula");
    expect(result.session.diagnosisSummary).toEqual([]);
    expect(result.tutorMessage.text).toContain("understand your reasoning more clearly");
    expect(result.tutorMessage.text).not.toContain("Move on");
    session = result.session;
    generate.mockResolvedValue(response({leaksSolution:true}));await expect(answer(session)).rejects.toThrow("revision");
    expect((await db.get(`sessions/${session.id}`)).data.revision).toBe(session.revision);
  });
  it("does not unlock a solution before all reasoning",async()=>{
    const {session}=await start();await expect(service.operation("finalizeScorecard",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()})).rejects.toThrow("all reasoning");
  });
  it("corrects conflicting mathematical acceptance conversationally and rejects ownership changes",async()=>{
    const {session}=await start();const stored=(await db.get(`sessions/${session.id}`)).data;
    db.put(`sessions/${session.id}`,{...stored,currentPhase:"guided_computation_or_proof"});generate.mockResolvedValue(response({accepted:true}));
    const result = await service.operation("evaluatePhaseResponse",{sessionId:session.id,expectedPhase:"guided_computation_or_proof",revision:session.revision,response:{plainText:"9"},requestId:crypto.randomUUID()});
    expect(result.session.currentPhase).toBe("guided_computation_or_proof");
    expect(result.diagnosis).toMatchObject({category:"computational_error",resolutionStatus:"open",source:"hybrid"});
    expect(result.tutorMessage.text).toContain("one operation at a time");
    expect(result.tutorMessage.text).not.toContain("8");
    db.put(`sessions/${session.id}`,{...stored,studentId:"bob"});await expect(answer(session)).rejects.toThrow("unavailable");
  });
  it("scores four criteria, unlocks after scoring, and submits exactly once",async()=>{
    let {session}=await start();const stored=(await db.get(`sessions/${session.id}`)).data;
    const gates=Object.fromEntries(REASONING_PHASES.map(p=>[p,{status:"accepted",attemptCount:1,correctiveCycleCount:0}]));
    db.put(`sessions/${session.id}`,{...stored,currentPhase:"controlled_solution_release",gateStates:gates,draft:{answer:{plainText:"8"},methodology:"Sum and divide",reflection:"Average value"}});
    db.put(`sessions/${session.id}/messages/method_student`,{id:"method_student",role:"student",phase:"method_selection",text:"Sum and divide by the number of equally weighted observations.",createdAt:new Date()});
    for (const [id,phase,text] of [["method_student","method_selection","Sum and divide because observations have equal weight."],["computation_student","guided_computation_or_proof","(4+8+12)/3=8"],["interpretation_student","result_interpretation","The average value is 8 per observation."]]) {
      db.put(`sessions/${session.id}/messages/${id}`,{id,role:"student",phase,text,createdAt:new Date()});
      db.put(`sessions/${session.id}/responses/${id.replace(/_student$/,"")}`,{phase,response:{plainText:text},evaluation:{status:"accepted"},createdAt:new Date()});
    }
    const criterion={score:20,evidence:["Student response: sum and divide"],evidenceIds:["method_student","computation_student","interpretation_student"],reason:"Appropriate method",improvementAdvice:"Explain the equal weights",confidence:"high"};
    const score={accuracy:criterion,logicalValidity:criterion,methodSelection:criterion,explanationQuality:criterion,feedback:"Strong method; explain the conditions.",solution:{method:"Mean",justification:"Equal-weight observations",steps:["Add and divide by three"],answer:"8",verification:"Recompute the total",interpretation:"Average value is 8"}} as Score;
    generate.mockResolvedValue(score);const finished=await service.operation("finalizeScorecard",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()});session=finished.session;
    expect(session.scorecard.total).toBe(80);expect(session.releasedSolution.answer).toBe("8");
    const input={sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()};await service.operation("submitLearningSession",input);await service.operation("submitLearningSession",input);
    expect((await db.get("learning_progress/alice")).data.sessionsCompleted).toBe(1);
  });
  it("completes four stages and reveals from the conversation without a final draft",async()=>{
    let {session}=await start();
    generate.mockResolvedValue(response({intent:"help"}));
    ({session}=await service.operation("requestSessionSupport",{sessionId:session.id,revision:session.revision,requestedLevel:"socratic_prompt",requestId:crypto.randomUUID()}));
    generate.mockResolvedValue(response({accepted:true}));
    for (const phase of ["problem_understanding", "method_selection", "guided_computation_or_proof", "result_interpretation"]) {
      expect(session.currentPhase).toBe(phase);
      ({session}=await service.operation("evaluatePhaseResponse",{sessionId:session.id,revision:session.revision,expectedPhase:phase,response:{plainText:phase==="guided_computation_or_proof"?"(4+8+12)/3 = 8":"The observations have equal weight; sum them and divide by their count."},requestId:crypto.randomUUID()}));
    }
    expect(session.responseCount).toBe(4);
    for (const phase of REASONING_PHASES) expect(session.gates[phase].status).toBe("accepted");
    expect((await db.get(`sessions/${session.id}`)).data.draft).toBeNull();
    const learnerMessages = (await db.query(`sessions/${session.id}/messages`)).filter(m=>m.data.role === "student");
    const criterion={score:20,evidence:["Saved learner reasoning"],evidenceIds:learnerMessages.map(m=>m.data.id),reason:"Appropriate method",improvementAdvice:"State the units",confidence:"high"};
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
    expect((await db.get("learning_progress/alice/assignment_state/quantitative-methods-descriptive-statistics")).data.activeSessionId).toBeNull();
  });
});

describe("core feature completion regressions",()=>{
  it("does not promote an exhausted Basic bank or consume AI quota",async()=>{
    db.put("sessions/attempted",{studentId:"alice",topicId:"quantitative-methods-descriptive-statistics",problemId:"problem",responseCount:1,status:"abandoned"});
    db.put("problems/harder",{...(await db.get("problems/problem")).data,difficulty:"Intermediate"});
    await expect(start()).rejects.toMatchObject({code:"question-bank-exhausted"});
    expect(generate).not.toHaveBeenCalled();
    expect((await db.get("ai_usage/shared")).data).toBeNull();
  });
  it("selects another eligible same-level question",async()=>{
    db.put("sessions/attempted",{studentId:"alice",topicId:"quantitative-methods-descriptive-statistics",problemId:"problem",responseCount:1});
    db.put("problems/second",{...(await db.get("problems/problem")).data,validationRecordId:"second-approval"});
    db.put("content_validation_records/second-approval",{decision:"approved",problemId:"second",problemVersion:1});
    db.put("problem_scoring/second",{...baseReference,validationRecordId:"second-approval"});
    expect((await start()).session.problemId).toBe("second");
  });
  it("does not accept a final answer alone even when the provider says accepted",async()=>{
    const {session}=await start();
    db.put(`sessions/${session.id}`,{...(await db.get(`sessions/${session.id}`)).data,currentPhase:"guided_computation_or_proof"});
    generate.mockResolvedValue(response({accepted:true}));
    const result=await service.operation("evaluatePhaseResponse",{sessionId:session.id,revision:session.revision,expectedPhase:"guided_computation_or_proof",response:{plainText:"8"},requestId:crypto.randomUUID()});
    expect(result.session.currentPhase).toBe("guided_computation_or_proof");
    expect(result.diagnosis.category).toBe("skipped_reasoning");
    expect(result.session.releasedSolution).toBeNull();
  });
  it("overrides generic AI diagnosis for the exact QM-07-B01 signed-square failure",async()=>{
    db.put("problems/problem",{...(await db.get("problems/problem")).data,problemText:"Let f(x)=x². Find its image and preimage."});
    db.put("problem_scoring/problem",{...baseReference,answerSpecification:{kind:"proof",conclusion:"Image and preimage",requirements:["Check each mapping"]}});
    const {session}=await start();
    db.put(`sessions/${session.id}`,{...(await db.get(`sessions/${session.id}`)).data,currentPhase:"guided_computation_or_proof"});
    generate.mockResolvedValue(response({confidence:"low"}));
    const requestId=crypto.randomUUID();
    const result=await service.operation("evaluatePhaseResponse",{sessionId:session.id,revision:session.revision,expectedPhase:"guided_computation_or_proof",response:{plainText:"f(-2)=-4 and f(-1)=-1"},requestId});
    expect(result.diagnosis).toMatchObject({category:"computational_error",incorrectStep:"f(-2)=-4",confidence:"high",source:"hybrid"});
    expect(result.nextPrompt).toContain("two identical factors");
    expect((await db.get(`sessions/${session.id}/responses/${requestId}`)).data.diagnosis).toEqual(result.diagnosis);
  });
  it.each(["wrong_formula","procedural_error","invalid_logic","skipped_reasoning","weak_justification","incorrect_interpretation","theorem_condition_violation","unrecognized_alternative"] as const)("persists structured %s without advancing",async category=>{
    const {session}=await start();
    generate.mockResolvedValue(response({category,incorrectStep:"My stated method applies here.",explanation:"The applicability condition has not been established.",recommendedAction:"State the condition and connect it to a given."}));
    const result=await answer(session);
    expect(result.diagnosis).toMatchObject({category,incorrectStep:"My stated method applies here.",recommendedAction:"State the condition and connect it to a given."});
    expect(result.diagnosis.explanation).toBeTruthy();
    expect(result.session.currentPhase).toBe(session.currentPhase);
    if(category==="unrecognized_alternative") expect(result.session.diagnosisSummary).not.toContain(category);
  });
  it("rejects release from another learner and smuggled client completion flags",async()=>{
    const {session}=await start();
    const release={sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID(),gateStates:Object.fromEntries(REASONING_PHASES.map(p=>[p,{status:"accepted"}])),scorecard:{total:100}};
    await expect(service.operation("finalizeScorecard",release)).rejects.toThrow("all reasoning");
    db.put(`sessions/${session.id}`,{...(await db.get(`sessions/${session.id}`)).data,studentId:"bob"});
    await expect(service.operation("requestSessionSupport",{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID(),requestedLevel:"full_solution"})).rejects.toMatchObject({status:403});
    expect(generate).toHaveBeenCalledOnce();
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
  const history=(score:number,support=false,difficulty="Basic")=>Array.from({length:3},(_,i)=>({id:`s${i}`,problemId:`q${i}`,difficulty,status:"submitted",workflowVersion:6,statsCommittedAt:new Date(),submittedAt:new Date(i),scorecard:{criteria:Object.fromEntries(["accuracy","logicalValidity","methodSelection","explanationQuality"].map(k=>[k,{score}]))},supportHistory:support?[{level:"partial_step"}]:[]}));
  it("uses reasoning and assistance, not only answer accuracy",()=>{
    expect(recommendation("Basic",history(22)).recommendedDifficulty).toBe("Intermediate");expect(recommendation("Basic",history(22,true)).recommendedDifficulty).toBe("Basic");expect(recommendation("Intermediate",history(10,false,"Intermediate")).recommendedDifficulty).toBe("Basic");
    expect(recommendation("Basic",history(22).slice(0,2)).recommendedDifficulty).toBe("Basic");
  });
  it("excludes incomplete histories and clamps both recommendation boundaries",()=>{
    const incomplete = history(25).map(session=>({...session,statsCommittedAt:null}));
    expect(recommendation("Basic",[...history(22).slice(0,2),...incomplete]).confidence).toBe("low");
    expect(recommendation("Advanced",history(25,false,"Advanced")).recommendedDifficulty).toBe("Advanced");
    expect(recommendation("Basic",history(5)).recommendedDifficulty).toBe("Basic");
  });
  it.each([
    { score:22, current:"Basic", decision:"advance", next:"Intermediate", question:"QM-08-I01" },
    { score:18, current:"Intermediate", decision:"maintain_mixed_evidence", next:"Intermediate", question:"QM-08-I01" },
    { score:10, current:"Intermediate", decision:"remediation", next:"Basic", question:"QM-08-B01" },
  ])("assigns $question through session start after $decision", async ({ score, current, decision, next, question }) => {
    const topicId = "quantitative-methods-descriptive-statistics";
    const source = await readFile("scripts/data/E_MINDGUIDE_Problem_Bank.json");
    const approval = JSON.parse(await readFile("docs/QUESTION_BANK_APPROVAL_2026-10-25.json", "utf8"));
    const sourceHash = createHash("sha256").update(source).digest("hex");
    expect(sourceHash).toBe(approval.sourceFileHash);
    const records = (await prepareQuestionBank(JSON.parse(source.toString()))).filter(r => r.problem.topicId === topicId);
    const originals = await questionBankDocuments(records, sourceHash, approval);
    db.put("problems/problem", { ...(await db.get("problems/problem")).data, status:"draft" });
    for (const [path, fields] of originals) db.put(path, fields);

    const attempts = history(score, false, current);
    for (const attempt of attempts) db.put(`sessions/${attempt.id}`, { ...attempt, studentId:"alice", topicId });
    const { session } = await start();
    expect(session).toMatchObject({ topicId, difficulty:next, problemId:question });
    const saved = (await db.get(`sessions/${session.id}`)).data;
    expect(saved.adaptiveRecommendation).toMatchObject({
      decision, recommendedDifficulty:next,
      evidence:{ topicId, currentDifficulty:current, completedSessions:3, sessionIds:["s2", "s1", "s0"] },
    });
    expect(saved.originalQuestion).toBe(originals.get(`problems/${question}`)?.problemText);
  });
  it("fails safely before using provider capacity when approved content is absent", async () => {
    db.put("problems/problem",{...(await db.get("problems/problem")).data,status:"draft"});
    await expect(start()).rejects.toThrow("No unanswered, approved question");
    expect(generate).not.toHaveBeenCalled();
    expect(await db.query("sessions")).toHaveLength(0);
  });
  it("does not send account identity or secrets as educational context",()=>{
    const context=educationalContext({session:{studentId:"secret-uid",studentName:"Private Name",email:"email@private.invalid",currentPhase:"method_selection"},reference:{apiKey:"secret-api"},messages:[],intent:"question"});
    expect(JSON.stringify(context)).not.toMatch(/secret-uid|Private Name|private.invalid|secret-api/);
  });
  it("rejects malformed or truncated Gemini output",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:'{"accepted":'}]}}]})));
    try {await expect(new GeminiTutor(env).generate({session:{},reference:{},messages:[],intent:"opening"})).rejects.toThrow("incomplete");} finally {vi.unstubAllGlobals();}
  });
  it.each([
    [404, "ai-model-unavailable", 503],
    [429, "ai-quota", 429],
  ])("distinguishes provider status %s without retrying or exposing provider details",async(status,code,expectedStatus)=>{
    const fetchMock=vi.fn().mockResolvedValue(Response.json({error:{status:"NOT_FOUND",message:"private-provider-detail"}},{status}));
    vi.stubGlobal("fetch",fetchMock);
    try {
      const error=await new GeminiTutor(env).generate({session:{},reference:{},messages:[],intent:"opening"}).catch(error=>error);
      expect(error).toMatchObject({code,status:expectedStatus});
      expect(error.message).not.toContain("private-provider-detail");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {vi.unstubAllGlobals();}
  });
});

describe('custom problem secure integration', () => {
  const input = (question = 'sample variance: 2, 4, 6') => ({ mode:'free_form', topicId:'quantitative-methods-descriptive-statistics', question, requestedDifficulty:'Basic', requestId:crypto.randomUUID() });
  it('computes a private reference and preserves the Socratic gates', async () => {
    const request = input();
    const preview = await service.operation('previewVerifiedProblem', request);
    expect(preview).not.toHaveProperty('givens');
    expect(preview).not.toHaveProperty('finalAnswer');
    expect(preview.confirmationHash).toHaveLength(43);
    const {session} = await service.operation('startLearningSession', {...request,...preview,referenceAnswer:'999',answerSpecification:{kind:'number',value:999}});
    expect((await db.get(`sessions/${session.id}/private/reference`)).data.finalAnswer).toBe('4');
    expect(session).not.toHaveProperty('answerSpecification');
    expect(session.releasedSolution).toBeNull();
    expect(session.currentPhase).toBe('problem_understanding');
    expect(generate.mock.calls[0][0].reference.finalAnswer).toBe('4');
    expect(generate.mock.calls[0][0].reference.answerSpecification).toMatchObject({kind:'number',value:4});
    await expect(service.operation('finalizeScorecard',{sessionId:session.id,revision:session.revision,requestId:crypto.randomUUID()})).rejects.toThrow();
  });
  it.each(['mean: 2, garbage', 'Given f(x) = x+1, find f(2).', 'variance: 2, 4'])('rejects %s without writes', async question => {
    await expect(service.operation('previewVerifiedProblem',input(question))).rejects.toMatchObject({status:422});
    await expect(service.operation('startLearningSession',{...input(question),confirmationHash:'invented'})).rejects.toMatchObject({status:422});
    expect(await db.query('sessions')).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([{question:'mean: 2, 3'}, {requestedDifficulty:'Advanced'}, {questionLatex:'2, 8'}])('rejects changed confirmed inputs %j', async change => {
    const request = input('mean: [math]'); request.question = 'mean: [math]';
    const full = {...request,questionLatex:'2, 4'};
    const preview = await service.operation('previewVerifiedProblem',full);
    await expect(service.operation('startLearningSession',{...full,...preview,...change})).rejects.toMatchObject({status:422});
    expect(await db.query('sessions')).toHaveLength(0);
  });
  it('preserves both original forms and expands notation for the tutor', async () => {
    const request = {...input('mean: [math]'),questionLatex:'2, 4'};
    const preview = await service.operation('previewVerifiedProblem',request);
    const {session} = await service.operation('startLearningSession',{...request,...preview});
    expect(session.originalQuestion).toBe('mean: 2, 4');
    expect(session.originalProblemText).toBe('mean: [math]');
    expect(session.originalProblemLatex).toBe('2, 4');
    expect((await db.get(`sessions/${session.id}/private/reference`)).data.finalAnswer).toBe('3');
  });
  it('blocks a leaking custom opening without releasing a solution', async () => {
    const request=input(); const preview=await service.operation('previewVerifiedProblem',request);
    generate.mockResolvedValue(response({feedback:'The final answer is 4.'}));
    await expect(service.operation('startLearningSession',{...request,...preview})).rejects.toMatchObject({status:503});
    const sessions=await db.query('sessions');
    expect(sessions[0].data.releasedSolution).toBeNull();
    expect(sessions[0].data.gateStates.problem_understanding.status).not.toBe('accepted');
    expect(await db.query(`${sessions[0].path}/messages`)).toHaveLength(0);
  });
  it('resumes identical custom work but refuses to silently substitute a different active problem', async () => {
    const request=input(); const preview=await service.operation('previewVerifiedProblem',request);
    const first=await service.operation('startLearningSession',{...request,...preview});
    const retry=await service.operation('startLearningSession',{...request,...preview,requestId:crypto.randomUUID()});
    expect(retry.session.id).toBe(first.session.id);
    const changed=input('mean: 2, 4, 6');
    const confirmed=await service.operation('previewVerifiedProblem',changed);
    await expect(service.operation('startLearningSession',{...changed,...confirmed})).rejects.toMatchObject({status:409});
    expect(await db.query('sessions')).toHaveLength(1);
    expect(generate).toHaveBeenCalledOnce();
  });
  it('does not bypass validation when another assignment is active', async () => {
    await start();
    await expect(service.operation('startLearningSession',{...input('mean: invalid'),confirmationHash:'old'})).rejects.toMatchObject({status:422});
    expect(await db.query('sessions')).toHaveLength(1);
  });
  it('rejects malformed preview contracts and unapproved subjects', async () => {
    await expect(service.operation('previewVerifiedProblem',{...input(),question:'x'.repeat(2001)})).rejects.toMatchObject({status:400});
    db.put('subjects/quantitative-methods',{status:'draft'});
    await expect(service.operation('previewVerifiedProblem',input())).rejects.toThrow('subject');
  });
});
