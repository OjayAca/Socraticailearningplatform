/**
 * Core type definitions for the SocratAI Learning Platform.
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
  | "submitted"
  | "reviewed"
  | "returned";

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
  teacherId: string | null;
  subject: string;
  topic: string;
  originalQuestion: string;
  status: SessionStatus;
  currentStep: SessionStep;
  ctScore: number;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
  messages: ChatMessage[];
  logicMap: LogicMapNode[];
  draft: SessionDraft | null;
  aiSummary: string | null;
  teacherFeedback: TeacherFeedback | null;
  hintsUsed: number;
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
