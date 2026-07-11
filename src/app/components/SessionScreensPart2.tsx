/**
 * Session screens — Part 2: Draft, Review, Log, Confirmation.
 *
 * These components handle the final stages of a Socratic session:
 * drafting answers, AI review, thinking log generation, and submission.
 *
 * @module components/SessionScreensPart2
 */

import { useState, useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  Check,
  Edit3,
  Share,
  Save,
  FileText,
  CheckCircle2,
  FileCheck,
  ArrowRight,
  BrainCircuit,
  Activity,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  SessionLayout,
  StudentBubble,
  AIBubble,
  ProgressiveSupportPanel,
} from "./SessionScreensPart1";
import { motion } from "motion/react";
import { useSessionStore } from "@/stores/session-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  generateSummary,
  getMindGuidePhaseLabel,
  getMindGuidePhaseProgress,
  isFinalAnswerUnlocked,
} from "@/lib/socratic-engine";
import {
  generateMindGuideScorecard,
  generateMindGuideScorecardWithFallback,
} from "@/lib/mindguide-scorecard";
import type { MindGuideScorecard } from "@/types";
import { getSessionPath } from "@/lib/session-routes";
import { AIRequestError } from "@/lib/gemini";

// ─── Draft Answer (Screen 12) ───────────────────────────────

/** Draft stage — student writes their answer and reflections. */
export function SessionDraft() {
  const navigate = useNavigate();
  const { activeSession, saveDraft, setStep, persistSession } = useSessionStore();

  const [answer, setAnswer] = useState(activeSession?.draft?.answer || "");
  const [methodology, setMethodology] = useState(
    activeSession?.draft?.methodology || ""
  );
  const [reflection, setReflection] = useState(
    activeSession?.draft?.reflection || ""
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }

  const sessionId = activeSession.id;

  if (!isFinalAnswerUnlocked(activeSession.currentPhase)) {
    return (
      <Navigate
        to={getSessionPath(activeSession.id, "questioning")}
        replace
      />
    );
  }

  /** Saves the draft and advances to the review stage. */
  async function handleSubmitDraft() {
    if (!answer.trim()) return;

    setSaveError(null);
    try {
      saveDraft({
        answer: answer.trim().slice(0, 4_000),
        methodology: methodology.trim().slice(0, 4_000),
        reflection: reflection.trim().slice(0, 2_000),
      });
      setStep("review");
      await persistSession();
      navigate(getSessionPath(sessionId, "review"));
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save your draft."
      );
    }
  }

  return (
    <SessionLayout
      progress={getMindGuidePhaseProgress(activeSession.currentPhase)}
      showMap={true}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
      logicMapNodes={activeSession.logicMap}
    >
      {/* Show latest messages for context */}
      {activeSession.messages.slice(-2).map((msg) =>
        msg.role === "student" ? (
          <StudentBubble key={msg.id} text={msg.content} />
        ) : (
          <AIBubble key={msg.id} text={msg.content} />
        )
      )}

      <ProgressiveSupportPanel />

      {/* Draft Form */}
      <div className="max-w-2xl mr-auto w-full mt-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-6 ml-11">
          <div className="flex items-center gap-2 text-indigo-800 font-bold text-lg border-b border-indigo-200/50 pb-2">
            <Edit3 className="w-5 h-5" /> Draft Answer Stage
          </div>

          {saveError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {saveError}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">
                Write your current answer:
              </label>
              <textarea
                rows={3}
                maxLength={4_000}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Write your answer here..."
                className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">
                Why did you choose this method?
              </label>
              <textarea
                rows={2}
                maxLength={4_000}
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
                placeholder="Explain your reasoning..."
                className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">
                What part was most difficult?
              </label>
              <textarea
                rows={2}
                maxLength={2_000}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Reflect on the challenge..."
                className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 bg-white"
              />
            </div>
          </div>

          <button
            onClick={handleSubmitDraft}
            disabled={!answer.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Draft Answer
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </SessionLayout>
  );
}

// ─── Final Review (Screen 13) ───────────────────────────────

/** AI reviews the session and generates a summary. */
export function SessionReview() {
  const navigate = useNavigate();
  const {
    activeSession,
    setAISummary,
    setMindGuideScorecard,
    addAIFallbackEvent,
    setStep,
    setAIThinking,
    persistSession,
    isAIThinking,
  } = useSessionStore();
  const [summary, setSummaryText] = useState<string | null>(
    activeSession?.aiSummary ?? null
  );
  const [scorecard, setScorecard] = useState<MindGuideScorecard | null>(
    activeSession?.mindGuideScorecard ?? null
  );
  const hasGenerated = useRef(false);
  const reviewControllerRef = useRef<AbortController | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Auto-generate summary and MINDGUIDE scorecard on mount
  useEffect(() => {
    if (hasGenerated.current || !activeSession?.draft) return;
    if (activeSession.aiSummary && activeSession.mindGuideScorecard) {
      hasGenerated.current = true;
      return;
    }
    hasGenerated.current = true;

    async function generate() {
      if (!activeSession?.draft) return;
      const controller = new AbortController();
      reviewControllerRef.current?.abort();
      reviewControllerRef.current = controller;
      setReviewError(null);
      setAIThinking(true);
      let summaryResult: string;
      let scorecardResult: MindGuideScorecard;
      let fallbackEvent: Awaited<
        ReturnType<typeof generateMindGuideScorecardWithFallback>
      >["fallbackEvent"];

      try {
        summaryResult = await generateSummary(
          activeSession.originalQuestion,
          activeSession.messages,
          activeSession.draft,
          controller.signal
        );
        const scorecardResponse =
          await generateMindGuideScorecardWithFallback(activeSession, {
            signal: controller.signal,
          });
        scorecardResult = scorecardResponse.scorecard;
        fallbackEvent = scorecardResponse.fallbackEvent;
      } catch (error) {
        if (
          activeSession.problemMode === "free_form" ||
          error instanceof AIRequestError
        ) {
          setReviewError(
            error instanceof Error
              ? error.message
              : "The free-form formative review could not be generated."
          );
          if (reviewControllerRef.current === controller) {
            reviewControllerRef.current = null;
          }
          setAIThinking(false);
          return;
        }

        summaryResult =
          "AI summary was unavailable. Your complete reasoning log is still recorded below.";
        scorecardResult = generateMindGuideScorecard(activeSession);
        fallbackEvent = undefined;
      }

      setAISummary(summaryResult);
      setMindGuideScorecard(scorecardResult);
      if (fallbackEvent) {
        addAIFallbackEvent(fallbackEvent);
      }
      try {
        await persistSession();
        setSummaryText(summaryResult);
        setScorecard(scorecardResult);
      } catch (persistError) {
        const restored = useSessionStore.getState().activeSession;
        setSummaryText(restored?.aiSummary ?? null);
        setScorecard(restored?.mindGuideScorecard ?? null);
        setReviewError(
          persistError instanceof Error
            ? persistError.message
            : "The formative review could not be saved."
        );
      } finally {
        if (reviewControllerRef.current === controller) {
          reviewControllerRef.current = null;
        }
        setAIThinking(false);
      }
    }

    generate();
  }, [
    activeSession,
    persistSession,
    setAISummary,
    addAIFallbackEvent,
    setMindGuideScorecard,
    setAIThinking,
    retryNonce,
  ]);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }

  return (
    <SessionLayout
      progress={getMindGuidePhaseProgress(activeSession.currentPhase)}
      showMap={true}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
      logicMapNodes={activeSession.logicMap}
    >
      {isAIThinking ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-500 font-medium">
            Generating your session review...
          </p>
          <button
            type="button"
            onClick={() => reviewControllerRef.current?.abort()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel review generation
          </button>
        </div>
      ) : (
        <>
          {reviewError && (
            <div className="mx-auto mb-4 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{reviewError}</span>
              </div>
              {!scorecard && (
                <button
                  type="button"
                  onClick={() => {
                    hasGenerated.current = false;
                    setRetryNonce((value) => value + 1);
                  }}
                  className="mt-3 rounded-lg bg-red-100 px-3 py-2 font-bold hover:bg-red-200"
                >
                  Retry formative review
                </button>
              )}
            </div>
          )}
          <AIBubble>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg w-max font-bold text-sm border border-emerald-100">
                <CheckCircle2 className="w-4 h-4" /> Great job!
              </div>

              {summary && (
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  {summary}
                </p>
              )}

              {/* Steps summary from logic map */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-slate-800 text-sm">
                  Summary of your steps:
                </h4>
                <ul className="text-sm text-slate-600 space-y-2 font-medium">
                  {activeSession.logicMap.map((node) => (
                    <li key={node.step} className="flex items-start gap-2">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                          node.completed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {node.completed ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          node.step
                        )}
                      </div>
                      {node.title}
                      {node.description && `: ${node.description}`}
                    </li>
                  ))}

                  {activeSession.draft && (
                    <li className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        <Check className="w-3 h-3" />
                      </div>
                      Final Draft:{" "}
                      <span className="font-bold text-slate-800 ml-1">
                        {activeSession.draft.answer}
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              {scorecard && <MindGuideScorecardPanel scorecard={scorecard} />}
            </div>
          </AIBubble>

          <div className="max-w-2xl mx-auto w-full mt-6">
            <button
              onClick={async () => {
                setReviewError(null);
                setStep("log");
                try {
                  await persistSession();
                  navigate(getSessionPath(activeSession.id, "log"));
                } catch (error) {
                  setReviewError(
                    error instanceof Error
                      ? error.message
                      : "The review could not be saved."
                  );
                }
              }}
              disabled={!scorecard}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-indigo-200/50 flex items-center justify-center gap-2 text-lg"
            >
              View Thinking Log
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </SessionLayout>
  );
}

function MindGuideScorecardPanel({
  scorecard,
}: {
  scorecard: MindGuideScorecard;
}) {
  const rows = [
    ["Accuracy", scorecard.accuracy],
    ["Logical Validity", scorecard.logicalValidity],
    ["Method Selection", scorecard.methodSelection],
    ["Formula/Theorem Justification", scorecard.justificationQuality],
    ["Interpretation Quality", scorecard.interpretationQuality],
  ] as const;

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-bold text-indigo-950 text-sm">
          Critical Thinking Scorecard
        </h4>
        <span className="text-2xl font-bold text-indigo-600">
          {scorecard.total}/100
        </span>
      </div>
      <div className="grid gap-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between text-sm font-medium text-indigo-950"
          >
            <span>{label}</span>
            <span className="font-bold">{value}/20</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-indigo-950 font-medium leading-relaxed border-t border-indigo-200 pt-3">
        Feedback: {scorecard.feedback}
      </p>
      <p className="text-xs font-semibold text-indigo-700">
        Formative AI feedback only — this score is not an official grade.
      </p>
    </div>
  );
}

// ─── Thinking Log (Screen 14) ───────────────────────────────

/** Full thinking log view with chat history and session metadata. */
export function SessionLog() {
  const navigate = useNavigate();
  const { activeSession, submitSession, isLoading } = useSessionStore();
  const { userProfile } = useAuthStore();
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }

  const scorecard = activeSession.mindGuideScorecard;

  const initials = (userProfile?.displayName || "S")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  /** Submits the session for system admin review and navigates to confirmation. */
  async function handleSubmit() {
    if (!activeSession || activeSession.status !== "in_progress") return;

    setSubmissionError(null);
    try {
      await submitSession();
      navigate(getSessionPath(activeSession.id, "confirmation"));
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "The thinking log could not be submitted. Please retry."
      );
    }
  }

  return (
    <div className="thinking-log-print flex-1 w-full bg-slate-50 h-full overflow-y-auto p-4 md:p-8 pb-20">
      <div className="print-document max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-white flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Thinking Log Generated</h1>
            <p className="text-indigo-200 mt-1">
              Session: {activeSession.subject} • {activeSession.topic}
            </p>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <FileText className="w-8 h-8 text-white" />
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Original Question */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-2">
              Original Question
            </h3>
            <p className="text-slate-800 font-medium text-lg">
              {activeSession.originalQuestion}
            </p>
          </div>

          {/* AI Summary */}
          {activeSession.aiSummary && (
            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
              <h3 className="font-bold text-indigo-500 text-xs uppercase tracking-wider mb-2">
                AI Session Summary
              </h3>
              <p className="text-indigo-900 font-medium">
                {activeSession.aiSummary}
              </p>
            </div>
          )}

          {/* Student Reflection */}
          {activeSession.draft && (
            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-3">
              <h3 className="font-bold text-emerald-500 text-xs uppercase tracking-wider mb-2">
                Student Reflection
              </h3>
              <div className="space-y-2">
                <p className="text-sm text-emerald-900">
                  <span className="font-bold">Answer:</span>{" "}
                  {activeSession.draft.answer}
                </p>
                {activeSession.draft.methodology && (
                  <p className="text-sm text-emerald-900">
                    <span className="font-bold">Method:</span>{" "}
                    {activeSession.draft.methodology}
                  </p>
                )}
                {activeSession.draft.reflection && (
                  <p className="text-sm text-emerald-900 italic">
                    <span className="font-bold not-italic">Reflection:</span>{" "}
                    "{activeSession.draft.reflection}"
                  </p>
                )}
              </div>
            </div>
          )}

          {activeSession.hints.length > 0 && (
            <div className="bg-violet-50 p-6 rounded-2xl border border-violet-100 space-y-3">
              <h3 className="font-bold text-violet-700 text-xs uppercase tracking-wider">
                Hints and Progressive Support Used
              </h3>
              <ol className="space-y-2">
                {activeSession.hints.map((hint) => (
                  <li key={hint.id} className="text-sm text-violet-950">
                    <span className="font-bold">
                      Level {hint.level} ·{" "}
                      {hint.source === "progressive_unlock"
                        ? "Progressive support"
                        : "AI hint"}
                      :
                    </span>{" "}
                    {hint.content}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {activeSession.logicMap.length > 0 && (
            <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 space-y-3">
              <h3 className="font-bold text-amber-700 text-xs uppercase tracking-wider">
                Logic Map
              </h3>
              <ol className="space-y-3">
                {activeSession.logicMap.map((node) => (
                  <li key={node.step} className="text-sm text-amber-950">
                    <span className="font-bold">
                      {node.step}. {node.title}:
                    </span>{" "}
                    {node.description}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Chat History */}
          <div>
            <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-4 mt-8">
              Full Chat History
            </h3>
            <div className="space-y-4">
              {activeSession.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 items-start ${
                    msg.role === "ai" ? "flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold text-xs mt-1 ${
                      msg.role === "student"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-indigo-600 text-white"
                    }`}
                  >
                    {msg.role === "student" ? initials : "MG"}
                  </div>
                  <div
                    className={`rounded-xl p-3 border ${
                      msg.role === "student"
                        ? "bg-slate-50 border-slate-100"
                        : "bg-indigo-50 border-indigo-100"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        msg.role === "student"
                          ? "text-slate-800"
                          : "text-indigo-900"
                      }`}
                    >
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}

            </div>
          </div>

          {scorecard && (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <MindGuideScorecardPanel scorecard={scorecard} />
            </div>
          )}

          {activeSession.adminReview && (
            <div className="bg-sky-50 p-6 rounded-2xl border border-sky-100 space-y-2">
              <h3 className="font-bold text-sky-700 text-xs uppercase tracking-wider">
                System Administrator Review
              </h3>
              <p className="text-sm font-semibold capitalize text-sky-950">
                Outcome: {activeSession.adminReview.outcome}
              </p>
              <p className="text-sm text-sky-950">
                {activeSession.adminReview.comment}
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-500 border-t border-slate-200 pt-5">
            <p>Created: {activeSession.createdAt.toDate().toLocaleString()}</p>
            <p>
              Submitted:{" "}
              {activeSession.submittedAt
                ? activeSession.submittedAt.toDate().toLocaleString()
                : "Not yet submitted"}
            </p>
            {activeSession.reviewedAt && (
              <p>Reviewed: {activeSession.reviewedAt.toDate().toLocaleString()}</p>
            )}
            <p>Session ID: {activeSession.id}</p>
          </div>

          {submissionError && (
            <div
              role="alert"
              className="print:hidden flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{submissionError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="print:hidden flex flex-col sm:flex-row gap-4 pt-6 border-t border-slate-200">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 font-bold py-3 px-4 rounded-xl transition-colors flex justify-center items-center gap-2"
            >
              <Save className="w-5 h-5" /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading || activeSession.status !== "in_progress"}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : activeSession.status !== "in_progress" ? (
                <>
                  <CheckCircle2 className="w-5 h-5" /> Already Submitted
                </>
              ) : (
                <>
                  <Share className="w-5 h-5" /> Submit to System Admin
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirmation (Screen 15) ───────────────────────────────

/** Success screen after submitting the thinking log. */
export function SessionConfirmation() {
  const navigate = useNavigate();
  const { activeSession, clearActiveSession } = useSessionStore();

  /** Returns to dashboard and clears session state. */
  function handleReturnToDashboard() {
    clearActiveSession();
    navigate("/student/dashboard");
  }

  /** Starts a new session. */
  function handleNewSession() {
    clearActiveSession();
    navigate("/student/task");
  }

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }

  if (activeSession.status === "in_progress") {
    return <Navigate to={getSessionPath(activeSession.id, "log")} replace />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 h-full p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100 text-center space-y-8"
      >
        <div className="mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
          >
            <FileCheck className="w-12 h-12 text-emerald-600" />
          </motion.div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">
            Successfully Submitted!
          </h2>
          <p className="text-slate-500 font-medium">
            Your Thinking Log has been sent for review.
          </p>
        </div>

        {activeSession && (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
            <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider text-left border-b border-slate-200 pb-2">
              Session Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm font-medium flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4" /> Scorecard Total
                </span>
                <span className="font-bold text-emerald-600">
                  {activeSession.mindGuideScorecard?.total ??
                    activeSession.ctScore} pts
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Messages Exchanged
                </span>
                <span className="font-bold text-slate-900">
                  {activeSession.messages.length}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 pt-4">
          <button
            onClick={handleReturnToDashboard}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-colors shadow-md"
          >
            Return to Dashboard
          </button>
          <button
            onClick={handleNewSession}
            className="w-full bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-100 font-bold py-3.5 rounded-xl transition-colors shadow-sm"
          >
            Start New Session
          </button>
        </div>
      </motion.div>
    </div>
  );
}
