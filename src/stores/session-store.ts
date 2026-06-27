/**
 * Session state management via Zustand.
 *
 * Manages the lifecycle of a Socratic learning session, from creation
 * through AI interaction to final submission and teacher review.
 *
 * @module stores/session-store
 */

import { create } from "zustand";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, firebaseSetupMessage } from "@/lib/firebase";
import {
  MINDGUIDE_PHASE_ORDER,
  getInitialMindGuidePhase,
} from "@/lib/socratic-engine";
import type {
  Session,
  SessionStep,
  ChatMessage,
  LogicMapNode,
  SessionDraft,
  SessionStatus,
  Subject,
  Topic,
  MindGuideProblem,
  MindGuidePhase,
  DiagnosisResult,
  UnlockLevel,
  MindGuideScorecard,
  PhaseResponseRecord,
} from "@/types";

// ─── Store Shape ─────────────────────────────────────────────

interface SessionState {
  /** The currently active session (null if no session in progress). */
  activeSession: Session | null;
  /** List of past sessions for the dashboard. */
  sessionHistory: Session[];
  /** True while an async operation is in progress. */
  isLoading: boolean;
  /** True while the AI is generating a response. */
  isAIThinking: boolean;
  /** Error message from the most recent operation. */
  error: string | null;

  // ── Session Lifecycle ────────────────────────────────────
  /**
   * Creates a new session in Firestore and sets it as active.
   *
   * @param studentId - The UID of the student.
   * @param studentName - Display name of the student.
   * @param subject - The chosen capstone subject.
   * @param topic - The chosen topic within the subject.
   * @param question - The student's original question/problem.
   */
  createSession: (
    studentId: string,
    studentName: string,
    subject: Subject,
    topic: Topic,
    question: string,
    selectedProblem?: MindGuideProblem,
    studentEmail?: string | null
  ) => Promise<string>;

  /** Loads an existing session by ID. */
  loadSession: (sessionId: string) => Promise<void>;

  /** Fetches recent sessions for a student's dashboard. */
  fetchStudentSessions: (studentId: string) => Promise<void>;

  /** Fetches submitted sessions for the teacher workspace. */
  fetchTeacherSessions: () => Promise<void>;

  // ── Message Management ───────────────────────────────────
  /** Appends a message to the active session's chat history. */
  addMessage: (message: ChatMessage) => void;

  /** Sets the AI thinking indicator. */
  setAIThinking: (isThinking: boolean) => void;

  // ── Session Progression ──────────────────────────────────
  /** Advances the session to the specified step. */
  setStep: (step: SessionStep) => void;

  /** Advances the guided Socratic phase through controlled engine logic. */
  setPhase: (phase: MindGuidePhase) => void;

  /** Stores the latest rule-based misconception diagnosis. */
  setDiagnosisResult: (diagnosisResult: DiagnosisResult | null) => void;

  /** Sets the progressive solution support level. */
  setUnlockLevel: (unlockLevel: UnlockLevel) => void;

  /** Updates the logic map for the active session. */
  updateLogicMap: (nodes: LogicMapNode[]) => void;

  /** Saves the student's draft (answer + reflections). */
  saveDraft: (draft: SessionDraft) => void;

  /** Sets the AI-generated summary. */
  setAISummary: (summary: string) => void;

  /** Sets the critical thinking score. */
  setCTScore: (score: number) => void;

  /** Sets the MINDGUIDE five-category scorecard. */
  setMindGuideScorecard: (scorecard: MindGuideScorecard) => void;

  // ── Submission ───────────────────────────────────────────
  /** Submits the completed session to the teacher for review. */
  submitSession: () => Promise<void>;

  /** Persists the current active session state to Firestore. */
  persistSession: () => Promise<void>;

  // ── Teacher Actions ──────────────────────────────────────
  /** Submits teacher feedback (approve or return). */
  submitFeedback: (
    sessionId: string,
    comment: string,
    action: "approved" | "returned"
  ) => Promise<void>;

  // ── Utility ──────────────────────────────────────────────
  /** Resets the active session (e.g., when navigating away). */
  clearActiveSession: () => void;
  /** Clears the error. */
  clearError: () => void;
}

// ─── Store Implementation ────────────────────────────────────

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  sessionHistory: [],
  isLoading: false,
  isAIThinking: false,
  error: null,

  createSession: async (
    studentId,
    studentName,
    subject,
    topic,
    question,
    selectedProblem,
    studentEmail = null
  ) => {
    set({ isLoading: true, error: null });
    try {
      const sessionData = {
        studentId,
        studentName,
        studentEmail,
        teacherId: null,
        subject,
        topic,
        difficulty: selectedProblem?.difficulty ?? null,
        selectedProblemId: selectedProblem?.id ?? null,
        selectedProblem: selectedProblem ?? null,
        originalQuestion: question,
        status: "in_progress" as SessionStatus,
        currentStep: "trigger" as SessionStep,
        currentPhase: getInitialMindGuidePhase(),
        completedPhases: [],
        ctScore: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null,
        messages: [],
        phaseResponses: [],
        correctivePrompts: [],
        logicMap: [],
        draft: null,
        aiSummary: null,
        teacherFeedback: null,
        hintsUsed: 0,
        diagnosisResult: null,
        detectedMisconception: null,
        unlockLevel: 0 as UnlockLevel,
        mindGuideScorecard: null,
        scorecard: null,
      };

      const docRef = await addDoc(
        collection(requireDb(), "sessions"),
        removeUndefinedFields(sessionData)
      );
      const newSession: Session = {
        ...sessionData,
        id: docRef.id,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
        updatedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
      };

      set({ activeSession: newSession, isLoading: false });
      return docRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create session";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loadSession: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      const docRef = doc(requireDb(), "sessions", sessionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        throw new Error("Session not found");
      }
      set({
        activeSession: withPhaseFallback({
          id: snapshot.id,
          ...snapshot.data(),
        } as Session),
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load session";
      set({ error: message, isLoading: false });
    }
  },

  fetchStudentSessions: async (studentId) => {
    set({ isLoading: true, error: null });
    try {
      const q = query(
        collection(requireDb(), "sessions"),
        where("studentId", "==", studentId),
        orderBy("createdAt", "desc"),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(
        (d) => withPhaseFallback({ id: d.id, ...d.data() } as Session)
      );
      set({ sessionHistory: sessions, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch sessions";
      set({ error: message, isLoading: false });
    }
  },

  fetchTeacherSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const q = query(
        collection(requireDb(), "sessions"),
        where("status", "in", ["completed", "submitted", "reviewed", "returned"]),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(
        (d) => withPhaseFallback({ id: d.id, ...d.data() } as Session)
      );
      set({ sessionHistory: sessions, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch sessions";
      set({ error: message, isLoading: false });
    }
  },

  addMessage: (message) => {
    set((state) => {
      if (!state.activeSession) {
        return { activeSession: null };
      }

      const phaseResponse = buildPhaseResponse(message);

      return {
        activeSession: {
          ...state.activeSession,
          messages: [...state.activeSession.messages, message],
          phaseResponses: phaseResponse
            ? [...state.activeSession.phaseResponses, phaseResponse]
            : state.activeSession.phaseResponses,
        },
      };
    });
  },

  setAIThinking: (isThinking) => set({ isAIThinking: isThinking }),

  setStep: (step) => {
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, currentStep: step }
        : null,
    }));
  },

  setPhase: (phase) => {
    set((state) => ({
      activeSession: state.activeSession
        ? {
            ...state.activeSession,
            currentPhase: phase,
            completedPhases: appendCompletedPhase(
              state.activeSession.completedPhases,
              state.activeSession.currentPhase,
              phase
            ),
          }
        : null,
    }));
  },

  setDiagnosisResult: (diagnosisResult) => {
    set((state) => {
      if (!state.activeSession) {
        return { activeSession: null };
      }

      const correctivePrompt = buildCorrectivePromptRecord(diagnosisResult);

      return {
        activeSession: {
          ...state.activeSession,
          diagnosisResult,
          detectedMisconception: diagnosisResult?.errorType ?? null,
          correctivePrompts: correctivePrompt
            ? [...state.activeSession.correctivePrompts, correctivePrompt]
            : state.activeSession.correctivePrompts,
          phaseResponses: attachDiagnosisToLatestPhaseResponse(
            state.activeSession.phaseResponses,
            diagnosisResult
          ),
        },
      };
    });
  },

  setUnlockLevel: (unlockLevel) => {
    set((state) => {
      if (!state.activeSession) {
        return { activeSession: null };
      }

      const clampedLevel = Math.min(Math.max(unlockLevel, 0), 5) as UnlockLevel;
      const shouldCountHint = clampedLevel > state.activeSession.unlockLevel;

      return {
        activeSession: {
          ...state.activeSession,
          unlockLevel: clampedLevel,
          hintsUsed: shouldCountHint
            ? state.activeSession.hintsUsed + 1
            : state.activeSession.hintsUsed,
        },
      };
    });
  },

  updateLogicMap: (nodes) => {
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, logicMap: nodes }
        : null,
    }));
  },

  saveDraft: (draft) => {
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, draft }
        : null,
    }));
  },

  setAISummary: (summary) => {
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, aiSummary: summary }
        : null,
    }));
  },

  setCTScore: (score) => {
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, ctScore: score }
        : null,
    }));
  },

  setMindGuideScorecard: (scorecard) => {
    set((state) => ({
      activeSession: state.activeSession
        ? {
            ...state.activeSession,
            status: "completed",
            currentPhase: "scorecard",
            completedPhases: completeThroughPhase(
              state.activeSession.completedPhases,
              "scorecard"
            ),
            completedAt: nowTimestamp() as any,
            mindGuideScorecard: scorecard,
            scorecard,
            ctScore: scorecard.total,
          }
        : null,
    }));
  },

  submitSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    set({ isLoading: true, error: null });
    try {
      const sessionRef = doc(requireDb(), "sessions", activeSession.id);
      await updateDoc(sessionRef, {
        ...buildSessionUpdatePayload(activeSession),
        status: "completed",
        currentStep: "confirmation",
        currentPhase: "scorecard",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      set((state) => ({
        activeSession: state.activeSession
          ? {
              ...state.activeSession,
              status: "completed",
              currentStep: "confirmation",
              currentPhase: "scorecard",
              completedAt: nowTimestamp() as any,
            }
          : null,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit session";
      set({ error: message, isLoading: false });
    }
  },

  persistSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const sessionRef = doc(requireDb(), "sessions", activeSession.id);
      await updateDoc(sessionRef, buildSessionUpdatePayload(activeSession));
    } catch (err) {
      console.error("Failed to persist session:", err);
    }
  },

  submitFeedback: async (sessionId, comment, action) => {
    set({ isLoading: true, error: null });
    try {
      const sessionRef = doc(requireDb(), "sessions", sessionId);
      const newStatus: SessionStatus = action === "approved" ? "reviewed" : "returned";
      await updateDoc(sessionRef, {
        status: newStatus,
        teacherFeedback: {
          comment,
          action,
          timestamp: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
      // Update local session history to reflect the change
      set((state) => ({
        sessionHistory: state.sessionHistory.map((s) =>
          s.id === sessionId ? { ...s, status: newStatus } : s
        ),
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit feedback";
      set({ error: message, isLoading: false });
    }
  },

  clearActiveSession: () => set({ activeSession: null }),
  clearError: () => set({ error: null }),
}));

function requireDb() {
  if (!db) {
    throw new Error(firebaseSetupMessage);
  }
  return db;
}

function withPhaseFallback(session: Session): Session {
  return {
    ...session,
    studentEmail: session.studentEmail ?? null,
    selectedProblemId:
      session.selectedProblemId ?? session.selectedProblem?.id ?? null,
    selectedProblem: session.selectedProblem ?? null,
    difficulty: session.difficulty ?? session.selectedProblem?.difficulty ?? null,
    currentPhase: session.currentPhase ?? getInitialMindGuidePhase(),
    completedPhases: session.completedPhases ?? [],
    phaseResponses: session.phaseResponses ?? [],
    correctivePrompts: session.correctivePrompts ?? [],
    diagnosisResult: session.diagnosisResult ?? null,
    detectedMisconception:
      session.detectedMisconception ?? session.diagnosisResult?.errorType ?? null,
    unlockLevel: session.unlockLevel ?? 0,
    mindGuideScorecard: session.mindGuideScorecard ?? null,
    scorecard: session.scorecard ?? session.mindGuideScorecard ?? null,
  };
}

function buildSessionUpdatePayload(activeSession: Session) {
  return removeUndefinedFields({
    studentId: activeSession.studentId,
    studentName: activeSession.studentName,
    studentEmail: activeSession.studentEmail ?? null,
    selectedProblemId: activeSession.selectedProblemId,
    selectedProblem: activeSession.selectedProblem,
    subject: activeSession.subject,
    topic: activeSession.topic,
    difficulty: activeSession.difficulty,
    originalQuestion: activeSession.originalQuestion,
    status: activeSession.status,
    currentStep: activeSession.currentStep,
    currentPhase: activeSession.currentPhase,
    completedPhases: activeSession.completedPhases,
    phaseResponses: activeSession.phaseResponses,
    correctivePrompts: activeSession.correctivePrompts,
    messages: activeSession.messages,
    logicMap: activeSession.logicMap,
    draft: activeSession.draft,
    aiSummary: activeSession.aiSummary,
    ctScore: activeSession.ctScore,
    hintsUsed: activeSession.hintsUsed,
    diagnosisResult: activeSession.diagnosisResult,
    detectedMisconception: activeSession.detectedMisconception,
    unlockLevel: activeSession.unlockLevel,
    mindGuideScorecard: activeSession.mindGuideScorecard,
    scorecard: activeSession.scorecard ?? activeSession.mindGuideScorecard,
    completedAt: activeSession.completedAt,
    updatedAt: serverTimestamp(),
  });
}

function buildPhaseResponse(message: ChatMessage): PhaseResponseRecord | null {
  if (message.role !== "student") return null;
  if (!isRecord(message.metadata)) return null;
  if (message.metadata.messageType !== "phase_response") return null;
  if (!isMindGuidePhase(message.metadata.phase)) return null;

  return {
    id: message.id,
    phase: message.metadata.phase,
    response: message.content,
    submittedAt: message.timestamp,
    diagnosisResult: null,
  };
}

function buildCorrectivePromptRecord(diagnosisResult: DiagnosisResult | null) {
  if (
    !diagnosisResult ||
    diagnosisResult.errorType === "none" ||
    !diagnosisResult.correctivePrompt
  ) {
    return null;
  }

  return {
    id: `prompt-${diagnosisResult.detectedAt}-${diagnosisResult.errorType}`,
    phase: diagnosisResult.phase,
    prompt: diagnosisResult.correctivePrompt,
    errorType: diagnosisResult.errorType,
    reasons: diagnosisResult.reasons,
    shownAt: diagnosisResult.detectedAt,
  };
}

function attachDiagnosisToLatestPhaseResponse(
  phaseResponses: PhaseResponseRecord[],
  diagnosisResult: DiagnosisResult | null
): PhaseResponseRecord[] {
  if (!diagnosisResult) return phaseResponses;

  const responseIndex = [...phaseResponses]
    .reverse()
    .findIndex((response) => response.phase === diagnosisResult.phase);

  if (responseIndex < 0) return phaseResponses;

  const actualIndex = phaseResponses.length - 1 - responseIndex;
  return phaseResponses.map((response, index) =>
    index === actualIndex ? { ...response, diagnosisResult } : response
  );
}

function appendCompletedPhase(
  completedPhases: MindGuidePhase[],
  previousPhase: MindGuidePhase,
  nextPhase: MindGuidePhase
): MindGuidePhase[] {
  const previousIndex = MINDGUIDE_PHASE_ORDER.indexOf(previousPhase);
  const nextIndex = MINDGUIDE_PHASE_ORDER.indexOf(nextPhase);

  if (previousIndex < 0 || nextIndex <= previousIndex) {
    return completedPhases;
  }

  return completedPhases.includes(previousPhase)
    ? completedPhases
    : [...completedPhases, previousPhase];
}

function completeThroughPhase(
  completedPhases: MindGuidePhase[],
  phase: MindGuidePhase
): MindGuidePhase[] {
  const phaseIndex = MINDGUIDE_PHASE_ORDER.indexOf(phase);
  if (phaseIndex < 0) return completedPhases;

  const phasesThroughTarget = MINDGUIDE_PHASE_ORDER.slice(0, phaseIndex + 1);
  return phasesThroughTarget.reduce<MindGuidePhase[]>(
    (result, nextPhase) =>
      result.includes(nextPhase) ? result : [...result, nextPhase],
    completedPhases
  );
}

function isMindGuidePhase(value: unknown): value is MindGuidePhase {
  return (
    typeof value === "string" &&
    MINDGUIDE_PHASE_ORDER.includes(value as MindGuidePhase)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedFields) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value.constructor !== Object) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefinedFields(entryValue)])
  ) as T;
}
