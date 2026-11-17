import { studentMessage, studentSession } from "@/lib/learning/student-response";
import {
  STANDARD_SOLVER_STAGES,
  computeDisplayProgressPercent,
  computeDisplayStageProgress,
  displayPhaseLabel,
  displaySessionStatus,
  displayStageDescription,
  displayStageLabel,
} from "@/lib/learning/display-labels";
import { Tooltip } from "./ui/tooltip";
import { closedSessionMessage } from "@/lib/learning/session-message";
import { MathText } from "./MathText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Link, Navigate, useParams } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Lightbulb,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Send,
  X,
  ArrowDown,
} from "lucide-react";
import type {
  MathResponse,
  SessionProjection,
  SupportLevel,
  TutorMessage,
} from "@mindguide/contracts";
import {
  SCHEMA_VERSION,
  SOLVER_STAGES,
  SOLVER_STAGE_PHASES,
  WORKFLOW_VERSION,
  isReasoningPhase,
  solverStageForPhase,
} from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import { isCurrentLearningSession } from "@/lib/session-compatibility";
import {
  abandonLearningSession,
  checkLearningSessionActivity,
  evaluatePhaseResponse,
  finalizeScorecard,
  requestSessionSupport,
  resumeTutorOpening,
  submitLearningSession,
} from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";
import { HelpDialog } from "./HelpDialog";
import { MathInput } from "./MathInput";
import { ScorecardDetails } from "./ScorecardDetails";
import { TutorMessageBubble } from "./TutorMessageBubble";
import { SessionViewport } from "./SessionViewport";
import { Alert } from "./ui/alert";
import { ConfirmDialog } from "./ui/confirm-dialog";

const EMPTY_RESPONSE: MathResponse = { plainText: "", latex: "" };

type BusyAction =
  | "load"
  | "sending"
  | "hint"
  | "opening"
  | "solution"
  | "finish"
  | "abandon"
  | null;

type DraftSaveState = "idle" | "saving" | "saved_tab" | "error";
type AccountSaveState = "idle" | "sending" | "saved_account" | "error";

export function SecureSession() {
  const { sessionId } = useParams();
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const [session, setSession] = useState<SessionProjection | null>(null);
  const [response, setResponse] = useState<MathResponse>(EMPTY_RESPONSE);
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>("load");
  const [slowRequest, setSlowRequest] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSlowRequest(loading),
      loading ? 15000 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [loading]);
  const [error, setError] = useState<string | null>(null);
  const [isAbandonDialogOpen, setIsAbandonDialogOpen] = useState(false);
  const [isProblemOpen, setIsProblemOpen] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isPreviousReasoningOpen, setIsPreviousReasoningOpen] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const [accountSaveState, setAccountSaveState] =
    useState<AccountSaveState>("idle");
  const [mathSyntaxError, setMathSyntaxError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const busy = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const restoreComposerFocus = useRef(false);
  const lastSend = useRef<{ key: string; requestId: string } | null>(null);
  const lastHint = useRef<{ key: string; requestId: string } | null>(null);
  const [failedPayload, setFailedPayload] = useState<MathResponse | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [showEquation, setShowEquation] = useState(false);
  const [messages, setMessages] = useState<TutorMessage[]>([]);

  const handleCompactChange = useCallback((compact: boolean) => {
    if (compact) {
      setIsProblemOpen(false);
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (!db || !sessionId) return;
    const result = await getDocs(
      collection(db, "sessions", sessionId, "messages"),
    );
    setMessages(
      result.docs
        .map(
          (item) =>
            studentMessage.parse({
              ...item.data(),
              id: item.id,
              createdAt: item.get("createdAt")?.toMillis?.() ?? 0,
            }) as TutorMessage,
        )
        .sort((a, b) => a.createdAt - b.createdAt),
    );
  }, [sessionId]);

  const load = useCallback(async () => {
    if (!db || !sessionId || !firebaseUser) return;
    setLoading(true);
    setBusyAction("load");
    setError(null);
    try {
      await checkLearningSessionActivity(sessionId);
      const snapshot = await getDoc(doc(db, "sessions", sessionId));
      if (!snapshot.exists()) {
        throw new Error("The learning session was not found.");
      }
      const data = snapshot.data();
      if (!isCurrentLearningSession(data)) {
        throw new Error(
          "This session uses an incompatible legacy workflow. View it from your learning history or start a current-workflow follow-up.",
        );
      }
      const projected = firestoreProjection(snapshot.id, data);
      setSession(projected);
      try {
        const local = sessionStorage.getItem(
          `mindguide.draft.${firebaseUser.uid}.${sessionId}`,
        );
        if (local && projected.status === "in_progress") {
          const saved = JSON.parse(local);
          if (saved.revision === projected.revision && saved.response) {
            setResponse(saved.response);
            if (
              saved.response.plainText?.trim() ||
              saved.response.latex?.trim()
            ) {
              setDraftSaveState("saved_tab");
            }
          }
        }
      } catch {
        setDraftSaveState("error");
      }
      setPrompt(projected.currentPrompt || promptFor(projected.currentPhase));
      await refreshMessages();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The session could not be loaded.",
      );
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
      setBusyAction(null);
    }
  }, [firebaseUser, sessionId, refreshMessages]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!firebaseUser || !sessionId || !session || loading) return;
    const key = `mindguide.draft.${firebaseUser.uid}.${sessionId}`;
    if (session.status !== "in_progress") {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Ignore storage cleanup failures in restricted browsing modes.
      }
    }
  }, [session, sessionId, firebaseUser, loading]);

  function persistTabDraft(nextValue: MathResponse, activeRevision = session?.revision ?? 0) {
    if (!firebaseUser || !sessionId) return;
    const key = `mindguide.draft.${firebaseUser.uid}.${sessionId}`;
    const hasContent = Boolean(nextValue.plainText.trim() || nextValue.latex?.trim());
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ revision: activeRevision, response: nextValue }),
      );
      setDraftSaveState(hasContent ? "saved_tab" : "idle");
    } catch {
      if (hasContent) setDraftSaveState("error");
    }
  }

  function updateDraftResponse(nextValue: MathResponse) {
    setAccountSaveState((prev) =>
      prev === "saved_account" || prev === "error" ? "idle" : prev,
    );
    setFailedPayload(null);
    setResponse(nextValue);
    if (session?.status === "in_progress") {
      persistTabDraft(nextValue, session.revision);
    }
  }

  function jumpToLatest() {
    const viewport = scrollRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
    nearBottom.current = true;
    setHasNewMessages(false);
  }

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (nearBottom.current) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, pendingText, loading]);

  useEffect(() => {
    if (!loading && restoreComposerFocus.current) {
      composerRef.current?.focus();
      restoreComposerFocus.current = false;
    }
  }, [loading]);

  const displayStages = useMemo(
    () =>
      session
        ? computeDisplayStageProgress({
            currentPhase: session.currentPhase,
            gates: session.gates,
            stageProgress: session.stageProgress,
          })
        : [],
    [session],
  );

  const progress = useMemo(
    () => computeDisplayProgressPercent(displayStages),
    [displayStages],
  );

  const hasInvalidMath = Boolean(response.latex?.trim() && mathSyntaxError);

  async function submitReasoning(payloadOverride?: MathResponse) {
    const payload = payloadOverride ?? response;
    if (
      !session ||
      busy.current ||
      loading ||
      session.needsOpening ||
      !isReasoningPhase(session.currentPhase) ||
      (!payload.plainText.trim() && !payload.latex?.trim()) ||
      (payload.latex?.trim() && mathSyntaxError)
    ) {
      return;
    }
    busy.current = true;
    restoreComposerFocus.current = true;
    const key = JSON.stringify([
      session.id,
      session.currentPhase,
      session.revision,
      payload,
    ]);
    if (lastSend.current?.key !== key) {
      lastSend.current = { key, requestId: crypto.randomUUID() };
    }
    const requestId = lastSend.current.requestId;
    setPendingText([payload.plainText, payload.latex].filter(Boolean).join("\n"));
    const submittedResponse = payload;
    let acknowledged = false;
    setResponse(EMPTY_RESPONSE);
    setDraftSaveState("idle");
    setAccountSaveState("sending");
    setBusyAction("sending");
    setLoading(true);
    setError(null);
    try {
      const result = await evaluatePhaseResponse({
        sessionId: session.id,
        expectedPhase: session.currentPhase,
        revision: session.revision,
        response: payload,
        intent: "answer",
        requestId,
      });
      acknowledged = true;
      setFailedPayload(null);
      setSession(result.session);
      setPrompt(result.nextPrompt);
      setResponse(EMPTY_RESPONSE);
      persistTabDraft(EMPTY_RESPONSE, result.session.revision);
      setPendingText(null);
      lastSend.current = null;
      setAccountSaveState("saved_account");
      // Keep an acknowledged exchange visible even if the subsequent history read fails.
      const studentMsg: TutorMessage = {
        id: `${requestId}_student`,
        role: "student",
        phase: session.currentPhase,
        text: [payload.plainText, payload.latex].filter(Boolean).join("\n"),
        createdAt: Date.now(),
      };
      setMessages((current) => [
        ...current.filter(
          (message) =>
            message.id !== studentMsg.id &&
            message.id !== result.tutorMessage?.id,
        ),
        studentMsg,
        ...(result.tutorMessage ? [result.tutorMessage] : []),
      ]);
      await refreshMessages();
    } catch (cause) {
      if (!acknowledged) {
        setResponse(submittedResponse);
        persistTabDraft(submittedResponse, session.revision);
        setFailedPayload(submittedResponse);
        setAccountSaveState("error");
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save your response to your account. Try again.",
      );
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
      setBusyAction(null);
    }
  }

  async function requestSupport(level: SupportLevel) {
    if (
      !session ||
      busy.current ||
      loading ||
      session.needsOpening ||
      !isReasoningPhase(session.currentPhase) ||
      !session.allowedSupport.includes(level)
    ) {
      return;
    }
    busy.current = true;
    const key = JSON.stringify([session.id, session.revision, level]);
    if (lastHint.current?.key !== key) {
      lastHint.current = { key, requestId: crypto.randomUUID() };
    }
    const requestId = lastHint.current.requestId;
    setBusyAction("hint");
    setLoading(true);
    setError(null);
    try {
      const result = await requestSessionSupport({
        sessionId: session.id,
        requestedLevel: level,
        revision: session.revision,
        requestId,
      });
      setSession(result.session);
      setPrompt(result.session.currentPrompt);
      lastHint.current = null;
      const hint: TutorMessage = {
        id: `${requestId}_tutor`,
        role: "assistant",
        phase: session.currentPhase,
        text: result.content.join("\n\n"),
        createdAt: Date.now(),
      };
      setMessages((current) => [
        ...current.filter((message) => message.id !== hint.id),
        hint,
      ]);
      await refreshMessages();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Support could not be unlocked.",
      );
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
      setBusyAction(null);
    }
  }

  async function revealSolution() {
    if (!session || busy.current || loading) return;
    busy.current = true;
    setBusyAction("solution");
    setLoading(true);
    setError(null);
    try {
      const key = `mindguide.reveal.${firebaseUser!.uid}.${session.id}`;
      const stored = sessionStorage.getItem(key);
      const previous = stored ? JSON.parse(stored) : null;
      const requestId =
        previous?.revision === session.revision
          ? previous.requestId
          : crypto.randomUUID();
      sessionStorage.setItem(
        key,
        JSON.stringify({ revision: session.revision, requestId }),
      );
      const scored = await finalizeScorecard(
        session.id,
        session.revision,
        requestId,
      );
      sessionStorage.removeItem(key);
      setSession(scored.session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The solution and scorecard could not be generated. Your reasoning is saved; try again.",
      );
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
      setBusyAction(null);
    }
  }

  async function submitForReview() {
    if (!session || busy.current || loading) return;
    busy.current = true;
    setBusyAction("finish");
    setLoading(true);
    setError(null);
    try {
      const result = await submitLearningSession(session.id, session.revision);
      setSession(result.session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The session could not be submitted.",
      );
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
      setBusyAction(null);
    }
  }

  async function abandonSession() {
    if (!session || busy.current || loading) return;
    busy.current = true;
    setBusyAction("abandon");
    setLoading(true);
    setError(null);
    try {
      const result = await abandonLearningSession(session.id);
      setSession(result.session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The session could not be abandoned.",
      );
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
      setBusyAction(null);
      setIsAbandonDialogOpen(false);
    }
  }

  if (!sessionId) return <Navigate to="/student/history" replace />;
  if (loading && !session) {
    return (
      <div
        role="status"
        aria-label="Loading learning session"
        className="flex flex-1 items-center justify-center"
      >
        <Loader2
          aria-hidden="true"
          className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-300"
        />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <AlertCircle
            aria-hidden="true"
            className="mx-auto h-10 w-10 text-amber-500"
          />
          <h1 className="mt-3 text-xl font-bold text-slate-950 dark:text-white">
            Session unavailable
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{error}</p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw aria-hidden="true" className="mr-2 inline h-4 w-4" />
              Retry
            </button>
            <Link
              to="/student/history"
              className="inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              History
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (
    ["submitted", "reviewed", "returned", "abandoned", "expired"].includes(
      session.status,
    )
  ) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400"
          />
          <h1 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">
            Session {session.status}
          </h1>
          <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {displaySessionStatus(session.status)}
          </p>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            {closedSessionMessage(session.status, session.scorecard)}
          </p>
          <Link
            to="/student/history"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            View learning history
          </Link>
        </div>
      </div>
    );
  }

  const reasoning = isReasoningPhase(session.currentPhase);
  const currentStageInfo = STANDARD_SOLVER_STAGES.find(
    (item) => item.id === displayStages.find((d) => d.status === "active")?.stage,
  );
  const activeStageLabel = displayStageLabel(session.currentPhase);
  const activeStageDescription = displayStageDescription(session.currentPhase);

  return (
    <SessionViewport onCompactChange={handleCompactChange}>
      <header className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white"
          >
            MG
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-950 sm:text-lg dark:text-white">
              Socratic Session: {session.subject}
            </h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {session.topic}
            </p>
          </div>
          <HelpDialog variant="session" />
          <Tooltip label="Close session and return to history">
            <Link
              to="/student/history"
              aria-label="Close session and return to history"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </Link>
          </Tooltip>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          <span>
            {currentStageInfo ? `Stage ${Number(currentStageInfo.number)} · ` : ""}
            {activeStageLabel}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Learning progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-violet-600 transition-all motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol
          aria-label="Four Socratic learning stages"
          className="mt-2.5 grid grid-cols-4 gap-1.5"
        >
          {displayStages.map((stage) => (
            <li
              key={stage.stage}
              title={`${stage.number}. ${stage.label}: ${stage.description}`}
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold leading-tight ${
                stage.status === "completed"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : stage.status === "active"
                    ? "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200"
                    : "border-slate-200 bg-slate-50/60 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              }`}
            >
              <span className="block truncate">
                {stage.number}. {stage.label}
              </span>
            </li>
          ))}
        </ol>
      </header>

      <section
        aria-label="Current problem"
        className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-sm sm:px-6 dark:border-slate-800 dark:bg-slate-950/60"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={isProblemOpen}
            aria-controls="current-problem-panel"
            onClick={() => setIsProblemOpen((prev) => !prev)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs font-bold text-slate-700 transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-slate-200 dark:hover:text-violet-300"
          >
            {isProblemOpen ? (
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            )}
            <span>Current problem</span>
            {session.difficulty && (
              <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {session.difficulty}
              </span>
            )}
          </button>
          <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
            {activeStageDescription}
          </span>
        </div>
        {isProblemOpen && (
          <div
            id="current-problem-panel"
            className="max-h-28 overflow-y-auto pb-2 text-sm text-slate-800 dark:text-slate-200"
          >
            <MathText text={session.originalQuestion} />
          </div>
        )}
      </section>

      <details
        open={isDetailsOpen}
        className="shrink-0 border-b border-slate-100 bg-white px-4 text-sm sm:px-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <summary
          onClick={(event) => {
            event.preventDefault();
            setIsDetailsOpen((prev) => {
              if (prev) setIsPreviousReasoningOpen(false);
              return !prev;
            });
          }}
          className="cursor-pointer py-2.5 text-xs font-medium text-slate-500 focus-visible:outline-violet-600 dark:text-slate-400"
        >
          Session details
        </summary>
        <div className="max-h-[35dvh] space-y-4 overflow-y-auto pb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {displayStages.map((stage) => (
              <div
                key={stage.stage}
                className={`rounded-lg border p-3 text-xs ${
                  stage.status === "completed"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : stage.status === "active"
                      ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                      : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {stage.status === "completed" ? (
                  <CheckCircle2 aria-hidden="true" className="mr-1 inline h-3 w-3" />
                ) : (
                  <LockKeyhole aria-hidden="true" className="mr-1 inline h-3 w-3" />
                )}
                {stage.label}
                <span className="mt-1 block">
                  {stage.status === "completed"
                    ? "Completed"
                    : stage.status === "active"
                      ? "In progress"
                      : "Upcoming"}
                </span>
              </div>
            ))}
          </div>

          {session.adaptiveRecommendation && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adaptive difficulty: {session.adaptiveRecommendation.reason}
            </p>
          )}

          {isDetailsOpen && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <History aria-hidden="true" className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  Previous reasoning &amp; checkpoints
                </span>
                <button
                  type="button"
                  aria-expanded={isPreviousReasoningOpen}
                  onClick={() => setIsPreviousReasoningOpen((prev) => !prev)}
                  className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-violet-300 dark:hover:bg-violet-950/60"
                >
                  {isPreviousReasoningOpen
                    ? "Hide reasoning log"
                    : `Review submitted turns (${messages.length})`}
                </button>
              </div>
              {isPreviousReasoningOpen && (
                <div className="space-y-2 pt-1">
                  {messages.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No submitted turns recorded yet.
                    </p>
                  ) : (
                    messages.map((item) => (
                      <div
                        key={`prev_${item.id}`}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <p className="font-bold text-slate-700 dark:text-slate-200">
                          {item.role === "student" ? "Your submitted work" : "Tutor feedback"}{" "}
                          · {displayPhaseLabel(item.phase)}
                        </p>
                        <div className="mt-1 text-slate-600 dark:text-slate-300">
                          <MathText text={item.text} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {!!session.supportHistory?.length && (
            <section>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Support history
              </h2>
              {session.supportHistory.map((entry, index) => (
                <div
                  key={index}
                  className="mt-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-950"
                >
                  <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                    {displayPhaseLabel(entry.phase)} · {entry.title}
                  </p>
                  {entry.content.map((line, i) => (
                    <MathText key={i} text={line} />
                  ))}
                </div>
              ))}
            </section>
          )}

          <button
            type="button"
            onClick={() => setIsAbandonDialogOpen(true)}
            disabled={loading}
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-500 transition hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-300"
          >
            <Ban aria-hidden="true" className="h-4 w-4" />
            Abandon and preserve this session
          </button>
          <ConfirmDialog
            open={isAbandonDialogOpen}
            onOpenChange={setIsAbandonDialogOpen}
            variant="destructive"
            title="Abandon this session?"
            description="Your reasoning record will be preserved as read-only history, but you won't be able to continue this session."
            confirmLabel="Abandon session"
            cancelLabel="Keep working"
            isLoading={busyAction === "abandon"}
            onConfirm={() => void abandonSession()}
          />
        </div>
      </details>

      <div
        ref={scrollRef}
        onScroll={() => {
          const viewport = scrollRef.current;
          if (!viewport) return;
          nearBottom.current =
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
            100;
          setHasNewMessages(!nearBottom.current);
        }}
        className="session-conversation min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
      >
        <div className="mx-auto max-w-5xl space-y-6">
          <section
            aria-label="Socratic tutor conversation"
            role="log"
            aria-live="polite"
            className="space-y-5"
          >
            {messages.map((message) => (
              <TutorMessageBubble
                key={message.id}
                role={message.role}
                text={message.text}
                phaseLabel={
                  message.phase ? displayPhaseLabel(message.phase) : undefined
                }
              />
            ))}
            {!messages.length && !session.needsOpening && (
              <TutorMessageBubble
                role="assistant"
                text={prompt}
                phaseLabel={displayPhaseLabel(session.currentPhase)}
              />
            )}
            {pendingText && (
              <TutorMessageBubble
                role="student"
                text={pendingText}
                phaseLabel={displayPhaseLabel(session.currentPhase)}
              />
            )}
            {loading && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300"
              >
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                {slowRequest
                  ? "Your tutor is taking longer than usual. Please keep this session open while we wait for your result…"
                  : busyAction === "sending"
                    ? "Sending to tutor... Your tutor is thinking…"
                    : "Your tutor is thinking…"}
              </p>
            )}
          </section>

          {session.needsOpening && (
            <button
              type="button"
              disabled={loading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                setBusyAction("opening");
                setLoading(true);
                setError(null);
                try {
                  const result = await resumeTutorOpening(
                    session.id,
                    session.revision,
                  );
                  setSession(result.session);
                  setPrompt(result.session.currentPrompt);
                  await refreshMessages();
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "The tutor could not start.",
                  );
                } finally {
                  busy.current = false;
                  setLoading(false);
                  setBusyAction(null);
                }
              }}
            >
              {busyAction === "opening" && (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              )}
              {busyAction === "opening"
                ? "Starting conversation..."
                : "Start AI conversation"}
            </button>
          )}

          {!reasoning && (
            <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-300">
                  Progressive solution unlock
                </p>
                <h2 className="mt-2 text-lg font-bold text-slate-950 dark:text-white">
                  All four Socratic stages are complete.
                </h2>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  Your saved conversation provides the reasoning evidence. View
                  your step-by-step solution and formative scorecard when you
                  are ready.
                </p>
              </div>
              {!session.scorecard ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void revealSolution()}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                >
                  {busyAction === "solution" && (
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  )}
                  <span>
                    {busyAction === "solution"
                      ? "Preparing solution..."
                      : "View step-by-step solution"}
                  </span>
                  {busyAction !== "solution" && (
                    <ArrowRight aria-hidden="true" className="h-5 w-5" />
                  )}
                </button>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-slate-950 dark:text-white">
                    Critical Thinking Scorecard
                  </h2>
                  <ScorecardDetails scorecard={session.scorecard} />
                  {session.releasedSolution && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                      <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">
                        Unlocked worked solution
                      </p>
                      <h3 className="mt-2 font-bold">Method</h3>
                      <MathText text={session.releasedSolution.method} />
                      <h3 className="mt-4 font-bold">Why it applies</h3>
                      <MathText text={session.releasedSolution.justification} />
                      <h3 className="mt-4 font-bold">Steps</h3>
                      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                        {session.releasedSolution.steps.map((step, index) => (
                          <li key={index}>
                            <MathText text={step} />
                          </li>
                        ))}
                      </ol>
                      <h3 className="mt-4 font-bold">Final answer</h3>
                      <MathText text={session.releasedSolution.answer} />
                      <h3 className="mt-4 font-bold">Verification</h3>
                      <MathText text={session.releasedSolution.verification} />
                      <h3 className="mt-4 font-bold">Interpretation</h3>
                      <MathText text={session.releasedSolution.interpretation} />
                    </div>
                  )}
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Formative AI-supported feedback only — not an official
                    grade.
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void submitForReview()}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                  >
                    {busyAction === "finish" && (
                      <Loader2
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                    )}
                    <span>
                      {busyAction === "finish"
                        ? "Finishing session..."
                        : "Finish session"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hasNewMessages && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="mx-auto mb-2 flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-medium text-violet-700 shadow-sm transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300"
        >
          <ArrowDown aria-hidden="true" className="h-3 w-3" />
          Jump to latest
        </button>
      )}

      {error && (
        <Alert
          tone="error"
          className="mx-4 mb-2 shrink-0 items-center"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {failedPayload && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submitReasoning(failedPayload)}
                  className="min-h-11 rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Retry sending
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() => void load()}
                className="min-h-11 px-2 text-xs font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                Reload saved progress
              </button>
            </div>
          }
        >
          {error}
        </Alert>
      )}

      {reasoning && (
        <footer className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:pb-6">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    loading ||
                    session.needsOpening ||
                    !session.allowedSupport.length
                  }
                  onClick={() => {
                    const level = nextSupportLevel(
                      session.allowedSupport,
                      session.supportHistory,
                      session.currentPhase,
                    );
                    if (level) void requestSupport(level);
                  }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-violet-100/70 px-3.5 py-2 font-medium text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-40 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:bg-violet-900"
                >
                  {busyAction === "hint" ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Lightbulb aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {busyAction === "hint" ? "Getting hint..." : "I need a hint"}
                  </span>
                </button>
                {session.allowedSupport.length > 1 && (
                  <span className="text-[11px] font-medium text-violet-700/80 dark:text-violet-300/80">
                    {supportTierLabel(
                      nextSupportLevel(
                        session.allowedSupport,
                        session.supportHistory,
                        session.currentPhase,
                      ),
                    )}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  aria-live="polite"
                  className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
                >
                  {accountSaveState === "sending"
                    ? "Sending to tutor..."
                    : accountSaveState === "saved_account"
                      ? "Saved to your account."
                      : accountSaveState === "error"
                        ? "Unable to save. Try again."
                        : draftSaveState === "saving"
                          ? "Saving draft locally..."
                          : draftSaveState === "saved_tab"
                            ? "Draft saved in this tab."
                            : draftSaveState === "error"
                              ? "Unable to save draft in this tab."
                              : null}
                </span>

                <button
                  type="button"
                  aria-expanded={showEquation}
                  aria-controls="chat-equation"
                  onClick={() => setShowEquation(!showEquation)}
                  className="min-h-11 rounded-lg px-2.5 py-1 text-slate-500 transition hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:text-slate-400 dark:hover:text-violet-200"
                >
                  {showEquation
                    ? "Hide equation"
                    : response.latex?.trim()
                      ? "Edit equation •"
                      : "Add equation"}
                </button>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitReasoning();
              }}
              className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-end gap-3">
                <textarea
                  ref={composerRef}
                  aria-label="Message your tutor"
                  placeholder="Type your response here…"
                  value={response.plainText}
                  maxLength={4000}
                  rows={2}
                  disabled={loading || session.needsOpening}
                  onChange={(event) => {
                    updateDraftResponse({
                      ...response,
                      plainText: event.target.value,
                    });
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void submitReasoning();
                    }
                  }}
                  className="max-h-36 min-h-12 w-full resize-none bg-transparent p-1 text-sm leading-6 outline-none placeholder:text-slate-400 disabled:opacity-60"
                />
                <Tooltip label="Send message">
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={
                      loading ||
                      session.needsOpening ||
                      hasInvalidMath ||
                      (!response.plainText.trim() && !response.latex?.trim())
                    }
                    className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-40"
                  >
                    {busyAction === "sending" ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip>
              </div>
              {hasInvalidMath && (
                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Fix or clear the mathematical notation warning before sending.
                </p>
              )}
              {showEquation && (
                <fieldset
                  id="chat-equation"
                  disabled={loading || session.needsOpening}
                  className="mt-3 max-h-[25dvh] overflow-y-auto border-t border-slate-100 pt-3 dark:border-slate-800"
                >
                  <MathInput
                    notationOnly
                    disabled={loading || session.needsOpening}
                    value={response}
                    onChange={(nextValue) => {
                      updateDraftResponse(nextValue);
                    }}
                    onSyntaxError={setMathSyntaxError}
                  />
                </fieldset>
              )}
            </form>
            <p className="mt-1.5 hidden text-[11px] text-slate-400 sm:block">
              Press Enter to send · Shift+Enter for a new line
            </p>
          </div>
        </footer>
      )}
    </SessionViewport>
  );
}

function firestoreProjection(id: string, data: Record<string, any>): SessionProjection {
  const millis = (value: any) =>
    value?.toMillis?.() ?? (typeof value === "number" ? value : Date.now());
  const currentPhase = data.currentPhase as SessionProjection["currentPhase"];
  const currentStage = solverStageForPhase(currentPhase);
  const gateStates = data.gateStates ?? {};
  const stageProgress = Object.fromEntries(
    SOLVER_STAGES.map((stage) => {
      const phases = SOLVER_STAGE_PHASES[stage];
      const acceptedGates = phases.filter(
        (phase) => gateStates[phase]?.status === "accepted",
      ).length;
      return [
        stage,
        {
          stage,
          acceptedGates,
          totalGates: phases.length,
          status:
            acceptedGates === phases.length
              ? "completed"
              : stage === currentStage
                ? "active"
                : "locked",
        },
      ];
    }),
  ) as SessionProjection["stageProgress"];
  return studentSession({
    needsOpening: data.needsOpening ?? false,
    scoringSource: data.scoringSource,
    id,
    schemaVersion: SCHEMA_VERSION,
    workflowVersion: WORKFLOW_VERSION,
    revision: Number(data.revision ?? 0),
    lastDiagnosis: data.lastDiagnosis ?? null,
    supportHistory: data.supportHistory ?? [],
    supportSummary: data.supportSummary ?? undefined,
    recoveryMode: Boolean(data.recoveryMode),
    studentId: data.studentId,
    subjectId: data.subjectId ?? "",
    topicId: data.topicId ?? "",
    subject: data.subject,
    topic: data.topic,
    difficulty: data.difficulty,
    problemId: data.problemId ?? null,
    originalQuestion: data.originalQuestion,
    status: data.status,
    currentPhase,
    currentStage,
    currentInternalGate: isReasoningPhase(currentPhase) ? currentPhase : null,
    currentPrompt: data.currentPrompt ?? promptFor(currentPhase),
    stageProgress,
    gates: data.gateEvaluations ?? {},
    allowedSupport: data.allowedSupport ?? ["socratic_prompt"],
    draft: data.draft ?? null,
    scorecard: data.scorecard ?? null,
    releasedSolution: data.releasedSolution ?? null,
    adaptiveRecommendation:
      data.adaptiveRecommendation ?? data.difficultyRecommendation ?? null,
    configurationVersions: data.configurationVersions ?? null,
    promptAdjustment: data.promptAdjustment ?? "maintain",
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    learningCompletedAt: data.learningCompletedAt
      ? millis(data.learningCompletedAt)
      : null,
  }) as SessionProjection;
}

function promptFor(phase: string): string {
  const prompts: Record<string, string> = {
    problem_understanding:
      "Restate the problem in your own words and identify what it asks you to determine.",
    relevant_information_identification:
      "Which values, variables, sets, propositions, or conditions are relevant, and what is unknown?",
    method_selection:
      "Which method, formula, theorem, or proof strategy should be used?",
    formula_theorem_justification:
      "Why do the formula or theorem conditions apply to this problem?",
    guided_computation_or_proof:
      "Show the next justified computation or proof step.",
    verification_and_checking:
      "How can you verify the calculation, cases, or logical conclusion?",
    result_interpretation:
      "What does the verified result mean in the context of the original problem?",
  };
  return (
    prompts[phase] ??
    "Complete the controlled support and formative scorecard stages."
  );
}

function nextSupportLevel(
  allowedSupport: SupportLevel[],
  supportHistory: SessionProjection["supportHistory"] = [],
  currentPhase?: string,
): SupportLevel | undefined {
  if (!allowedSupport.length) return undefined;
  const phaseLevels = new Set(
    (supportHistory ?? [])
      .filter(
        (entry) => !currentPhase || !entry.phase || entry.phase === currentPhase,
      )
      .map((entry) => entry.level),
  );
  const substantiveOrder: SupportLevel[] = [
    "targeted_hint",
    "stronger_hint",
    "partial_step",
  ];
  for (const candidate of substantiveOrder) {
    if (allowedSupport.includes(candidate) && !phaseLevels.has(candidate)) {
      return candidate;
    }
  }
  return allowedSupport.at(-1);
}

function supportTierLabel(level?: SupportLevel): string {
  const labels: Record<SupportLevel, string> = {
    socratic_prompt: "Socratic prompt unlocked",
    targeted_hint: "Level 1 · Conceptual hint unlocked",
    stronger_hint: "Level 2 · Strategic hint unlocked",
    partial_step: "Level 3 · Procedural hint unlocked",
    worked_explanation: "Worked explanation unlocked",
    full_solution: "Full solution unlocked",
  };
  return (level && labels[level]) || "Support unlocked";
}
