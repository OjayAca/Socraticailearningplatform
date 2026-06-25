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
} from "firebase/firestore";
import { db, firebaseSetupMessage } from "@/lib/firebase";
import type {
  Session,
  SessionStep,
  ChatMessage,
  LogicMapNode,
  SessionDraft,
  SessionStatus,
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
   * @param subject - The chosen subject (e.g., "Mathematics").
   * @param question - The student's original question/problem.
   */
  createSession: (
    studentId: string,
    studentName: string,
    subject: string,
    question: string
  ) => Promise<string>;

  /** Loads an existing session by ID. */
  loadSession: (sessionId: string) => Promise<void>;

  /** Fetches recent sessions for a student's dashboard. */
  fetchStudentSessions: (studentId: string) => Promise<void>;

  /** Fetches submitted sessions for the teacher dashboard. */
  fetchTeacherSessions: () => Promise<void>;

  // ── Message Management ───────────────────────────────────
  /** Appends a message to the active session's chat history. */
  addMessage: (message: ChatMessage) => void;

  /** Sets the AI thinking indicator. */
  setAIThinking: (isThinking: boolean) => void;

  // ── Session Progression ──────────────────────────────────
  /** Advances the session to the specified step. */
  setStep: (step: SessionStep) => void;

  /** Updates the logic map for the active session. */
  updateLogicMap: (nodes: LogicMapNode[]) => void;

  /** Saves the student's draft (answer + reflections). */
  saveDraft: (draft: SessionDraft) => void;

  /** Sets the AI-generated summary. */
  setAISummary: (summary: string) => void;

  /** Sets the critical thinking score. */
  setCTScore: (score: number) => void;

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

  createSession: async (studentId, studentName, subject, question) => {
    set({ isLoading: true, error: null });
    try {
      const sessionData = {
        studentId,
        studentName,
        teacherId: null,
        subject,
        topic: question.slice(0, 60),
        originalQuestion: question,
        status: "in_progress" as SessionStatus,
        currentStep: "trigger" as SessionStep,
        ctScore: 0,
        createdAt: serverTimestamp(),
        completedAt: null,
        messages: [],
        logicMap: [],
        draft: null,
        aiSummary: null,
        teacherFeedback: null,
        hintsUsed: 0,
      };

      const docRef = await addDoc(collection(requireDb(), "sessions"), sessionData);
      const newSession: Session = {
        ...sessionData,
        id: docRef.id,
        createdAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any,
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
        activeSession: { id: snapshot.id, ...snapshot.data() } as Session,
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
        (d) => ({ id: d.id, ...d.data() }) as Session
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
        where("status", "in", ["submitted", "reviewed", "returned"]),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Session
      );
      set({ sessionHistory: sessions, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch sessions";
      set({ error: message, isLoading: false });
    }
  },

  addMessage: (message) => {
    set((state) => ({
      activeSession: state.activeSession
        ? {
            ...state.activeSession,
            messages: [...state.activeSession.messages, message],
          }
        : null,
    }));
  },

  setAIThinking: (isThinking) => set({ isAIThinking: isThinking }),

  setStep: (step) => {
    set((state) => ({
      activeSession: state.activeSession
        ? { ...state.activeSession, currentStep: step }
        : null,
    }));
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

  submitSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    set({ isLoading: true, error: null });
    try {
      const sessionRef = doc(requireDb(), "sessions", activeSession.id);
      await updateDoc(sessionRef, {
        status: "submitted",
        currentStep: "confirmation",
        completedAt: serverTimestamp(),
        messages: activeSession.messages,
        logicMap: activeSession.logicMap,
        draft: activeSession.draft,
        aiSummary: activeSession.aiSummary,
        ctScore: activeSession.ctScore,
        hintsUsed: activeSession.hintsUsed,
      });
      set((state) => ({
        activeSession: state.activeSession
          ? { ...state.activeSession, status: "submitted", currentStep: "confirmation" }
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
      await updateDoc(sessionRef, {
        currentStep: activeSession.currentStep,
        messages: activeSession.messages,
        logicMap: activeSession.logicMap,
        draft: activeSession.draft,
        aiSummary: activeSession.aiSummary,
        ctScore: activeSession.ctScore,
        hintsUsed: activeSession.hintsUsed,
      });
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
