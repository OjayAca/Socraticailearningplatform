import { z } from "zod";
import { REASONING_PHASES, RESPONSE_OUTCOMES, SOLVER_STAGES } from "../../../packages/contracts/src/index";

const str = z.string(), num = z.number(), strings = str.array();
const evaluation = z.object({
  outcome:z.enum(RESPONSE_OUTCOMES),
  phase:str, status:str, attemptCount:num, correctiveCycleCount:num, evidenceSummary:str,
  confidence:str, source:str, evaluatedAt:num, acceptedAt:num.nullable(),
}).partial();
const diagnosis = z.object({
  category:str, evidence:strings, confidence:str, severity:str, targetPhase:str, correctivePrompt:str,
  resolutionStatus:str, source:str, incorrectStep:str.nullable(), explanation:str, recommendedAction:str,
}).partial();
const support = z.object({phase:str, level:str, title:str, content:strings, requestedAt:num}).partial();
const stage = z.object({stage:str, status:str, acceptedGates:num, totalGates:num});
const criterion = z.object({category:str, score:num, evidence:strings, evidenceIds:strings,
  reason:str, improvementAdvice:str, confidence:str, source:str}).partial();
const score = z.object({criteria:z.object({accuracy:criterion, logicalValidity:criterion,
  methodSelection:criterion, explanationQuality:criterion}).partial(), total:num, feedback:str,
  rubricVersion:str, calibrationStatus:str, assistanceCount:num, generatedAt:num}).partial();
const solution = z.object({method:str, justification:str, steps:strings, answer:str, verification:str,
  interpretation:str, releasedAt:num}).partial();
const ref = z.object({id:str, version:num});
const versions = z.object({topic:ref, problem:ref, formulaTheoremReferences:ref.array(),
  prompts:ref.array(), misconceptionPolicies:ref.array(), difficultyPolicy:ref}).partial();
const gates = z.object(Object.fromEntries(REASONING_PHASES.map(key => [key, evaluation.optional()])));
const progress = z.object(Object.fromEntries(SOLVER_STAGES.map(key => [key, stage.optional()])));

// z.object strips unknown keys at each level, including old operation snapshots.
const draft = z.object({answer:z.object({plainText:str, latex:str, normalizedLatex:str}).partial(),
  methodology:str, reflection:str}).partial();
const session = z.object({
  id:str, schemaVersion:num, workflowVersion:num, revision:num, studentId:str, subjectId:str, topicId:str,
  subject:str, topic:str, difficulty:str.nullable(), problemId:str.nullable(), originalQuestion:str,
  originalProblemText:str, originalProblemLatex:str, needsOpening:z.boolean(), scoringSource:str,
  status:str, currentPhase:str, currentStage:str, currentInternalGate:str.nullable(), currentPrompt:str,
  stageProgress:progress, gates, responseCount:num, diagnosisSummary:strings, lastDiagnosis:diagnosis.nullable(),
  supportHistory:support.array(), allowedSupport:strings, draft:draft.nullable(), scorecard:score.nullable(), releasedSolution:solution.nullable(),
  adaptiveRecommendation:z.object({recommendedDifficulty:str, reason:str, confidence:str}).partial().nullable(),
  configurationVersions:versions.nullable(), promptAdjustment:str, createdAt:num.nullable(), updatedAt:num.nullable(),
  learningCompletedAt:num.nullable(),
}).partial();

export function studentSession(data: Record<string, any>) {
  const released = ["ready_for_submission","submitted","reviewed","returned"].includes(data.status)
    && !!data.scorecard && SOLVER_STAGES.every(key => data.stageProgress?.[key]?.status === "completed");
  return session.parse({...data, releasedSolution:released ? data.releasedSolution ?? null : null});
}
export const studentMessage = z.object({id:str, role:str, phase:str, text:str, createdAt:num, intent:str.optional()});
const extras = z.object({
  evaluation, diagnosis:diagnosis.nullable(), learnerMessage:str, nextPrompt:str,
  ...support.shape, tutorMessage:studentMessage,
}).partial();
export function studentOperationResult(data: Record<string, any>) {
  const safe = studentSession(data.session);
  return {session:safe, ...extras.parse(data), ...(data.completion !== undefined ? {
    completion: data.completion && safe.releasedSolution ? {scorecard:safe.scorecard, releasedSolution:safe.releasedSolution} : null,
  } : {})};
}

// Historical records have a smaller display contract and can predate gate tracking.
const history = z.object({id:str,status:str,subject:str.nullish(),topic:str.nullish(),originalQuestion:str.nullish(),
  schemaVersion:num.nullish(),workflowVersion:num.nullish(),ctScore:num.nullish(),followUpSessionId:str.nullish(),
  problemContext:z.object({promptSnapshot:str.optional()}).nullish(),adminReview:z.object({comment:str.optional()}).nullish(),
  scorecard:score.nullish(),draft:draft.nullish(),releasedSolution:solution.nullish(),
  updatedAt:num,createdAt:num,completedAt:num,learningCompletedAt:num,submittedAt:num,
}).partial();
export function studentHistory(id:string,data:Record<string,any>) {
  const recordedRelease = !!data.scorecard && ["ready_for_submission","completed","submitted","reviewed","returned"].includes(data.status);
  const complete = data.workflowVersion !== 6 || REASONING_PHASES.every(p=>data.gateStates?.[p]?.status === "accepted");
  const dates = Object.fromEntries(["updatedAt","createdAt","completedAt","learningCompletedAt","submittedAt"].map(key=>{
    const v=data[key];
    const n=v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : typeof v==="string" ? Date.parse(v) : v);
    return [key,Number.isFinite(n) ? n : undefined];
  }));
  return history.parse({...data,id,...dates,
    releasedSolution:recordedRelease && complete ? data.releasedSolution ?? null : null});
}
export const historyResponse = z.object({id:str,phase:str.optional(),response:z.object({plainText:str.optional(),latex:str.optional()}).nullish(),
  evaluation:z.object({evidenceSummary:str.optional()}).nullish()});
export const historyMessage = z.object({id:str,role:str,text:str});
