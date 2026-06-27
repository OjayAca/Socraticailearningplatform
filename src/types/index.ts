/**
 * Core type definitions for the MINDGUIDE learning platform.
 *
 * These interfaces define the shape of all data flowing through the application,
 * from Firebase documents to Zustand store state.
 */

import type { Timestamp } from "firebase/firestore";

// ─── User Types ──────────────────────────────────────────────

/** The two roles a user can assume in the system. */
export type UserRole = "student" | "teacher";

/** Firestore document shape for a user profile (`users/{userId}`). */
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole | null;
  createdAt: Timestamp;
  stats: UserStats;
}

/** Aggregated statistics stored on the user profile. */
export interface UserStats {
  sessionsCompleted: number;
  averageCTScore: number;
  currentStreak: number;
  lastSessionDate: Timestamp | null;
}

// ─── Session Types ───────────────────────────────────────────

/** The lifecycle status of a Socratic learning session. */
export type SessionStatus =
  | "in_progress"
  | "completed"
  | "submitted"
  | "reviewed"
  | "returned";

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

/** The discrete steps a session progresses through. */
export type SessionStep =
  | "trigger"
  | "questioning"
  | "productive"
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

/** Feedback left by the teacher on a submitted session. */
export interface TeacherFeedback {
  comment: string;
  action: "approved" | "returned";
  timestamp: Timestamp;
}

/**
 * Firestore document shape for a Socratic session (`sessions/{sessionId}`).
 *
 * This is the central data object — it captures the entire guided learning
 * interaction from the student's initial question through teacher review.
 */
export interface Session {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  teacherId: string | null;
  subject: Subject;
  topic: Topic;
  difficulty: MindGuideDifficulty | null;
  selectedProblemId: string | null;
  selectedProblem: MindGuideProblem | null;
  originalQuestion: string;
  status: SessionStatus;
  currentStep: SessionStep;
  currentPhase: MindGuidePhase;
  completedPhases: MindGuidePhase[];
  ctScore: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
  messages: ChatMessage[];
  phaseResponses: PhaseResponseRecord[];
  correctivePrompts: CorrectivePromptRecord[];
  logicMap: LogicMapNode[];
  draft: SessionDraft | null;
  aiSummary: string | null;
  teacherFeedback: TeacherFeedback | null;
  hintsUsed: number;
  diagnosisResult: DiagnosisResult | null;
  detectedMisconception: MisconceptionErrorType | null;
  unlockLevel: UnlockLevel;
  mindGuideScorecard: MindGuideScorecard | null;
  scorecard: MindGuideScorecard | null;
}

// ─── AI Types ────────────────────────────────────────────────

/** Supported AI provider backends. */
export type AIProvider = "gemini" | "ollama";

/** Configuration for the AI provider. */
export interface AIProviderConfig {
  provider: AIProvider;
  /** Gemini API key (only used when provider is "gemini"). */
  geminiApiKey?: string;
  /** Base URL for Ollama (defaults to http://localhost:11434). */
  ollamaBaseUrl?: string;
  /** Model name for Ollama (e.g., "gemma3"). */
  ollamaModel?: string;
}

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

/** A notification intended for a specific user. */
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string; // e.g., '/student/history' or '/teacher/review/123'
  createdAt: Timestamp;
}
