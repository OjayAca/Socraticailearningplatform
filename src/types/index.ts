/**
 * Core type definitions for the MINDGUIDE learning platform.
 *
 * These interfaces define the shape of all data flowing through the application,
 * from Firebase documents to Zustand store state.
 */

import type { Timestamp } from "firebase/firestore";

// ─── User Types ──────────────────────────────────────────────

/** Canonical roles accepted by schema-v2 application code. */
export type UserRole = "student" | "admin";

/** Role value accepted only while normalizing pre-v2 documents. */
export type LegacyUserRole = "teacher";

/** Persisted per-user application preferences. */
export interface UserPreferences {
  /** Controls transient toasts. Notifications are always kept in the inbox. */
  liveAlertPopups: boolean;
}

/** Firestore document shape for a user profile (`users/{userId}`). */
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole | null;
  createdAt: Timestamp;
  stats: UserStats;
  preferences: UserPreferences;
}

/** Aggregated statistics stored on the user profile. */
export interface UserStats {
  sessionsCompleted: number;
  averageCTScore: number;
  currentStreak: number;
  lastSessionDate: Timestamp | null;
  topicPerformance: TopicPerformance[];
}

// ─── Session Types ───────────────────────────────────────────

/** The canonical lifecycle of a Socratic learning session. */
export type SessionStatus =
  | "in_progress"
  | "submitted"
  | "reviewed"
  | "returned";

/** Status accepted only by schema normalization and the v2 migration. */
export type LegacySessionStatus = "completed";

/** Current persisted schema version. */
export const CURRENT_SCHEMA_VERSION = 2 as const;
export type SessionSchemaVersion = typeof CURRENT_SCHEMA_VERSION;

/** Whether a session uses a prepared problem or a student-authored problem. */
export type ProblemMode = "curated" | "free_form";

/** Shared input and context limits enforced by UI, stores, and Firestore rules. */
export const MINDGUIDE_LIMITS = {
  questionCharacters: 2_000,
  studentMessageCharacters: 2_000,
  aiResponseCharacters: 4_000,
  answerCharacters: 4_000,
  methodologyCharacters: 4_000,
  reflectionCharacters: 2_000,
  studentExchanges: 40,
  aiContextCharacters: 24_000,
} as const;

/** Supported MINDGUIDE capstone subjects and their allowed topics. */
export const SUBJECT_TOPICS = {
  "Quantitative Methods": [
    "Measures of Central Tendency",
    "Variance and Standard Deviation",
    "Data Interpretation",
    "Probability",
    "Correlation and Basic Regression",
  ],
  "Discrete Mathematics": [
    "Logic and Propositions",
    "Truth Tables",
    "Counting Principles",
    "Permutations and Combinations",
    "Pigeonhole Principle",
    "Basic Proof Reasoning",
  ],
} as const;

export const SUBJECTS = Object.keys(SUBJECT_TOPICS) as Subject[];

export type Subject = keyof typeof SUBJECT_TOPICS;
export type Topic = (typeof SUBJECT_TOPICS)[Subject][number];

/** Difficulty level for prepared MINDGUIDE prototype problems. */
export type MindGuideDifficulty = "Basic" | "Intermediate" | "Advanced";

/** Per-topic learning history used by future adaptive difficulty selection. */
export interface TopicPerformance {
  topic: Topic;
  subject: Subject;
  attemptsCount: number;
  averageScorecardTotal: number;
  lastDifficulty: MindGuideDifficulty;
  lastErrorTypes: MisconceptionErrorType[];
  consecutiveStrongSessions: number;
  consecutiveWeakSessions: number;
}

/** Recommendation shape for future adaptive problem selection. */
export interface DifficultyRecommendation {
  recommendedDifficulty: MindGuideDifficulty;
  reason: string;
  confidence: "low" | "medium" | "high";
}

/** Prepared-problem prompt adjustment used inside an active session. */
export type SessionDifficultyAdjustment = "simplify" | "maintain" | "deepen";

/** Required phase order for the MINDGUIDE Socratic flow. */
export type MindGuidePhase =
  | "problem_understanding"
  | "method_selection"
  | "formula_theorem_justification"
  | "guided_computation_or_reasoning"
  | "error_diagnosis"
  | "progressive_unlock"
  | "scorecard";

/** Socratic prompt set used to guide students through a prepared problem. */
export interface MindGuideSocraticPrompts {
  problem_understanding: string;
  method_selection: string;
  formula_theorem_justification: string;
  guided_computation_or_reasoning: string;
  error_diagnosis: string;
  progressive_unlock: string;
  scorecard: string;
}

/** Prepared problem bank item for the first MINDGUIDE working prototype. */
export interface MindGuideProblem {
  id: string;
  subject: Subject;
  topic: Topic;
  difficulty: MindGuideDifficulty;
  problemText: string;
  expectedConcepts: string[];
  requiredFormula?: string;
  requiredTheorem?: string;
  socraticPrompts: MindGuideSocraticPrompts;
  solutionSteps: string[];
  finalAnswer: string;
  interpretation: string;
}

/** Public, non-solution snapshot retained when a prepared problem is selected. */
export interface CuratedProblemPromptSnapshot {
  subject: Subject;
  topic: Topic;
  difficulty: MindGuideDifficulty;
  problemText: string;
}

/** The five fixed dimensions used by a generated free-form rubric. */
export type ScorecardCategory =
  | "accuracy"
  | "logicalValidity"
  | "methodSelection"
  | "justificationQuality"
  | "interpretationQuality";

/** One criterion in the generated five-category formative rubric. */
export interface FreeFormRubricCriterion {
  category: ScorecardCategory;
  criterion: string;
  maxScore: 20;
}

/** Validation state distinguishes new AI analysis from migrated legacy data. */
export type ProblemAnalysisValidationStatus =
  | "validated"
  | "legacy_unverified";

/**
 * Validated structured reference produced before a free-form session starts.
 * New sessions require `validated`; `legacy_unverified` is migration-only.
 */
export interface FreeFormProblemAnalysis {
  analysisVersion: 1;
  validationStatus: ProblemAnalysisValidationStatus;
  isSupported: boolean;
  isSolvable: boolean;
  rejectionReason: string | null;
  normalizedQuestion: string;
  subject: Subject;
  topic: Topic;
  expectedConcepts: string[];
  requiredFormula: string | null;
  requiredTheorem: string | null;
  solutionOutline: string[];
  referenceAnswer: string;
  interpretation: string;
  rubric: FreeFormRubricCriterion[];
}

/** Persisted reference for a prepared problem without its answer or steps. */
export interface CuratedSessionProblemContext {
  mode: "curated";
  problemId: string;
  promptSnapshot: CuratedProblemPromptSnapshot;
}

/** Persisted reference for a student-authored problem. */
export interface FreeFormSessionProblemContext {
  mode: "free_form";
  question: string;
  analysis: FreeFormProblemAnalysis;
}

/** Discriminated session problem context used by all schema-v2 flows. */
export type SessionProblemContext =
  | CuratedSessionProblemContext
  | FreeFormSessionProblemContext;

/** Rule-based misconception/error categories for prototype diagnosis. */
export type MisconceptionErrorType =
  | "wrong_formula"
  | "invalid_logic"
  | "misinterpreted_variable"
  | "computational_error"
  | "weak_justification"
  | "skipped_reasoning"
  | "none";

/** Result returned by the misconception detector for a student response. */
export interface DiagnosisResult {
  errorType: MisconceptionErrorType;
  correctivePrompt: string;
  phase: MindGuidePhase;
  reasons: string[];
  detectedAt: number;
}

/** A student's response captured against the active MINDGUIDE phase. */
export interface PhaseResponseRecord {
  id: string;
  phase: MindGuidePhase;
  response: string;
  submittedAt: number;
  diagnosisResult: DiagnosisResult | null;
}

/** A corrective prompt shown to the student after a detected misconception. */
export interface CorrectivePromptRecord {
  id: string;
  phase: MindGuidePhase;
  prompt: string;
  errorType: MisconceptionErrorType;
  reasons: string[];
  shownAt: number;
}

/** Progressive solution support levels. */
export type UnlockLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** A single visible support item unlocked for the student. */
export interface UnlockedSupportItem {
  level: Exclude<UnlockLevel, 0>;
  title: string;
  content: string[];
}

/** Structured support returned by the progressive unlock helper. */
export interface UnlockedSupport {
  unlockLevel: UnlockLevel;
  items: UnlockedSupportItem[];
}

/** A generated hint persisted with the session for refresh/resume support. */
export interface SessionHint {
  id: string;
  level: Exclude<UnlockLevel, 0>;
  content: string;
  phase: MindGuidePhase;
  source: "ai" | "progressive_unlock";
  createdAt: number;
}

/** Five-category MINDGUIDE critical thinking scorecard. */
export interface MindGuideScorecard {
  accuracy: number;
  logicalValidity: number;
  methodSelection: number;
  justificationQuality: number;
  interpretationQuality: number;
  total: number;
  feedback: string;
}

/** Lightweight audit entry for AI fallback calls used in demos/defense. */
export interface AIFallbackEvent {
  id: string;
  kind: "diagnosis" | "scorecard";
  triggeredAt: number;
  phase?: MindGuidePhase;
  reason: string;
  outcome: "used_ai" | "failed";
  ruleResult: string;
  aiResult: string | null;
  changedResult: boolean;
}

/** The discrete steps a session progresses through. */
export type SessionStep =
  | "trigger"
  | "questioning"
  | "hints"
  | "logic_map"
  | "draft"
  | "review"
  | "log"
  | "confirmation";

/** A single message in the chat conversation. */
export interface ChatMessage {
  id: string;
  role: "student" | "ai";
  content: string;
  timestamp: number;
  /** Optional metadata — e.g., hint level, sentiment tag */
  metadata?: Record<string, unknown>;
}

/** A node in the student's logic/reasoning map. */
export interface LogicMapNode {
  step: number;
  title: string;
  description: string;
  completed: boolean;
}

/** The student's self-authored draft and reflections. */
export interface SessionDraft {
  answer: string;
  methodology: string;
  reflection: string;
}

/** Immutable review outcome recorded by the global administrator. */
export interface AdminReview {
  comment: string;
  outcome: "reviewed" | "returned";
  reviewedBy: string;
  reviewedAt: Timestamp;
}

/** Pre-v2 feedback shape accepted only by migration/read normalization. */
export interface LegacyAdministratorFeedback {
  comment: string;
  action: "approved" | "returned";
  timestamp: Timestamp;
}

/** @deprecated Use `AdminReview`; retained for legacy document reads only. */
export type AdministratorFeedback = LegacyAdministratorFeedback;

/**
 * Firestore document shape for a Socratic session (`sessions/{sessionId}`).
 *
 * This is the central data object — it captures the entire guided learning
 * interaction from the student's initial question through administrator review.
 */
export interface Session {
  id: string;
  schemaVersion: SessionSchemaVersion;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  subject: Subject;
  topic: Topic;
  problemMode: ProblemMode;
  problemContext: SessionProblemContext;
  difficulty: MindGuideDifficulty | null;
  selectedProblemId: string | null;
  originalQuestion: string;
  status: SessionStatus;
  currentStep: SessionStep;
  currentPhase: MindGuidePhase;
  completedPhases: MindGuidePhase[];
  ctScore: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt: Timestamp | null;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
  adminReview: AdminReview | null;
  statsCommittedAt: Timestamp | null;
  messages: ChatMessage[];
  phaseResponses: PhaseResponseRecord[];
  correctivePrompts: CorrectivePromptRecord[];
  logicMap: LogicMapNode[];
  draft: SessionDraft | null;
  aiSummary: string | null;
  hints: SessionHint[];
  hintsUsed: number;
  diagnosisResult: DiagnosisResult | null;
  detectedMisconception: MisconceptionErrorType | null;
  unlockLevel: UnlockLevel;
  mindGuideScorecard: MindGuideScorecard | null;
  scorecard: MindGuideScorecard | null;
  aiFallbackEvents: AIFallbackEvent[];
  parentSessionId: string | null;
  followUpSessionId: string | null;
  /** @deprecated Pre-v2 embedded solution; never include in new writes. */
  selectedProblem?: MindGuideProblem | null;
  /** @deprecated Pre-v2 reviewer identifier; migration-only. */
  teacherId?: string | null;
  /** @deprecated Pre-v2 feedback; migration-only. */
  /** Schema-v2 stored field name retained for migration compatibility. */
  teacherFeedback?: LegacyAdministratorFeedback | null;
  /** @deprecated Pre-v2 completion time; migration-only. */
  completedAt?: Timestamp | null;
}

// ─── AI Types ────────────────────────────────────────────────

/** The structured response from the Socratic AI engine. */
export interface SocraticResponse {
  /** The AI's next message to the student. */
  message: string;
  /** Whether the AI detected the student pasted a direct answer. */
  isAnswerBlocked: boolean;
  /** AI-suggested logic map update (if any). */
  logicMapUpdate?: LogicMapNode;
  /** Current hint level if hints were requested (1-3). */
  hintLevel?: number;
  /** Whether the student has shown enough understanding to proceed. */
  canProceedToNext: boolean;
  /** AI-evaluated critical thinking score adjustment. */
  ctScoreDelta?: number;
}

// ─── Notification Types ─────────────────────────────────────

/** Exactly-once notification events emitted by session lifecycle transitions. */
export type NotificationEventType =
  | "session_submitted"
  | "session_reviewed"
  | "session_returned"
  | "follow_up_started";

/** Deterministic Firestore document ID for a lifecycle notification. */
export type NotificationDocumentId =
  `${NotificationEventType}__${string}__${string}`;

/** Builds the ID enforced by Firestore rules. */
export function buildNotificationDocumentId(
  eventType: NotificationEventType,
  sessionId: string,
  recipientId: string
): NotificationDocumentId {
  return `${eventType}__${sessionId}__${recipientId}`;
}

/** A typed lifecycle notification intended for a specific recipient. */
export interface AppNotification {
  id: NotificationDocumentId;
  eventType: NotificationEventType;
  senderId: string;
  recipientId: string;
  sessionId: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl: string;
  createdAt: Timestamp;
  /** @deprecated Pre-v2 recipient field; migration-only. */
  userId?: string;
}
