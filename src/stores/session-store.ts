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
  runTransaction,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, firebaseSetupMessage } from "@/lib/firebase";
import { useAuthStore } from "@/stores/auth-store";
import { buildNotificationDocumentId } from "@/types";
import {
  MINDGUIDE_PHASE_ORDER,
  getInitialMindGuidePhase,
} from "@/lib/socratic-engine";
import {
  createCuratedProblemContext,
  createFreeFormProblemContext,
  resolveProblemFromContext,
} from "@/lib/problem-context";
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
  AIFallbackEvent,
  AdminReview,
  FreeFormProblemAnalysis,
  ProblemMode,
  SessionHint,
  SessionProblemContext,
  UserStats,
  TopicPerformance,
  MisconceptionErrorType,
  MindGuideDifficulty,
} from "@/types";

const SESSION_SCHEMA_VERSION = 2 as const;
const MAX_QUESTION_CHARACTERS = 2_000;
const MAX_MESSAGE_CHARACTERS = 2_000;
const MAX_AI_MESSAGE_CHARACTERS = 4_000;
const MAX_STUDENT_EXCHANGES = 40;

interface CreateSessionOptions {
  problemMode?: ProblemMode;
  freeFormAnalysis?: FreeFormProblemAnalysis | null;
  parentSessionId?: string | null;
}

// ─── Store Shape ─────────────────────────────────────────────

interface SessionState {
  /** The currently active session (null if no session in progress). */
  activeSession: Session | null;
  /** Last session state confirmed by Firestore, used to roll back failed saves. */
  persistedSession: Session | null;
  /** List of past sessions for the dashboard. */
  sessionHistory: Session[];
  /** True while an async operation is in progress. */
  isLoading: boolean;
  /** True while the AI is generating a response. */
  isAIThinking: boolean;
  /** Error message from the most recent operation. */
  error: string | null;
  studentSessionsHasMore: boolean;
  teacherSessionsHasMore: boolean;
  studentSessionCursor: QueryDocumentSnapshot<DocumentData> | null;
  teacherSessionCursor: QueryDocumentSnapshot<DocumentData> | null;
  studentCursorOwnerId: string | null;

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
    studentEmail?: string | null,
    options?: CreateSessionOptions
  ) => Promise<string>;

  /** Loads an existing session by ID. */
  loadSession: (sessionId: string, expectedStudentId?: string) => Promise<Session>;

  /** Fetches recent sessions for a student's dashboard. */
  fetchStudentSessions: (
    studentId: string,
    options?: { append?: boolean }
  ) => Promise<void>;

  /** Fetches submitted sessions for the teacher workspace. */
  fetchTeacherSessions: (options?: { append?: boolean }) => Promise<void>;

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

  /** Records an AI fallback attempt for defense/demo observability. */
  addAIFallbackEvent: (event: AIFallbackEvent) => void;

  /** Persists a generated or progressively unlocked hint. */
  addHint: (content: string, level: number, source?: SessionHint["source"]) => void;

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

  /** Creates one immutable linked retry for a returned session. */
  createFollowUpSession: (sessionId: string) => Promise<string>;

  // ── Utility ──────────────────────────────────────────────
  /** Resets the active session (e.g., when navigating away). */
  clearActiveSession: () => void;
  /** Clears the error. */
  clearError: () => void;
}

// ─── Store Implementation ────────────────────────────────────

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  persistedSession: null,
  sessionHistory: [],
  isLoading: false,
  isAIThinking: false,
  error: null,
  studentSessionsHasMore: false,
  teacherSessionsHasMore: false,
  studentSessionCursor: null,
  teacherSessionCursor: null,
  studentCursorOwnerId: null,

  createSession: async (
    studentId,
    studentName,
    subject,
    topic,
    question,
    selectedProblem,
    studentEmail = null,
    options = {}
  ) => {
    set({ isLoading: true, error: null });
    try {
      const normalizedQuestion = question.trim();
      if (!normalizedQuestion || normalizedQuestion.length > MAX_QUESTION_CHARACTERS) {
        throw new Error("The problem must be between 1 and 2,000 characters.");
      }

      const problemContext: SessionProblemContext = selectedProblem
        ? createCuratedProblemContext(selectedProblem)
        : options.freeFormAnalysis
          ? createFreeFormProblemContext(normalizedQuestion, options.freeFormAnalysis)
          : (() => {
              throw new Error(
                "Analyze and validate a custom problem before starting the session."
              );
            })();

      const sessionData = {
        schemaVersion: SESSION_SCHEMA_VERSION,
        studentId,
        studentName,
        studentEmail,
        problemMode: problemContext.mode,
        problemContext,
        parentSessionId: options.parentSessionId ?? null,
        followUpSessionId: null,
        subject,
        topic,
        difficulty: selectedProblem?.difficulty ?? null,
        selectedProblemId: selectedProblem?.id ?? null,
        originalQuestion: normalizedQuestion,
        status: "in_progress" as SessionStatus,
        currentStep: "trigger" as SessionStep,
        currentPhase: getInitialMindGuidePhase(),
        completedPhases: [],
        ctScore: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        statsCommittedAt: null,
        messages: [],
        phaseResponses: [],
        correctivePrompts: [],
        logicMap: [],
        draft: null,
        aiSummary: null,
        adminReview: null,
        hints: [] as SessionHint[],
        hintsUsed: 0,
        diagnosisResult: null,
        detectedMisconception: null,
        unlockLevel: 0 as UnlockLevel,
        mindGuideScorecard: null,
        scorecard: null,
        aiFallbackEvents: [],
      };

      const docRef = await addDoc(
        collection(requireDb(), "sessions"),
        removeUndefinedFields(sessionData)
      );
      const localCreatedAt = Timestamp.now();
      const newSession: Session = {
        ...sessionData,
        selectedProblem:
          selectedProblem ?? resolveProblemFromContext(problemContext),
        teacherId: null,
        completedAt: null,
        id: docRef.id,
        createdAt: localCreatedAt,
        updatedAt: localCreatedAt,
      };

      set({
        activeSession: newSession,
        persistedSession: newSession,
        isLoading: false,
      });
      return docRef.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create session";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loadSession: async (sessionId, expectedStudentId) => {
    set({
      activeSession: null,
      persistedSession: null,
      isLoading: true,
      error: null,
    });
    try {
      const docRef = doc(requireDb(), "sessions", sessionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        throw new Error("Session not found");
      }
      const session = withPhaseFallback({
        id: snapshot.id,
        ...snapshot.data(),
      } as Session);
      if (expectedStudentId && session.studentId !== expectedStudentId) {
        throw new Error("This session is not available for your account.");
      }
      set({
        activeSession: session,
        persistedSession: session,
        isLoading: false,
      });
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load session";
      set({
        activeSession: null,
        persistedSession: null,
        error: message,
        isLoading: false,
      });
      throw err;
    }
  },

  fetchStudentSessions: async (studentId, options = {}) => {
    const append = options.append === true;
    const cursor =
      append && get().studentCursorOwnerId === studentId
        ? get().studentSessionCursor
        : null;
    set({
      isLoading: true,
      error: null,
      ...(append ? {} : { sessionHistory: [] }),
    });
    try {
      const sessionsCollection = collection(requireDb(), "sessions");
      const q = cursor
        ? query(
            sessionsCollection,
            where("studentId", "==", studentId),
            orderBy("createdAt", "desc"),
            startAfter(cursor),
            limit(20)
          )
        : query(
            sessionsCollection,
            where("studentId", "==", studentId),
            orderBy("createdAt", "desc"),
            limit(20)
          );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(
        (d) => withPhaseFallback({ id: d.id, ...d.data() } as Session)
      );
      set((state) => ({
        sessionHistory: append
          ? mergeSessions(state.sessionHistory, sessions)
          : sessions,
        studentSessionCursor: snapshot.docs.at(-1) ?? cursor,
        studentSessionsHasMore: snapshot.docs.length === 20,
        studentCursorOwnerId: studentId,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch sessions";
      set({ error: message, isLoading: false });
    }
  },

  fetchTeacherSessions: async (options = {}) => {
    const append = options.append === true;
    const cursor = append ? get().teacherSessionCursor : null;
    set({
      isLoading: true,
      error: null,
      ...(append ? {} : { sessionHistory: [] }),
    });
    try {
      const sessionsCollection = collection(requireDb(), "sessions");
      const q = cursor
        ? query(
            sessionsCollection,
            where("status", "in", ["submitted", "reviewed", "returned"]),
            orderBy("createdAt", "desc"),
            startAfter(cursor),
            limit(25)
          )
        : query(
            sessionsCollection,
            where("status", "in", ["submitted", "reviewed", "returned"]),
            orderBy("createdAt", "desc"),
            limit(25)
          );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(
        (d) => withPhaseFallback({ id: d.id, ...d.data() } as Session)
      );
      set((state) => ({
        sessionHistory: append
          ? mergeSessions(state.sessionHistory, sessions)
          : sessions,
        teacherSessionCursor: snapshot.docs.at(-1) ?? cursor,
        teacherSessionsHasMore: snapshot.docs.length === 25,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch sessions";
      set({ error: message, isLoading: false });
    }
  },

  addMessage: (message) => {
    const current = get().activeSession;
    if (!current) return;
    const messageLimit =
      message.role === "ai" ? MAX_AI_MESSAGE_CHARACTERS : MAX_MESSAGE_CHARACTERS;
    if (message.content.trim().length > messageLimit) {
      throw new Error(
        `${message.role === "ai" ? "AI responses" : "Messages"} must be ${messageLimit.toLocaleString()} characters or fewer.`
      );
    }
    if (
      message.role === "student" &&
      message.metadata?.messageType === "phase_response" &&
      current.messages.filter(
        (entry) =>
          entry.role === "student" &&
          entry.metadata?.messageType === "phase_response"
      ).length >= MAX_STUDENT_EXCHANGES
    ) {
      throw new Error(
        "This session has reached the 40-response limit. Continue to your draft or start a new session."
      );
    }

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

      return {
        activeSession: {
          ...state.activeSession,
          unlockLevel: clampedLevel,
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
            currentPhase: "scorecard",
            completedPhases: completeThroughPhase(
              state.activeSession.completedPhases,
              "scorecard"
            ),
            mindGuideScorecard: scorecard,
            scorecard,
            ctScore: scorecard.total,
          }
        : null,
    }));
  },

  addAIFallbackEvent: (event) => {
    set((state) => ({
      activeSession: state.activeSession
        ? {
            ...state.activeSession,
            aiFallbackEvents: [
              ...(state.activeSession.aiFallbackEvents ?? []),
              event,
            ],
          }
        : null,
    }));
  },

  addHint: (content, level, source = "ai") => {
    const normalizedContent = content.trim().slice(0, 4_000);
    if (!normalizedContent) return;

    set((state) => {
      if (!state.activeSession) return { activeSession: null };
      const normalizedLevel = Math.min(Math.max(Math.round(level), 1), 5) as
        | 1
        | 2
        | 3
        | 4
        | 5;
      const alreadyExists = (state.activeSession.hints ?? []).some(
        (hint) => hint.level === normalizedLevel && hint.source === source
      );
      if (alreadyExists) return state;

      const hint: SessionHint = {
        id: `hint-${state.activeSession.id}-${source}-${normalizedLevel}`,
        level: normalizedLevel,
        content: normalizedContent,
        phase: state.activeSession.currentPhase,
        source,
        createdAt: Date.now(),
      };

      return {
        activeSession: {
          ...state.activeSession,
          hints: [...(state.activeSession.hints ?? []), hint],
          hintsUsed: state.activeSession.hintsUsed + 1,
        },
      };
    });
  },

  submitSession: async () => {
    const { activeSession } = get();
    if (!activeSession) {
      throw new Error("No active session to submit.");
    }
    if (!activeSession.draft || !activeSession.mindGuideScorecard) {
      throw new Error("Complete the draft and formative scorecard before submitting.");
    }

    set({ isLoading: true, error: null });
    try {
      const commitResult = await commitSubmittedSessionStats(activeSession);
      if (commitResult.updatedStats) {
        syncLocalUserStats(activeSession.studentId, commitResult.updatedStats);
      }
      set((state) => ({
        ...(state.activeSession
          ? (() => {
              const submittedSession: Session = {
              ...state.activeSession,
              status: "submitted",
              currentStep: "confirmation",
              submittedAt:
                state.activeSession.submittedAt ?? (commitResult.committedAt as any),
              statsCommittedAt:
                state.activeSession.statsCommittedAt ??
                (commitResult.committedAt as any),
              };
              return {
                activeSession: submittedSession,
                persistedSession: submittedSession,
              };
            })()
          : { activeSession: null, persistedSession: null }),
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit session";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  persistSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const sessionRef = doc(requireDb(), "sessions", activeSession.id);
      await updateDoc(sessionRef, buildSessionUpdatePayload(activeSession));
      set({ persistedSession: activeSession, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save session progress";
      set((state) => ({
        activeSession:
          state.persistedSession?.id === activeSession.id
            ? state.persistedSession
            : state.activeSession,
        error: message,
      }));
      throw err;
    }
  },

  submitFeedback: async (sessionId, comment, action) => {
    set({ isLoading: true, error: null });
    try {
      const newStatus: SessionStatus = action === "approved" ? "reviewed" : "returned";
      const authState = useAuthStore.getState();
      if (!authState.firebaseUser || authState.userProfile?.role !== "admin") {
        throw new Error("Only a system administrator can review sessions.");
      }
      const review = await commitAdminReview({
        sessionId,
        comment: comment.trim(),
        status: newStatus,
        reviewerId: authState.firebaseUser.uid,
      });
      // Update local session history to reflect the change
      set((state) => ({
        sessionHistory: state.sessionHistory.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status: newStatus,
                adminReview: review,
                reviewedAt: review.reviewedAt,
                reviewedBy: review.reviewedBy,
              }
            : s
        ),
        activeSession:
          state.activeSession?.id === sessionId
            ? {
                ...state.activeSession,
                status: newStatus,
                adminReview: review,
                reviewedAt: review.reviewedAt,
                reviewedBy: review.reviewedBy,
              }
            : state.activeSession,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit feedback";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  createFollowUpSession: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      const child = await createLinkedFollowUp(sessionId);
      set({ activeSession: child, persistedSession: child, isLoading: false });
      return child.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create follow-up session";
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  clearActiveSession: () =>
    set({ activeSession: null, persistedSession: null, error: null }),
  clearError: () => set({ error: null }),
}));

async function getSystemAdminIds(): Promise<string[]> {
  const adminsQuery = query(
    collection(requireDb(), "users"),
    where("role", "in", ["admin", "teacher"])
  );
  const snapshot = await getDocs(adminsQuery);
  return snapshot.docs.map((adminDocument) => adminDocument.id);
}

async function commitAdminReview(options: {
  sessionId: string;
  comment: string;
  status: Extract<SessionStatus, "reviewed" | "returned">;
  reviewerId: string;
}): Promise<AdminReview> {
  if (!options.comment || options.comment.length > 2_000) {
    throw new Error("Administrator notes must be between 1 and 2,000 characters.");
  }

  const database = requireDb();
  const sessionRef = doc(database, "sessions", options.sessionId);
  const localReviewedAt = nowTimestamp();

  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    if (!snapshot.exists()) throw new Error("Session not found.");

    const session = withPhaseFallback({
      id: snapshot.id,
      ...snapshot.data(),
    } as Session);
    if (session.status !== "submitted") {
      throw new Error("This session has already been reviewed or is not submitted.");
    }

    const reviewPayload = {
      comment: options.comment,
      outcome: options.status,
      reviewedBy: options.reviewerId,
      reviewedAt: serverTimestamp(),
    };
    transaction.update(sessionRef, {
      status: options.status,
      adminReview: reviewPayload,
      reviewedAt: serverTimestamp(),
      reviewedBy: options.reviewerId,
      updatedAt: serverTimestamp(),
    });

    const eventType =
      options.status === "reviewed" ? "session_reviewed" : "session_returned";
    const notificationId = buildNotificationDocumentId(
      eventType,
      session.id,
      session.studentId
    );
    transaction.set(doc(database, "notifications", notificationId), {
      eventType,
      senderId: options.reviewerId,
      recipientId: session.studentId,
      sessionId: session.id,
      title: options.status === "reviewed" ? "Session Reviewed" : "Follow-up Requested",
      message:
        options.status === "reviewed"
          ? `Your ${session.topic} session has been reviewed by the system administrator.`
          : `The system administrator requested a follow-up for your ${session.topic} session.`,
      actionUrl: `/student/review/${session.id}`,
      read: false,
      createdAt: serverTimestamp(),
    });
  });

  return {
    comment: options.comment,
    outcome: options.status,
    reviewedBy: options.reviewerId,
    reviewedAt: localReviewedAt,
  };
}

async function createLinkedFollowUp(sessionId: string): Promise<Session> {
  const authState = useAuthStore.getState();
  if (!authState.firebaseUser) throw new Error("Sign in to start a follow-up.");

  const database = requireDb();
  const originalRef = doc(database, "sessions", sessionId);
  const childRef = doc(collection(database, "sessions"));
  const adminIds = await getSystemAdminIds();
  const localTimestamp = nowTimestamp();

  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(originalRef);
    if (!snapshot.exists()) throw new Error("Original session not found.");
    const original = withPhaseFallback({
      id: snapshot.id,
      ...snapshot.data(),
    } as Session);

    if (original.studentId !== authState.firebaseUser?.uid) {
      throw new Error("This returned session is not available for your account.");
    }
    if (original.status !== "returned") {
      throw new Error("Only returned sessions can start a follow-up attempt.");
    }
    if (original.followUpSessionId) {
      throw new Error("A follow-up attempt already exists for this session.");
    }

    const childData: Omit<Session, "id" | "createdAt" | "updatedAt"> = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      studentId: original.studentId,
      studentName: original.studentName,
      studentEmail: original.studentEmail,
      subject: original.subject,
      topic: original.topic,
      problemMode: original.problemMode,
      problemContext: original.problemContext,
      difficulty: original.difficulty,
      selectedProblemId: original.selectedProblemId,
      originalQuestion: original.originalQuestion,
      status: "in_progress",
      currentStep: "trigger",
      currentPhase: getInitialMindGuidePhase(),
      completedPhases: [],
      ctScore: 0,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      adminReview: null,
      statsCommittedAt: null,
      messages: [],
      phaseResponses: [],
      correctivePrompts: [],
      logicMap: [],
      draft: null,
      aiSummary: null,
      hints: [],
      hintsUsed: 0,
      diagnosisResult: null,
      detectedMisconception: null,
      unlockLevel: 0,
      mindGuideScorecard: null,
      scorecard: null,
      aiFallbackEvents: [],
      parentSessionId: original.id,
      followUpSessionId: null,
    };

    transaction.set(childRef, {
      ...childData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(originalRef, {
      followUpSessionId: childRef.id,
      updatedAt: serverTimestamp(),
    });

    adminIds.forEach((adminId) => {
      const eventType = "follow_up_started" as const;
      const notificationId = buildNotificationDocumentId(
        eventType,
        childRef.id,
        adminId
      );
      transaction.set(doc(database, "notifications", notificationId), {
        eventType,
        senderId: original.studentId,
        recipientId: adminId,
        sessionId: childRef.id,
        title: "Follow-up Attempt Started",
        message: `${original.studentName} started a follow-up attempt in ${original.topic}.`,
        actionUrl: `/admin/review/${original.id}`,
        read: false,
        createdAt: serverTimestamp(),
      });
    });
  });

  const createdSnapshot = await getDoc(childRef);
  if (!createdSnapshot.exists()) {
    throw new Error("Follow-up session could not be loaded after creation.");
  }
  return withPhaseFallback({
    id: createdSnapshot.id,
    ...createdSnapshot.data(),
    createdAt: createdSnapshot.data().createdAt ?? localTimestamp,
    updatedAt: createdSnapshot.data().updatedAt ?? localTimestamp,
  } as Session);
}

function requireDb() {
  if (!db) {
    throw new Error(firebaseSetupMessage);
  }
  return db;
}

function mergeSessions(current: Session[], incoming: Session[]): Session[] {
  const sessions = new Map(current.map((session) => [session.id, session]));
  incoming.forEach((session) => sessions.set(session.id, session));
  return [...sessions.values()].sort(
    (left, right) =>
      timestampToDate(right.createdAt).getTime() -
      timestampToDate(left.createdAt).getTime()
  );
}

function withPhaseFallback(session: Session): Session {
  const rawStatus = String(session.status);
  const normalizedStatus: SessionStatus =
    rawStatus === "completed"
      ? session.currentStep === "confirmation"
        ? "submitted"
        : "in_progress"
      : (rawStatus as SessionStatus);
  const legacyProblem = session.selectedProblem ?? null;
  const problemMode: ProblemMode =
    session.problemMode ?? (legacyProblem ? "curated" : "free_form");
  const problemContext: SessionProblemContext =
    session.problemContext ??
    (legacyProblem
      ? createCuratedProblemContext(legacyProblem)
      : createFreeFormProblemContext(
          session.originalQuestion,
          buildLegacyFreeFormAnalysis(session)
        ));
  const resolvedProblem =
    legacyProblem ?? resolveProblemFromContext(problemContext);
  const legacyReview: AdminReview | null = session.teacherFeedback
    ? {
        comment: session.teacherFeedback.comment,
        outcome:
          session.teacherFeedback.action === "approved"
            ? ("reviewed" as const)
            : ("returned" as const),
        reviewedBy: session.teacherId ?? "legacy-admin",
        reviewedAt: session.teacherFeedback.timestamp,
      }
    : null;

  return {
    ...session,
    schemaVersion: SESSION_SCHEMA_VERSION,
    status: normalizedStatus,
    studentEmail: session.studentEmail ?? null,
    problemMode,
    problemContext,
    parentSessionId: session.parentSessionId ?? null,
    followUpSessionId: session.followUpSessionId ?? null,
    selectedProblemId:
      session.selectedProblemId ?? resolvedProblem?.id ?? null,
    selectedProblem: resolvedProblem,
    difficulty: session.difficulty ?? resolvedProblem?.difficulty ?? null,
    currentPhase: session.currentPhase ?? getInitialMindGuidePhase(),
    completedPhases: session.completedPhases ?? [],
    phaseResponses: session.phaseResponses ?? [],
    correctivePrompts: session.correctivePrompts ?? [],
    diagnosisResult: session.diagnosisResult ?? null,
    detectedMisconception:
      session.detectedMisconception ?? session.diagnosisResult?.errorType ?? null,
    unlockLevel: session.unlockLevel ?? 0,
    hints: session.hints ?? [],
    mindGuideScorecard: session.mindGuideScorecard ?? null,
    scorecard: session.scorecard ?? session.mindGuideScorecard ?? null,
    aiFallbackEvents: session.aiFallbackEvents ?? [],
    submittedAt:
      session.submittedAt ??
      (normalizedStatus === "submitted" ? session.completedAt ?? null : null),
    reviewedAt:
      session.reviewedAt ?? session.adminReview?.reviewedAt ?? legacyReview?.reviewedAt ?? null,
    reviewedBy:
      session.reviewedBy ?? session.adminReview?.reviewedBy ?? legacyReview?.reviewedBy ?? null,
    adminReview: session.adminReview ?? legacyReview,
    statsCommittedAt: session.statsCommittedAt ?? null,
  };
}

function buildSessionUpdatePayload(activeSession: Session) {
  return removeUndefinedFields({
    schemaVersion: SESSION_SCHEMA_VERSION,
    studentId: activeSession.studentId,
    studentName: activeSession.studentName,
    studentEmail: activeSession.studentEmail ?? null,
    problemMode: activeSession.problemMode,
    problemContext: activeSession.problemContext,
    parentSessionId: activeSession.parentSessionId ?? null,
    followUpSessionId: activeSession.followUpSessionId ?? null,
    selectedProblemId: activeSession.selectedProblemId,
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
    hints: activeSession.hints ?? [],
    draft: activeSession.draft,
    aiSummary: activeSession.aiSummary,
    ctScore: activeSession.ctScore,
    hintsUsed: activeSession.hintsUsed,
    diagnosisResult: activeSession.diagnosisResult,
    detectedMisconception: activeSession.detectedMisconception,
    unlockLevel: activeSession.unlockLevel,
    mindGuideScorecard: activeSession.mindGuideScorecard,
    scorecard: activeSession.scorecard ?? activeSession.mindGuideScorecard,
    aiFallbackEvents: activeSession.aiFallbackEvents ?? [],
    submittedAt: activeSession.submittedAt,
    reviewedAt: activeSession.reviewedAt,
    reviewedBy: activeSession.reviewedBy,
    adminReview: activeSession.adminReview,
    statsCommittedAt: activeSession.statsCommittedAt,
    updatedAt: serverTimestamp(),
  });
}

function buildLegacyFreeFormAnalysis(session: Session): FreeFormProblemAnalysis {
  const rubricCategories = [
    "accuracy",
    "logicalValidity",
    "methodSelection",
    "justificationQuality",
    "interpretationQuality",
  ] as const;

  return {
    analysisVersion: 1,
    validationStatus: "legacy_unverified",
    isSupported: true,
    isSolvable: true,
    rejectionReason: null,
    normalizedQuestion: session.originalQuestion,
    subject: session.subject,
    topic: session.topic,
    expectedConcepts: [],
    requiredFormula: null,
    requiredTheorem: null,
    solutionOutline: [],
    referenceAnswer: "",
    interpretation: "",
    rubric: rubricCategories.map((category) => ({
      category,
      criterion: "Use the recorded reasoning as formative evidence for this category.",
      maxScore: 20 as const,
    })),
  };
}

interface SubmittedSessionStatsCommit {
  updatedStats: UserStats | null;
  committedAt: Timestamp;
}

async function commitSubmittedSessionStats(
  activeSession: Session
): Promise<SubmittedSessionStatsCommit> {
  const database = requireDb();
  const sessionRef = doc(database, "sessions", activeSession.id);
  const userRef = doc(database, "users", activeSession.studentId);
  const localCommitTimestamp = nowTimestamp();
  const adminIds = await getSystemAdminIds();
  if (adminIds.length === 0) {
    throw new Error(
      "No system administrator is configured. Promote an administrator account before submitting."
    );
  }

  return runTransaction(database, async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    if (!sessionSnapshot.exists()) {
      throw new Error("Session not found");
    }

    const sessionData = sessionSnapshot.data() as Partial<Session>;
    const alreadyCommitted = Boolean(sessionData.statsCommittedAt);
    if (
      sessionData.status &&
      sessionData.status !== "in_progress" &&
      sessionData.status !== "submitted"
    ) {
      throw new Error("This session can no longer be submitted.");
    }
    const userSnapshot = alreadyCommitted ? null : await transaction.get(userRef);
    const sessionSubmissionPayload = removeUndefinedFields({
      ...buildSessionUpdatePayload(activeSession),
      status: "submitted" as SessionStatus,
      currentStep: "confirmation" as SessionStep,
      currentPhase: "scorecard" as MindGuidePhase,
      submittedAt: activeSession.submittedAt ?? serverTimestamp(),
      statsCommittedAt: alreadyCommitted
        ? sessionData.statsCommittedAt
        : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.update(sessionRef, sessionSubmissionPayload);

    adminIds.forEach((adminId) => {
      const eventType = "session_submitted" as const;
      const notificationId = buildNotificationDocumentId(
        eventType,
        activeSession.id,
        adminId
      );
      transaction.set(doc(database, "notifications", notificationId), {
        eventType,
        senderId: activeSession.studentId,
        recipientId: adminId,
        sessionId: activeSession.id,
        title: "New Learner Session",
        message: `${activeSession.studentName} submitted a MINDGUIDE session in ${activeSession.topic}.`,
        actionUrl: `/admin/review/${activeSession.id}`,
        read: false,
        createdAt: serverTimestamp(),
      });
    });

    if (alreadyCommitted) {
      return {
        updatedStats: null,
        committedAt: isTimestamp(sessionData.statsCommittedAt)
          ? sessionData.statsCommittedAt
          : localCommitTimestamp,
      };
    }

    const currentStats = normalizeUserStatsForSession(
      userSnapshot?.exists()
        ? (userSnapshot.data().stats as Partial<UserStats> | undefined)
        : undefined
    );
    const updatedStats = buildUpdatedUserStats(
      currentStats,
      activeSession,
      serverTimestamp() as any
    );

    transaction.set(
      userRef,
      {
        stats: updatedStats,
      },
      { merge: true }
    );

    return {
      updatedStats: {
        ...updatedStats,
        lastSessionDate: localCommitTimestamp,
      },
      committedAt: localCommitTimestamp,
    };
  });
}

function buildUpdatedUserStats(
  currentStats: UserStats,
  completedSession: Session,
  lastSessionDate: Timestamp
): UserStats {
  const sessionScore = getSessionScore(completedSession);
  const sessionsCompleted = currentStats.sessionsCompleted + 1;
  const averageCTScore = Math.round(
    (currentStats.averageCTScore * currentStats.sessionsCompleted +
      sessionScore) /
      sessionsCompleted
  );

  return {
    ...currentStats,
    sessionsCompleted,
    averageCTScore,
    currentStreak: getNextStreak(
      currentStats.lastSessionDate,
      currentStats.currentStreak
    ),
    lastSessionDate,
    topicPerformance: upsertTopicPerformance(
      currentStats.topicPerformance,
      completedSession,
      sessionScore
    ),
  };
}

function syncLocalUserStats(studentId: string, stats: UserStats): void {
  useAuthStore.setState((state) => {
    if (state.userProfile?.uid !== studentId) {
      return state;
    }

    return {
      userProfile: {
        ...state.userProfile,
        stats,
      },
    };
  });
}

function upsertTopicPerformance(
  topicPerformance: TopicPerformance[],
  completedSession: Session,
  sessionScore: number
): TopicPerformance[] {
  const current = topicPerformance.find(
    (entry) =>
      entry.subject === completedSession.subject &&
      entry.topic === completedSession.topic
  );
  const remaining = topicPerformance.filter(
    (entry) =>
      entry.subject !== completedSession.subject ||
      entry.topic !== completedSession.topic
  );
  const errorTypes = getSessionErrorTypes(completedSession);
  const difficulty = getSessionDifficulty(completedSession, current);
  const attemptsCount = (current?.attemptsCount ?? 0) + 1;
  const averageScorecardTotal = Math.round(
    ((current?.averageScorecardTotal ?? 0) * (current?.attemptsCount ?? 0) +
      sessionScore) /
      attemptsCount
  );
  const isStrong = sessionScore >= 75 && errorTypes.length === 0;
  const isWeak = sessionScore < 40 || errorTypes.length >= 2;

  const updated: TopicPerformance = {
    subject: completedSession.subject,
    topic: completedSession.topic,
    attemptsCount,
    averageScorecardTotal,
    lastDifficulty: difficulty,
    lastErrorTypes: errorTypes,
    consecutiveStrongSessions: isStrong
      ? (current?.consecutiveStrongSessions ?? 0) + 1
      : 0,
    consecutiveWeakSessions: isWeak
      ? (current?.consecutiveWeakSessions ?? 0) + 1
      : 0,
  };

  return [...remaining, updated].sort((first, second) =>
    `${first.subject}:${first.topic}`.localeCompare(
      `${second.subject}:${second.topic}`
    )
  );
}

function getSessionScore(session: Session): number {
  const score =
    session.mindGuideScorecard?.total ??
    session.scorecard?.total ??
    session.ctScore ??
    0;

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function getSessionDifficulty(
  session: Session,
  current?: TopicPerformance
): MindGuideDifficulty {
  return (
    session.difficulty ??
    session.selectedProblem?.difficulty ??
    current?.lastDifficulty ??
    "Basic"
  );
}

function getSessionErrorTypes(session: Session): MisconceptionErrorType[] {
  const errors = [
    ...session.phaseResponses
      .map((response) => response.diagnosisResult?.errorType)
      .filter(isActiveErrorType),
    session.diagnosisResult?.errorType,
    session.detectedMisconception,
  ].filter(isActiveErrorType);

  return Array.from(new Set(errors));
}

function isActiveErrorType(
  errorType: MisconceptionErrorType | null | undefined
): errorType is MisconceptionErrorType {
  return Boolean(errorType && errorType !== "none");
}

function normalizeUserStatsForSession(
  stats: Partial<UserStats> | undefined
): UserStats {
  return {
    sessionsCompleted: stats?.sessionsCompleted ?? 0,
    averageCTScore: stats?.averageCTScore ?? 0,
    currentStreak: stats?.currentStreak ?? 0,
    lastSessionDate: stats?.lastSessionDate ?? null,
    topicPerformance: (stats?.topicPerformance ?? []).map(normalizeTopicPerformance),
  };
}

function normalizeTopicPerformance(
  topicPerformance: TopicPerformance
): TopicPerformance {
  return {
    ...topicPerformance,
    attemptsCount: topicPerformance.attemptsCount ?? 0,
    averageScorecardTotal: topicPerformance.averageScorecardTotal ?? 0,
    lastDifficulty: topicPerformance.lastDifficulty ?? "Basic",
    lastErrorTypes: topicPerformance.lastErrorTypes ?? [],
    consecutiveStrongSessions:
      topicPerformance.consecutiveStrongSessions ?? 0,
    consecutiveWeakSessions: topicPerformance.consecutiveWeakSessions ?? 0,
  };
}

function getNextStreak(
  lastSessionDate: Timestamp | null,
  currentStreak: number
): number {
  if (!lastSessionDate) return 1;

  const lastDate = timestampToDate(lastSessionDate);
  const today = new Date();

  if (isSameCalendarDay(lastDate, today)) {
    return Math.max(currentStreak, 1);
  }

  return isPreviousCalendarDay(lastDate, today) ? currentStreak + 1 : 1;
}

function timestampToDate(timestamp: Timestamp): Date {
  return typeof timestamp.toDate === "function"
    ? timestamp.toDate()
    : new Date((timestamp.seconds ?? 0) * 1000);
}

function isTimestamp(value: unknown): value is Timestamp {
  return Boolean(
    value &&
      typeof value === "object" &&
      "seconds" in value &&
      "nanoseconds" in value
  );
}

function isSameCalendarDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function isPreviousCalendarDay(previous: Date, today: Date): boolean {
  const previousDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1
  );
  return isSameCalendarDay(previous, previousDay);
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
