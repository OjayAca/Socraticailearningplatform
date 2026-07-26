export const SCHEMA_VERSION = 4 as const;
export const WORKFLOW_VERSION = 4 as const;

export type UserRole = "student" | "admin";
export type AccountStatus = "active" | "suspended" | "deactivated" | "anonymized";
export type Subject = "Quantitative Methods" | "Discrete Mathematics";
export type Difficulty = "Basic" | "Intermediate" | "Advanced";
export type Confidence = "low" | "medium" | "high";
export type EvaluationSource = "deterministic" | "ai" | "hybrid";
export type ManagedContentStatus =
  | "draft"
  | "pending_validation"
  | "approved"
  | "rejected"
  | "archived";

export interface AcademicProfile {
  studentNumber: string;
  course: string;
  yearLevel: string;
  section: string;
}

export interface CatalogSubject {
  id: string;
  name: Subject;
  status: "approved";
  version: number;
}

export interface CatalogTopic {
  id: string;
  subjectId: string;
  subject: Subject;
  name: string;
  status: "approved";
  version: number;
  ready: boolean;
}

export interface LearningCatalog {
  subjects: CatalogSubject[];
  topics: CatalogTopic[];
  generatedAt: number;
}

export interface ManagedReferenceVersion {
  id: string;
  version: number;
}

export interface SessionConfigurationVersions {
  topic: ManagedReferenceVersion;
  problem: ManagedReferenceVersion;
  formulaTheoremReferences: ManagedReferenceVersion[];
  prompts: ManagedReferenceVersion[];
  misconceptionPolicies: ManagedReferenceVersion[];
  difficultyPolicy: ManagedReferenceVersion;
}

export interface ContentValidationRecord {
  id: string;
  problemId: string;
  syllabusReference: string;
  contentMatrixItem: string;
  validatorName: string;
  validatorRole: string;
  validationDate: number;
  evidenceReference: string;
  evidenceHash: string;
  decision: "approved" | "rejected";
  createdAt: number;
  createdBy: string;
}

export const REASONING_PHASES = [
  "problem_understanding",
  "relevant_information_identification",
  "method_selection",
  "formula_theorem_justification",
  "guided_computation_or_proof",
  "verification_and_checking",
  "result_interpretation",
] as const;

export const WORKFLOW_PHASES = [
  ...REASONING_PHASES,
  "controlled_solution_release",
  "critical_thinking_scorecard",
] as const;

export type ReasoningPhase = (typeof REASONING_PHASES)[number];
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export const SOLVER_STAGES = [
  "problem_understanding",
  "method_selection",
  "computation",
  "interpretation",
] as const;

export type SolverStage = (typeof SOLVER_STAGES)[number];

export const SOLVER_STAGE_LABELS: Record<SolverStage, string> = {
  problem_understanding: "Problem Understanding",
  method_selection: "Method Selection",
  computation: "Computation",
  interpretation: "Interpretation",
};

export const SOLVER_STAGE_PHASES: Record<SolverStage, readonly ReasoningPhase[]> = {
  problem_understanding: [
    "problem_understanding",
    "relevant_information_identification",
  ],
  method_selection: ["method_selection", "formula_theorem_justification"],
  computation: ["guided_computation_or_proof", "verification_and_checking"],
  interpretation: ["result_interpretation"],
};

export const PHASE_LABELS: Record<WorkflowPhase, string> = {
  problem_understanding: "Understand the Problem",
  relevant_information_identification: "Identify Relevant Information",
  method_selection: "Select a Method",
  formula_theorem_justification: "Justify the Formula or Theorem",
  guided_computation_or_proof: "Guided Computation or Proof",
  verification_and_checking: "Verify and Check",
  result_interpretation: "Interpret the Result",
  controlled_solution_release: "Controlled Solution Support",
  critical_thinking_scorecard: "Critical Thinking Scorecard",
};

export type GateStatus = "locked" | "pending" | "needs_revision" | "accepted";
export type SupportLevel =
  | "socratic_prompt"
  | "targeted_hint"
  | "stronger_hint"
  | "partial_step"
  | "worked_explanation"
  | "full_solution";

export type SessionStatus =
  | "in_progress"
  | "ready_for_submission"
  | "submitted"
  | "reviewed"
  | "returned"
  | "abandoned"
  | "expired";

export type DiagnosisCategory =
  | "conceptual_error"
  | "procedural_error"
  | "wrong_formula"
  | "theorem_condition_violation"
  | "invalid_logic"
  | "misinterpreted_variable"
  | "computational_error"
  | "incorrect_interpretation"
  | "weak_justification"
  | "skipped_reasoning"
  | "unsupported_response"
  | "none";

export type DiagnosisSeverity = "minor" | "moderate" | "major";
export type DiagnosisResolution = "open" | "resolved" | "superseded";
export type ScorecardCategory =
  | "accuracy"
  | "logicalValidity"
  | "methodSelection"
  | "explanationQuality";

export interface MathResponse {
  plainText: string;
  latex?: string;
  normalizedLatex?: string;
  mathJson?: unknown;
}

export interface GateEvaluation {
  phase: ReasoningPhase;
  status: Exclude<GateStatus, "locked" | "pending">;
  attemptCount: number;
  correctiveCycleCount: number;
  evidenceSummary: string;
  confidence: Confidence;
  source: EvaluationSource;
  evaluatedAt: number;
  acceptedAt: number | null;
}

export interface DiagnosisResult {
  category: DiagnosisCategory;
  evidence: string[];
  confidence: Confidence;
  severity: DiagnosisSeverity;
  targetPhase: ReasoningPhase;
  correctivePrompt: string;
  resolutionStatus: DiagnosisResolution;
  source: EvaluationSource;
}

export interface ScorecardCriterionResult {
  category: ScorecardCategory;
  score: number;
  evidence: string[];
  reason: string;
  improvementAdvice: string;
  confidence: Confidence;
  source: EvaluationSource;
}

export interface ScorecardResult {
  criteria: Record<ScorecardCategory, ScorecardCriterionResult>;
  total: number;
  feedback: string;
  generatedAt: number;
}

export interface ReleasedSolution {
  method: string;
  justification: string;
  steps: string[];
  answer: string;
  verification: string;
  interpretation: string;
  releasedAt: number;
}

export interface AdaptiveRecommendation {
  recommendedDifficulty: Difficulty;
  reason: string;
  confidence: Confidence;
}

export interface SessionCompletion {
  scorecard: ScorecardResult;
  releasedSolution: ReleasedSolution;
}

export type SolverStageStatus = "locked" | "active" | "completed";

export interface SolverStageProgress {
  stage: SolverStage;
  status: SolverStageStatus;
  acceptedGates: number;
  totalGates: number;
}

export interface PublicProblem {
  id: string;
  subjectId: string;
  topicId: string;
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  variant: number;
  problemText: string;
  supportedResponseFormats: Array<"text" | "latex">;
  status: ManagedContentStatus;
  version: number;
  validationRecordId?: string;
}

export interface SessionProjection {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  workflowVersion: typeof WORKFLOW_VERSION;
  revision: number;
  studentId: string;
  subjectId: string;
  topicId: string;
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  problemId: string | null;
  originalQuestion: string;
  status: SessionStatus;
  currentPhase: WorkflowPhase;
  currentStage: SolverStage;
  currentInternalGate: ReasoningPhase | null;
  currentPrompt: string;
  stageProgress: Record<SolverStage, SolverStageProgress>;
  gates: Partial<Record<ReasoningPhase, GateEvaluation>>;
  allowedSupport: SupportLevel[];
  draft: SessionDraft | null;
  scorecard: ScorecardResult | null;
  releasedSolution: ReleasedSolution | null;
  adaptiveRecommendation: AdaptiveRecommendation | null;
  configurationVersions: SessionConfigurationVersions | null;
  promptAdjustment: "simplify" | "maintain" | "deepen";
  createdAt: number;
  updatedAt: number;
  learningCompletedAt: number | null;
}

export interface SessionDraft {
  answer: MathResponse;
  methodology: string;
  reflection: string;
}

export interface CallableErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  correlationId: string;
}

export interface MutationRequest {
  requestId: string;
}

export interface BootstrapProfileRequest extends MutationRequest {
  displayName: string;
  consentVersion?: string;
}

export interface CompleteAcademicProfileRequest extends MutationRequest, AcademicProfile {}

export interface CuratedLearningSessionInput {
  mode: "curated";
  topicId: string;
}

export interface FreeFormLearningSessionInput {
  mode: "free_form";
  topicId: string;
  question: string;
  requestedDifficulty: Difficulty;
}

export type StartLearningSessionInput =
  | CuratedLearningSessionInput
  | FreeFormLearningSessionInput;

export type StartLearningSessionRequest = MutationRequest & StartLearningSessionInput;

export interface EvaluatePhaseResponseRequest extends MutationRequest {
  sessionId: string;
  expectedPhase: ReasoningPhase;
  revision: number;
  response: MathResponse;
}

export interface EvaluatePhaseResponseResponse {
  session: SessionProjection;
  evaluation: GateEvaluation;
  diagnosis: DiagnosisResult;
  learnerMessage: string;
  nextPrompt: string;
  completion: SessionCompletion | null;
}

export interface RequestSupportRequest extends MutationRequest {
  sessionId: string;
  requestedLevel: SupportLevel;
  revision: number;
}

export interface RequestSupportResponse {
  session: SessionProjection;
  level: SupportLevel;
  title: string;
  content: string[];
}

export interface SaveSessionDraftRequest extends MutationRequest {
  sessionId: string;
  revision: number;
  draft: SessionDraft;
}

export interface SessionMutationResponse {
  session: SessionProjection;
  completion?: SessionCompletion | null;
}

export interface RevisionedSessionMutationRequest extends MutationRequest {
  sessionId: string;
  revision: number;
}

export type FinalizeScorecardRequest = RevisionedSessionMutationRequest;
export type SubmitLearningSessionRequest = RevisionedSessionMutationRequest;

export interface GetCurrentConsentNoticeResponse {
  version: string;
  title: string;
  summary: string;
  collectedData: string[];
  purpose: string;
  retention: string;
}

export interface LearningProgress {
  userId: string;
  sessionsCompleted: number;
  scoreTotal: number;
  averageCTScore: number;
  currentStreak: number;
  lastSessionAt: number | null;
  lastSessionDate: string | null;
  topicRecommendations: Record<string, unknown>;
}

export type ReportKind =
  | "learning_progress"
  | "scorecards"
  | "misconceptions"
  | "activity"
  | "usage";

export interface ReportQueryRequest {
  kind: ReportKind;
  subject?: Subject;
  topic?: string;
  from?: number;
  to?: number;
  includeIdentity?: boolean;
  exportReason?: string;
  limit?: number;
}

export interface ReportRow {
  kind: ReportKind;
  [key: string]: unknown;
}

export interface ReportQueryResponse {
  kind: ReportKind;
  rows: ReportRow[];
  generatedAt: number;
  pseudonymized: boolean;
}

export interface AdminReviewSessionRequest extends MutationRequest {
  sessionId: string;
  outcome: "reviewed" | "returned";
  comment: string;
}

export interface ContentMutationRequest extends MutationRequest {
  collection:
    | "subjects"
    | "topics"
    | "problems"
    | "formula_theorem_references"
    | "socratic_prompt_bank"
    | "misconception_categories"
    | "difficulty_policies"
    | "system_settings"
    | "policy_documents";
  id: string;
  value?: Record<string, unknown>;
}

export interface AdminSubmitProblemValidationRequest extends MutationRequest {
  problemId: string;
}

export interface AdminRecordProblemValidationRequest extends MutationRequest {
  problemId: string;
  syllabusReference: string;
  contentMatrixItem: string;
  validatorName: string;
  validatorRole: string;
  validationDate: number;
  evidenceReference: string;
  evidenceHash: string;
  decision: "approved" | "rejected";
}

export interface AdminImportProblemDraft {
  id: string;
  subjectId: string;
  topicId: string;
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  variant: 1 | 2 | 3;
  problemText: string;
  supportedResponseFormats: Array<"text" | "latex">;
  formulaTheoremReferenceIds: string[];
  privateSolution: Record<string, unknown>;
}

export interface AdminBulkImportProblemsRequest extends MutationRequest {
  problems: AdminImportProblemDraft[];
  dryRun: boolean;
}

export interface CatalogReadinessResponse {
  ready: boolean;
  expectedProblemCount: number;
  approvedProblemCount: number;
  cells: Array<{
    topicId: string;
    difficulty: Difficulty;
    approvedVariants: number;
    ready: boolean;
  }>;
  issues: string[];
  generatedAt: number;
}

export function isReasoningPhase(value: unknown): value is ReasoningPhase {
  return REASONING_PHASES.includes(value as ReasoningPhase);
}

export function isWorkflowPhase(value: unknown): value is WorkflowPhase {
  return WORKFLOW_PHASES.includes(value as WorkflowPhase);
}

export function solverStageForPhase(phase: WorkflowPhase): SolverStage {
  if (phase === "controlled_solution_release" || phase === "critical_thinking_scorecard") {
    return "interpretation";
  }
  return SOLVER_STAGES.find((stage) =>
    SOLVER_STAGE_PHASES[stage].includes(phase as ReasoningPhase)
  ) ?? "problem_understanding";
}

export function nextWorkflowPhase(phase: WorkflowPhase): WorkflowPhase | null {
  const index = WORKFLOW_PHASES.indexOf(phase);
  return index >= 0 ? WORKFLOW_PHASES[index + 1] ?? null : null;
}
