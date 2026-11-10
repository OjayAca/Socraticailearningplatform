import { studentOperationResult } from "../../src/lib/learning/student-response";
import { containsExcludedContent, isValidatedTopic } from "../../src/data/validated-curriculum";
import "server-only";
import { REASONING_PHASES, SCHEMA_VERSION, SOLVER_STAGES, SOLVER_STAGE_PHASES, solverStageForPhase } from "../../packages/contracts/src/index";
import { ProblemInputError, solveVerifiedProblem, verifiedConfirmation } from "../../src/lib/learning/verified-problems";
import { validateOperation } from "../../src/lib/learning/validation";
import { contentHash } from "../../src/lib/learning/content-hash";
import { diagnoseArithmetic, isBareAnswer } from "../mathematical-diagnosis";
import { SCORECARD_RUBRIC } from "../scorecard-rubric";
import { reserveTutorQuota } from "../tutor-quota";
import { nextLearningProgress } from "../../src/lib/learning/session-state";
import { AI_WORKFLOW_VERSION, PROMPT_VERSION, RUBRIC_VERSION, allowedSupport, checkMath, correctiveTurn, exposesAnswer, initialGates, projection, recommendation, scoreSchema, stageQuestions, stageSupport, turnSchema, type Score, type Tutor, type TutorContext, type Turn } from "../gemini";
import { digest, ensure, ServiceError, type Env, type RecordDoc, type Store } from "../platform";

const idOf = (doc: RecordDoc) => doc.path.split("/").at(-1)!;
const empty = (path: string): RecordDoc => ({ path, data: null });
const completed = (s: any) => REASONING_PHASES.every(p=>s.gateStates[p]?.status === "accepted");
const mutationNames = new Set(["startLearningSession", "createFollowUpSession", "evaluatePhaseResponse", "requestSessionSupport", "finalizeScorecard", "submitLearningSession", "abandonLearningSession", "saveSessionDraft", "resumeTutorOpening"]);
const stamp = () => new Date();
export class LearningService {
  constructor(private db: Store, private tutor: Tutor, private env: Env, private uid: string) {}
  private verify(input: any) {
    try { return verifiedConfirmation(input.question, input.topicId, input.questionLatex, input.requestedDifficulty); }
    catch (error) { if (error instanceof ProblemInputError) throw new ServiceError(422, 'invalid-problem', error.message); throw error; }
  }
  private async member() {
    const profile = await this.db.get(`users/${this.uid}`);
    ensure(profile.data?.status === "active", "Your account is not active.", 403);
    const privacy = await this.db.get("system_settings/privacy");
    const version = privacy.data?.currentConsentVersion;
    ensure(typeof version === "string" && !version.includes("/"), "The learning privacy notice is not configured.", 503);
    const [policy, consent] = await Promise.all([this.db.get(`policy_documents/${version}`), this.db.get(`users/${this.uid}/consents/${version}`)]);
    ensure(policy.data?.status === "active" && policy.data?.aiProcessingVersion === "gemini-free-v1", "The administrator must publish the Gemini learning privacy notice before AI sessions begin.", 503);
    ensure(consent.data?.version === version, "Read and acknowledge the current learning privacy notice before continuing.", 403);
    const pilot = await this.db.get("system_settings/pilot");
    ensure(pilot.data?.state !== "write-freeze", "Learning is temporarily paused by your administrator. Your saved work remains available.", 503);
    const roster = await this.db.get(`pilot_roster/${this.uid}`);
    ensure(roster.data?.status === "admitted", "Your account is not currently admitted to AI practice.", 403);
    return profile.data;
  }
  private async session(id: string) {
    ensure(typeof id === "string" && /^[\w:-]{1,180}$/.test(id), "Invalid session identifier.");
    const doc = await this.db.get(`sessions/${id}`);
    ensure(doc.data?.studentId === this.uid, "This learning session is unavailable.", 403);
    ensure(doc.data.workflowVersion === AI_WORKFLOW_VERSION, "This historical session is read-only. Start a new AI session.", 409);
    return doc;
  }
  private async assertPilot(topicId: string, mode: string) {
    const [pilot, roster] = await Promise.all([this.db.get("system_settings/pilot"), this.db.get(`pilot_roster/${this.uid}`)]);
    const blockers: string[] = [];
    if (pilot.data?.state !== "open") blockers.push("new sessions are paused in the pilot settings");
    if (roster.data?.status !== "admitted") blockers.push("your account needs pilot admission");
    if (!pilot.data?.enabledTopicIds?.includes(topicId)) blockers.push("the selected topic is not enabled for the pilot");
    const backendDisabled = this.env.AI_ENABLED !== "true" || this.env.AI_FREE_TIER_CONFIRMED !== "true";
    if (backendDisabled) {
      blockers.push("the AI service is disabled pending successful connection and free-tier checks");
      if (mode === "curated") {
        const problems = await this.db.query("problems", "topicId", topicId);
        if (!problems.some(problem => problem.data.status === "approved")) blockers.push("this topic has no approved prepared questions");
      }
    }
    if (blockers.length) throw new ServiceError(backendDisabled ? 503 : 403, "practice-not-ready", `AI practice is not ready: ${blockers.join("; ")}. Your saved work is unchanged.`);
  }
  async operation(name: string, raw: any): Promise<any> {
    if (name === "getLearningOperationResult") {
      await this.member();
      let original: any;
      try { original = validateOperation(raw?.operation, raw?.input); }
      catch { throw new ServiceError(400, "invalid-request", "Invalid recovery request."); }
      ensure(mutationNames.has(raw.operation) && typeof original.requestId === "string", "Invalid recovery request.");
      const saved = await this.db.get(`ai_operations/${this.uid}_${original.requestId}`);
      if (!saved.data) return { status: "missing" };
      ensure(saved.data.fingerprint === await digest({ name: raw.operation, input: original }), "This request does not match the saved operation.", 409);
      return saved.data.status === "complete"
        ? { status: "complete", result: studentOperationResult(saved.data.result) }
        : { status: saved.data.status === "pending" && saved.data.expiresAt > Date.now() ? "pending" : "retryable" };
    }
    let input: any;
    try { input = validateOperation(name, raw); } catch { throw new ServiceError(400,"invalid-request","Check the request fields and try again."); }
    const profile = await this.member();
    if (name === "previewVerifiedProblem") {
      const topic = await this.db.get(`topics/${input.topicId}`);
      ensure(isValidatedTopic(input.topicId, topic.data) && topic.data?.status === "approved", "This topic is unavailable.");
      const subject = await this.db.get(`subjects/${topic.data.subjectId}`);
      ensure(subject.data?.status === "approved", "This subject is unavailable.");
      const result = this.verify(input);
      return { confirmationHash: await digest(result.confirmationHash), description: result.description };
    }
    if (name === "checkLearningSessionActivity") {
      const doc = await this.session(input.sessionId);
      if (["in_progress", "ready_for_submission"].includes(doc.data.status)) {
        const privacy = await this.db.get("system_settings/privacy");
        const hours = Number(privacy.data?.sessionInactivityHours ?? 24);
        if (Date.now()-new Date(doc.data.lastActivityAt).getTime() > hours*3600000) {
          const state = await this.db.get(`learning_progress/${this.uid}/assignment_state/${doc.data.topicId}`);
          await this.db.commit([{doc, data:{...doc.data,status:"expired",revision:doc.data.revision+1,updatedAt:stamp()}}, ...(state.data?.activeSessionId === input.sessionId ? [{doc:state,data:{...state.data,activeSessionId:null}}] : [])]);
        }
      }
      return {};
    }
    ensure(mutationNames.has(name), "Unsupported AI learning operation.");
    ensure(typeof input.requestId === "string", "Missing request identifier.");
    const fingerprint = await digest({name,input});
    let op = await this.db.get(`ai_operations/${this.uid}_${input.requestId}`);
    if (op.data) {
      ensure(op.data.fingerprint === fingerprint, "This request identifier belongs to different work.", 409);
      if (op.data.status === "complete") return studentOperationResult(op.data.result);
      ensure(op.data.expiresAt < Date.now(), "Your previous request is still processing. Retry shortly.", 409);
    }
    let session: RecordDoc;
    let reference: any;
    let assignment: RecordDoc | undefined;
    let parentSession: RecordDoc | undefined;
    let starting = name === "startLearningSession" || name === "createFollowUpSession";
    if (starting) {
      if (name === "createFollowUpSession") {
        ensure(/^[\w:-]{1,180}$/.test(input.sessionId), "Invalid session identifier.");
        const parent = await this.db.get(`sessions/${input.sessionId}`);
        ensure(parent.data?.studentId === this.uid,"This learning session is unavailable.",403);
        ensure(parent.data.statsCommittedAt, "Submit the session before starting a follow-up.");
        if (parent.data.followUpSessionId) {
          const existing = await this.session(parent.data.followUpSessionId);
          return {session:projection(idOf(existing),existing.data)};
        }
        parentSession = parent;
        input.topicId = parent.data.topicId; input.mode = "curated";
      }
      ensure(/^[\w -]{1,160}$/.test(input.topicId), "Invalid topic identifier.");
      await this.assertPilot(input.topicId, input.mode);
      const customPrepared = input.mode === "free_form" ? await this.prepare(input, profile) : undefined;
      assignment = await this.db.get(`learning_progress/${this.uid}/assignment_state/${input.topicId}`);
      if (assignment.data?.activeSessionId) {
        const existing = await this.db.get(`sessions/${assignment.data.activeSessionId}`);
        if (existing.data?.workflowVersion === AI_WORKFLOW_VERSION && ["in_progress","ready_for_submission"].includes(existing.data.status)) {
          ensure(existing.data.studentId === this.uid, "This learning session is unavailable.", 403);
          if (input.mode === "free_form") {
            ensure(existing.data.problemMode === "free_form"
              && (existing.data.originalProblemText ?? existing.data.originalQuestion) === input.question
              && (existing.data.originalProblemLatex ?? "") === (input.questionLatex ?? "")
              && existing.data.difficulty === input.requestedDifficulty,
            "A different problem is already active for this topic. Finish or abandon that session before starting this problem.", 409);
          }
          if (!existing.data.needsOpening) return {session:projection(idOf(existing),existing.data)};
          session = existing;
          reference = (await this.db.get(`${session.path}/private/reference`)).data;
          starting = false;
        }
      }
      if (!session!) {
        const prepared = customPrepared ?? await this.prepare(input, profile);
        reference = prepared.reference;
        session = empty(`sessions/${this.uid}_${input.requestId}`);
        session.data = prepared.session;
      }
    } else {
      session = await this.session(input.sessionId);
      ensure(["in_progress","ready_for_submission"].includes(session.data.status), "This session is read-only.", 409);
      if (input.revision !== undefined) ensure(input.revision === session.data.revision, "This session changed. Reload before continuing.", 409);
      reference = (await this.db.get(`${session.path}/private/reference`)).data;
    }
    const s = session!.data;
    const aiCall = ["startLearningSession","createFollowUpSession","evaluatePhaseResponse","requestSessionSupport","finalizeScorecard","resumeTutorOpening"].includes(name);
    if (name === "resumeTutorOpening") ensure(s.needsOpening, "The tutor has already started. Reload the session.", 409);
    if (aiCall) {
      ensure(this.env.AI_ENABLED === "true" && this.env.AI_FREE_TIER_CONFIRMED === "true", "AI practice is not enabled yet. Free-tier setup must be verified first.", 503);
      ensure(reference, "Approved learning references are unavailable.", 503);
    }
    if (name === "evaluatePhaseResponse") {
      ensure(!s.needsOpening && REASONING_PHASES.includes(s.currentPhase) && input.expectedPhase === s.currentPhase, "Continue from the current reasoning step.", 409);
      ensure(input.response.plainText.trim() || input.response.latex?.trim(), "Enter your reasoning or question.");
    }
    if (name === "requestSessionSupport") ensure(!s.needsOpening && s.allowedSupport.includes(input.requestedLevel), "This support level is not available.");
    if (["saveSessionDraft","finalizeScorecard"].includes(name)) ensure(completed(s) && !s.scorecard, "Complete all reasoning steps before finalizing.");
    if (name === "submitLearningSession") ensure(s.status === "ready_for_submission" && s.scorecard && !s.statsCommittedAt, "Generate your scorecard before submitting.");
    const lock = await this.db.get(`ai_locks/${this.uid}`);
    ensure(!lock.data || lock.data.expiresAt < Date.now(), "Another request is still processing. Retry shortly.", 409);
    const leaseId = crypto.randomUUID();
    // Outlive the route's 120-second budget, including provider retries and commits.
    const expiresAt = Date.now()+150000;
    const reservation: Array<{doc:RecordDoc;data:any}> = [{doc:op,data:{fingerprint,status:"pending",expiresAt,leaseId,sessionId:idOf(session!),createdAt:stamp()}}, {doc:lock,data:{leaseId,expiresAt}}];
    if (aiCall) reservation.push(...await this.reserveQuota());
    if (starting) {
      reservation.push({doc:session!,data:s}, {doc:empty(`${session!.path}/private/reference`),data:reference});
      reservation.push({doc:assignment!,data:{...assignment!.data,activeSessionId:idOf(session!),updatedAt:stamp()}});
      if (parentSession) {
        s.parentSessionId = idOf(parentSession);
        reservation.push({doc:parentSession,data:{...parentSession.data,followUpSessionId:idOf(session!),updatedAt:stamp(),revision:parentSession.data.revision+1}});
      }
    }
    const userMessageId = `${input.requestId}_student`;
    if (name === "evaluatePhaseResponse") {
      const messageDoc = await this.db.get(`${session!.path}/messages/${userMessageId}`);
      if (!messageDoc.data) reservation.push({doc:messageDoc,data:{id:userMessageId,role:"student",phase:s.currentPhase,intent:input.intent ?? "answer",text:[input.response.plainText,input.response.latex].filter(Boolean).join("\n"),createdAt:stamp()}});
    }
    await this.db.commit(reservation);
    try {
      session = await this.db.get(session!.path);
      ensure(session.data?.revision === s.revision, "This session changed while the request was reserved. Reload before continuing.", 409);
      op = await this.db.get(op.path);
      const messages = (await this.db.query(`${session.path}/messages`)).map(d=>d.data).sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
      const assessedResponses = ["finalizeScorecard","evaluatePhaseResponse"].includes(name)
        ? (await this.db.query(`${session.path}/responses`)).map(d=>({messageId:`${idOf(d)}_student`,...d.data})).sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime())
        : [];
      let generated: Turn | Score | undefined;
      if (aiCall) {
        const intent = ["startLearningSession","createFollowUpSession","resumeTutorOpening"].includes(name) ? "opening" : name === "finalizeScorecard" ? "score" : name === "requestSessionSupport" ? "help" : input.intent ?? "answer";
        if (name === "finalizeScorecard") ensure(messages.some(m=>m.role === "student" && m.text?.trim()), "Saved student reasoning is unavailable for assessment. Your progress is preserved; reload saved progress and retry.", 422);
        const context: TutorContext = {session:s,reference,messages,intent,response:input.response,supportLevel:input.requestedLevel ?? (intent === "help" ? s.allowedSupport.at(-1) : undefined),assessedResponses:assessedResponses.map(r=>({messageId:r.messageId,phase:r.phase,response:r.response,status:r.evaluation?.status,evidence:r.evaluation?.evidenceSummary}))};
        generated = await this.tutor.generate(context);
        if (name === "evaluatePhaseResponse" && intent === "answer" && turnSchema.parse(generated).intent !== "answer") {
          // A model intent label must not silently discard submitted reasoning.
          // One independent reassessment, charged to the same shared quota and lease.
          await this.db.commit(await this.reserveQuota());
          generated = await this.tutor.generate({...context, reassessIntent:true});
        }
      }
      const updates: any = {...s,revision:s.revision+1,updatedAt:stamp(),lastActivityAt:stamp()};
      const writes: Array<{doc:RecordDoc;data:any}> = [];
      const extra: any = {};
      if (generated && name !== "finalizeScorecard") {
        let turn = turnSchema.parse(generated);
        if (["startLearningSession", "createFollowUpSession", "resumeTutorOpening"].includes(name)) {
          // Keep the leak guard on the original response, then bound opening dialogue.
          ensure(!exposesAnswer(turn,reference,input.response), "The tutor response needs revision before it can be shown. Your stage is unchanged; retry later.", 503);
          turn = {...turn, feedback:"Let's begin by understanding the problem.", question:stageQuestions.problem_understanding, accepted:false, intent:"question"};
        }
        const answer = name === "evaluatePhaseResponse" && (input.intent ?? "answer") === "answer" && turn.intent === "answer";
        if (answer) ensure(!exposesAnswer(turn,reference,input.response), "The tutor response needs revision before it can be shown. Your stage is unchanged; retry later.", 503);
        const stage = solverStageForPhase(s.currentPhase);
        const arithmetic = stage === "computation" && answer ? diagnoseArithmetic(input.response,s.originalQuestion) : null;
        const math = arithmetic ? "incorrect" : stage === "computation" && answer ? checkMath(input.response,reference.answerSpecification) : "unsupported";
        if (answer && (!turn.accepted || !turn.evidence.some(item=>item.trim()) || math === "incorrect" || turn.confidence !== "high" || turn.category !== "none")) {
          const specificCorrection = !turn.accepted && turn.confidence === "high" && turn.category !== "none" && math !== "incorrect"
            && !/complet|next stage|another problem|success|move on/i.test(turn.question);
          const question = turn.question;
          turn = correctiveTurn(turn, s.currentPhase, math);
          if (specificCorrection) turn.question = question;
        }
        if (arithmetic) turn = {...turn,accepted:false,confidence:"high",category:arithmetic.category,evidence:[arithmetic.incorrectStep],feedback:arithmetic.explanation,question:arithmetic.correctivePrompt,incorrectStep:arithmetic.incorrectStep,explanation:arithmetic.explanation,recommendedAction:arithmetic.recommendedAction};
        if (answer && stage === "computation" && math !== "incorrect" && isBareAnswer(input.response)
          && !assessedResponses.some(r=>solverStageForPhase(r.phase)==="computation" && !isBareAnswer(r.response) && checkMath(r.response,reference.answerSpecification)!=="incorrect")) {
          turn = {...turn,accepted:false,category:"skipped_reasoning",confidence:"high",evidence:["Only a final answer was supplied; no computation or proof steps are recorded for this stage."],
            feedback:"A final answer alone does not show how you obtained it.",question:stageQuestions.computation,
            incorrectStep:input.response.plainText,explanation:"The required computation or logical steps are missing.",recommendedAction:"Show the calculation or proof and explain how you checked it."};
        }
        // Assistance cannot grant acceptance, even if the model sets it accidentally.
        if (!answer) turn = {...turn, accepted:false};
        if (name === "requestSessionSupport" || input.intent === "help") {
          turn = {...turn, ...stageSupport(s.currentPhase, input.requestedLevel ?? s.allowedSupport.at(-1)), accepted:false, leaksSolution:false};
        } else if (name === "evaluatePhaseResponse" && !answer && (input.intent ?? "answer") === "answer") {
          turn = {...correctiveTurn(turn, s.currentPhase, "unsupported"), feedback:"I could not reliably assess that as an answer. Please state your reasoning for this checkpoint, or use the hint action for help."};
        }
        ensure(!exposesAnswer(turn,reference,input.response), "The tutor response needs revision before it can be shown. Your stage is unchanged; retry later.", 503);
        const accepted = answer && turn.accepted && turn.confidence === "high" && turn.category === "none" && math !== "incorrect";
        let text = `${turn.feedback}\n\n${turn.question}`;
        updates.needsOpening = false;
        updates.currentPrompt = turn.question;
        if (answer) {
          const gate = s.gateStates[s.currentPhase];
          const evaluation = {phase:s.currentPhase,status:accepted?"accepted":"needs_revision",attemptCount:gate.attemptCount+1,correctiveCycleCount:gate.correctiveCycleCount+(accepted?0:1),evidenceSummary:turn.evidence.join(" "),confidence:turn.confidence,source:math==="unsupported"?"ai":"hybrid",evaluatedAt:Date.now(),acceptedAt:accepted?Date.now():null};
          const diagnosis = {category:math==="incorrect"?"computational_error":turn.category,evidence:turn.evidence,confidence:turn.confidence,severity:accepted?"minor":"moderate",targetPhase:s.currentPhase,correctivePrompt:turn.question,resolutionStatus:accepted?"resolved":"open",source:evaluation.source,
            incorrectStep:accepted || turn.category === "none" ? null : turn.incorrectStep ?? null,
            explanation:accepted ? "The current stage is supported by the saved learner evidence." : turn.category === "none" ? "More evidence is needed; no specific mistake is confirmed." : turn.explanation ?? turn.evidence.join(" "),
            recommendedAction:accepted ? "Continue to the next reasoning checkpoint." : turn.recommendedAction ?? turn.question};
          updates.gateStates = {...s.gateStates,[s.currentPhase]:{...gate,...evaluation}};
          updates.gateEvaluations = {...s.gateEvaluations,[s.currentPhase]:evaluation};
          updates.responseCount = s.responseCount+1;
          updates.lastDiagnosis = diagnosis;
          updates.diagnosisSummary = [...new Set([...(s.diagnosisSummary ?? []),...(!["none","unrecognized_alternative"].includes(diagnosis.category) ? [diagnosis.category] : [])])];
          if (accepted) {
            turn = {...turn, feedback:"Your reasoning meets the requirements of this checkpoint."};
            // One assessed response can demonstrate all criteria of this stage.
            // Retain internal evidence for reporting without requiring extra turns.
            for (const phase of SOLVER_STAGE_PHASES[stage!]) {
              if (updates.gateStates[phase]?.status === "accepted") continue;
              const previous = s.gateStates[phase];
              const stageEvaluation = {...evaluation,phase,attemptCount:(previous?.attemptCount ?? 0)+1,correctiveCycleCount:previous?.correctiveCycleCount ?? 0};
              updates.gateStates[phase] = {...previous,...stageEvaluation};
              updates.gateEvaluations[phase] = stageEvaluation;
            }
            const nextStage = SOLVER_STAGES[SOLVER_STAGES.indexOf(stage!)+1];
            const next = nextStage ? SOLVER_STAGE_PHASES[nextStage][0] : undefined;
            updates.currentPhase = next ?? "controlled_solution_release";
            if (next) {
              updates.gateStates[next] = {...updates.gateStates[next],status:"pending"};
              updates.currentPrompt = stageQuestions[nextStage!];
            } else updates.currentPrompt = "All four stages are complete. Select View step-by-step solution to see the worked explanation and your scorecard.";
            text = `${turn.feedback}\n\n${updates.currentPrompt}`;
          }
          updates.allowedSupport = allowedSupport(updates.gateStates, s.supportHistory);
          Object.assign(extra,{evaluation,diagnosis,learnerMessage:turn.feedback,nextPrompt:updates.currentPrompt,completion:null});
          writes.push({doc:empty(`${session.path}/responses/${input.requestId}`),data:{phase:s.currentPhase,response:input.response,evaluation,diagnosis,studentId:this.uid,createdAt:stamp()}});
        } else {
          extra.nextPrompt = updates.currentPrompt;
          extra.evaluation = {status:"needs_revision",source:"ai",phase:s.currentPhase,attemptCount:s.gateStates[s.currentPhase]?.attemptCount??0,correctiveCycleCount:s.gateStates[s.currentPhase]?.correctiveCycleCount??0,evidenceSummary:"Clarification or assistance only; no reasoning attempt assessed.",confidence:"high",evaluatedAt:Date.now(),acceptedAt:null};
          extra.diagnosis = null; extra.learnerMessage = turn.feedback; extra.completion = null;
        }
        if (name === "requestSessionSupport" || (name === "evaluatePhaseResponse" && input.intent === "help")) {
          const level = input.requestedLevel ?? (input.intent === "help" ? s.allowedSupport.at(-1) : "socratic_prompt");
          const entry = {phase:s.currentPhase,level,title:"AI reasoning support",content:[text],requestedAt:Date.now()};
          updates.supportHistory = [...s.supportHistory,entry]; updates.supportUsage = s.supportUsage+1;
          updates.allowedSupport = allowedSupport(updates.gateStates, updates.supportHistory);
          Object.assign(extra,entry);
        }
        const message = {id:`${input.requestId}_tutor`,role:"assistant",phase:s.currentPhase,text,createdAt:stamp(),model:this.env.GEMINI_MODEL,promptVersion:PROMPT_VERSION};
        writes.push({doc:empty(`${session.path}/messages/${message.id}`),data:message});
        extra.tutorMessage = {...message,createdAt:message.createdAt.getTime()};
      }
      if (name === "saveSessionDraft") updates.draft = input.draft;
      if (name === "finalizeScorecard") {
        const score = scoreSchema.parse(generated);
        const evidence = new Map<string,string>(messages.filter(m=>m.role==="student" && m.text?.trim()).map(m=>[m.id,m.text]));
        for (const key of ["accuracy","logicalValidity","methodSelection","explanationQuality"] as const) {
          ensure(score[key].evidenceIds.every(id=>evidence.has(id)), "The scorecard could not link feedback to your saved work. Retry later.", 503);
          ensure(score[key].evidenceIds.every(id=>assessedResponses.some(r=>r.messageId===id))
            && score[key].evidenceIds.some(id=>assessedResponses.some(r=>r.messageId===id && r.evaluation?.status === "accepted" && (SCORECARD_RUBRIC[key].phases as readonly string[]).includes(r.phase))),
          "The scorecard needs assessed learner evidence from the relevant reasoning stage for each criterion. Your progress is preserved; retry scoring.", 503);
          score[key].evidence = score[key].evidenceIds.map(id=>`${id}: ${evidence.get(id)!.slice(0,600)}`);
        }
        ensure(Object.values({a:score.accuracy,l:score.logicalValidity,m:score.methodSelection,e:score.explanationQuality}).every(c=>c.confidence !== "low"), "The tutor could not reliably score the saved conversation. Your accepted stages are preserved; retry generating the solution and scorecard.", 422);
        const acceptedComputation = assessedResponses.filter(r=>["guided_computation_or_proof","verification_and_checking"].includes(r.phase) && r.evaluation?.status === "accepted" && evidence.has(r.messageId)).at(-1);
        const math = acceptedComputation?.response ? checkMath(acceptedComputation.response,reference.answerSpecification) : "unsupported";
        if (math === "incorrect") score.accuracy.score = 0;
        if (math !== "unsupported") score.accuracy.evidence.unshift(math === "correct" ? "Final answer verified against the approved mathematical reference." : "Final answer does not match the approved mathematical reference.");
        ensure(checkMath({plainText:score.solution.answer},reference.answerSpecification) !== "incorrect", "The worked explanation failed mathematical verification. Retry later.", 503);
        const criteria = Object.fromEntries((["accuracy","logicalValidity","methodSelection","explanationQuality"] as const).map(category=>[category,{...score[category],category,source:category==="accuracy" && math!=="unsupported"?"hybrid":"ai"}]));
        updates.scorecard = {criteria,total:Object.values(criteria).reduce((n,c)=>n+c.score,0),feedback:score.feedback,rubricVersion:RUBRIC_VERSION,calibrationStatus:"pending",assistanceCount:s.supportUsage,generatedAt:Date.now()};
        updates.releasedSolution = {...score.solution,steps:reference.solutionSteps,answer:reference.finalAnswer,interpretation:reference.interpretation,releasedAt:Date.now()};
        Object.assign(updates,{status:"ready_for_submission",currentPhase:"critical_thinking_scorecard",currentStep:"scorecard",learningCompletedAt:stamp(),allowedSupport:[]});
        writes.push({doc:empty(`${session.path}/scorecards/${input.requestId}`),data:{...updates.scorecard,studentId:this.uid,createdAt:stamp()}});
        updates.solutionUnlock = {eventId:input.requestId,studentId:this.uid,sessionId:idOf(session),problemId:s.problemId,checkpoints:[...REASONING_PHASES],releasedAt:stamp(),policyVersion:"all-reasoning-gates-v1"};
        extra.completion = {scorecard:updates.scorecard,releasedSolution:updates.releasedSolution};
      }
      if (name === "submitLearningSession") {
        const progress = await this.db.get(`learning_progress/${this.uid}`);
        const current = progress.data ?? {};
        const history = (await this.db.query("sessions","studentId",this.uid)).filter(d=>d.path!==session.path).map(d=>({...d.data,id:idOf(d)})).filter(h=>h.topicId===s.topicId);
        const rec = recommendation(s.difficulty,[...history,{...updates,id:idOf(session),status:"submitted",statsCommittedAt:stamp(),submittedAt:stamp()}],s.topicId);
        const now = Date.now();
        const next = nextLearningProgress(this.uid,current,s.scorecard.total,{toDate:()=>new Date(now),toMillis:()=>now},{id:idOf(session),subject:s.subject,topic:s.topic,scorecardSummary:s.scorecard.feedback,scorecardGeneratedAt:s.scorecard.generatedAt,recommendation:rec as any});
        writes.push({doc:progress,data:{...current,...next,topicRecommendations:{...current.topicRecommendations,[s.topic.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")]:rec},updatedAt:stamp()}});
        for (const [key,award] of Object.entries(next.achievements)) {
          if (!award || current.achievements?.[key]) continue;
          const notification = await this.db.get(`notifications/achievement_${this.uid}_${key}`);
          if (!notification.data) writes.push({doc:notification,data:{recipientId:this.uid,eventType:"achievement_awarded",title:award.title,message:award.description,actionUrl:"/student/profile",read:false,createdAt:stamp()}});
        }
        Object.assign(updates,{status:"submitted",currentStep:"confirmation",submittedAt:stamp(),statsCommittedAt:stamp(),difficultyRecommendation:rec,ctScore:s.scorecard.total});
      }
      if (name === "abandonLearningSession") updates.status = "abandoned";
      if (["submitLearningSession","abandonLearningSession"].includes(name)) {
        const state = await this.db.get(`learning_progress/${this.uid}/assignment_state/${s.topicId}`);
        if (state.data?.activeSessionId === idOf(session)) writes.push({doc:state,data:{...state.data,activeSessionId:null,updatedAt:stamp()}});
      }
      const currentLock = await this.db.get(lock.path);
      ensure(currentLock.data?.leaseId === leaseId && currentLock.data.expiresAt > Date.now(), "The request expired safely. Retry it.", 409);
      const result = studentOperationResult({session:projection(idOf(session),updates),...extra});
      writes.push({doc:session,data:updates},{doc:op,data:{...op.data,status:"complete",result,expiresAt:0}},{doc:currentLock,data:{leaseId,expiresAt:0}});
      await this.db.commit(writes);
      return result;
    } catch (error) {
      // A failed model call never changes gates or scores. Persisted student messages are retained.
      try {
        const [failed, activeLock] = await Promise.all([this.db.get(op.path),this.db.get(lock.path)]);
        if (failed.data?.leaseId===leaseId && failed.data.status !== "complete" && activeLock.data?.leaseId===leaseId) await this.db.commit([{doc:failed,data:{...failed.data,status:"retryable",expiresAt:0}},{doc:activeLock,data:{leaseId,expiresAt:0}}]);
      } catch { /* Lease expiry allows recovery without unsafe rollback. */ }
      throw error;
    }
  }
  private async reserveQuota(): Promise<Array<{doc:RecordDoc;data:any}>> {
    return reserveTutorQuota(this.db,this.env);
  }
  private async prepare(input: any, profile: any) {
    const topic = await this.db.get(`topics/${input.topicId}`);
    ensure(isValidatedTopic(input.topicId, topic.data) && topic.data?.status === "approved", "The selected topic is not approved.");
    const subject = await this.db.get(`subjects/${topic.data.subjectId}`);
    ensure(subject.data?.status === "approved", "The selected subject is not approved.");
    const history = (await this.db.query("sessions","studentId",this.uid)).filter(d=>d.data.topicId===input.topicId);
    const sorted = history.map(d=>({...d.data,id:idOf(d)})).filter(s=>s.workflowVersion===AI_WORKFLOW_VERSION && s.status==="submitted" && s.statsCommittedAt && s.scorecard).sort((a,b)=>new Date(b.submittedAt).getTime()-new Date(a.submittedAt).getTime());
    const rec = recommendation(sorted[0]?.difficulty ?? "Basic",sorted,input.topicId);
    let reference: any, problem: RecordDoc | undefined;
    if (input.mode === "curated") {
      const excluded = new Set<string>();
      for (const old of history) {
        const assessed = typeof old.data.responseCount === "number" ? old.data.responseCount > 0 : (await this.db.query(`${old.path}/responses`)).length > 0;
        const attempted = !assessed && (await this.db.query(`${old.path}/messages`)).some(message=>message.data.role==="student" && (message.data.intent ?? "answer")==="answer");
        if (old.data.statsCommittedAt || assessed || attempted) excluded.add(old.data.problemId);
      }
      const candidates = (await this.db.query("problems","topicId",input.topicId)).filter(d=>d.data.status === "approved" && d.data.difficulty === rec.recommendedDifficulty && d.data.validationRecordId && !excluded.has(idOf(d)))
        .sort((a,b)=>idOf(a).localeCompare(idOf(b)));
      for (const candidate of candidates) {
        if (containsExcludedContent([candidate.data.title,candidate.data.problemText])) continue;
        const approval = await this.db.get(`content_validation_records/${candidate.data.validationRecordId}`);
        const ref = await this.db.get(`problem_scoring/${idOf(candidate)}`);
        if (approval.data?.decision !== "approved" || approval.data.problemId !== idOf(candidate) || approval.data.problemVersion !== candidate.data.version || ref.data?.problemVersion !== candidate.data.version || ref.data?.validationRecordId !== candidate.data.validationRecordId) continue;
        if (approval.data.scoringSnapshotHash && await contentHash(ref.data) !== approval.data.scoringSnapshotHash) continue;
        if (!ref.data.expectedConcepts?.length || !ref.data.solutionSteps?.length || !ref.data.finalAnswer || !ref.data.interpretation) continue;
        if (containsExcludedContent(ref.data)) continue;
        problem = candidate; reference = ref.data;
        if (candidate.data.sourceHash) {
          const imported = await this.db.get(`${candidate.path}/private/import_source`);
          const source = imported.data?.source;
          ensure(source && await contentHash(source) === candidate.data.sourceHash && source.problem_id === idOf(candidate), "The approved source reference could not be verified. Ask your administrator to review this question.", 503);
          reference = {...reference,sourceGuidance:{sourceHash:candidate.data.sourceHash,
            assumptions:source.student_facing.given_information_and_assumptions,
            approvedStatements:source.instructor_only.formulas_definitions_theorems,
            alternativeMethods:source.instructor_only.alternative_methods ?? null,
            commonMisconceptions:source.instructor_only.common_errors ?? [],
            stageExpectations:source.instructor_only.socratic_stages,
            expectedReasoning:source.instructor_only.expected_reasoning}};
        }
        break;
      }
      if (!problem || !reference) throw new ServiceError(422, "question-bank-exhausted", `No unanswered, approved question with matching validated references is available at ${rec.recommendedDifficulty}. Your recommended level is unchanged. Review a completed session in Learning History, or retry when your administrator adds validated questions at this level.`);
    } else {
      const verified = this.verify(input);
      ensure(await digest(verified.confirmationHash) === input.confirmationHash, "Confirm your problem givens again before starting.", 422);
      reference = solveVerifiedProblem(verified.givens);
    }
    const now = stamp();
    return {reference,session:{schemaVersion:SCHEMA_VERSION,workflowVersion:AI_WORKFLOW_VERSION,revision:0,scoringSource:"ai_formative",studentId:this.uid,studentName:profile.displayName ?? "Learner",
      subjectId:topic.data.subjectId,topicId:input.topicId,subject:subject.data.name,topic:topic.data.name,difficulty:problem?.data.difficulty ?? input.requestedDifficulty,
      problemId:problem ? idOf(problem) : null,problemMode:input.mode,originalQuestion:problem?.data.problemText ?? (input.questionLatex ? input.question.replace("[math]", () => input.questionLatex) : input.question),
      ...(input.mode === "free_form" ? {originalProblemText:input.question,originalProblemLatex:input.questionLatex ?? ""} : {}),status:"in_progress",currentPhase:REASONING_PHASES[0],currentStep:"questioning",
      currentPrompt:"",needsOpening:true,gateStates:initialGates(),gateEvaluations:{},diagnosisSummary:[],lastDiagnosis:null,allowedSupport:["socratic_prompt"],supportHistory:[],supportUsage:0,responseCount:0,
      draft:null,scorecard:null,releasedSolution:null,adaptiveRecommendation:rec,promptAdjustment:"maintain",configurationVersions:null,model:this.env.GEMINI_MODEL,promptVersion:PROMPT_VERSION,rubricVersion:RUBRIC_VERSION,
      createdAt:now,updatedAt:now,lastActivityAt:now,learningCompletedAt:null,submittedAt:null,statsCommittedAt:null}};
  }
}
