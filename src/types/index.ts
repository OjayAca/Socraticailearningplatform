/**
 * Frontend and migration types still used by the secure MINDGUIDE application.
 */

import type { Timestamp } from "firebase/firestore";

export type UserRole = "student" | "admin";

interface UserPreferences {
  liveAlertPopups: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole | null;
  createdAt: Timestamp;
  stats: UserStats;
  preferences: UserPreferences;
}

interface TopicPerformance {
  topic: Topic;
  subject: Subject;
  attemptsCount: number;
  averageScorecardTotal: number;
  lastDifficulty: MindGuideDifficulty;
  lastErrorTypes: string[];
  consecutiveStrongSessions: number;
  consecutiveWeakSessions: number;
}

export interface UserStats {
  sessionsCompleted: number;
  averageCTScore: number;
  currentStreak: number;
  lastSessionDate: Timestamp | null;
  topicPerformance: TopicPerformance[];
}

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

type Subject = keyof typeof SUBJECT_TOPICS;
export type Topic = (typeof SUBJECT_TOPICS)[Subject][number];
export type MindGuideDifficulty = "Basic" | "Intermediate" | "Advanced";

interface MindGuideSocraticPrompts {
  problem_understanding: string;
  method_selection: string;
  formula_theorem_justification: string;
  guided_computation_or_reasoning: string;
  error_diagnosis: string;
  progressive_unlock: string;
  scorecard: string;
}

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

type NotificationEventType =
  | "session_submitted"
  | "session_reviewed"
  | "session_returned"
  | "follow_up_started";

type NotificationDocumentId =
  `${NotificationEventType}__${string}__${string}`;

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
  userId?: string;
}
