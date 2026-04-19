/**
 * Session screens — Part 2: Draft, Review, Log, Confirmation.
 *
 * These components handle the final stages of a Socratic session:
 * drafting answers, AI review, thinking log generation, and submission.
 *
 * @module components/SessionScreensPart2
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Check,
  Edit3,
  Download,
  Share,
  Save,
  FileText,
  CheckCircle2,
  FileCheck,
  ArrowRight,
  BrainCircuit,
  Activity,
  Loader2,
} from "lucide-react";
import { SessionLayout, StudentBubble, AIBubble } from "./SessionScreensPart1";
import { motion } from "motion/react";
import { useSessionStore } from "@/stores/session-store";
import { useAuthStore } from "@/stores/auth-store";
import { generateSummary, evaluateCTScore } from "@/lib/socratic-engine";

// ─── Draft Answer (Screen 12) ───────────────────────────────

/** Draft stage — student writes their answer and reflections. */
export function SessionDraft() {
  const navigate = useNavigate();
  const { activeSession, saveDraft, setStep } = useSessionStore();

  const [answer, setAnswer] = useState(activeSession?.draft?.answer || "");
  const [methodology, setMethodology] = useState(
    activeSession?.draft?.methodology || ""
  );
  const [reflection, setReflection] = useState(
    activeSession?.draft?.reflection || ""
  );

  if (!activeSession) {
    navigate("/student/task");
    return null;
  }

  /** Saves the draft and advances to the review stage. */
  function handleSubmitDraft() {
    if (!answer.trim()) return;

    saveDraft({
      answer: answer.trim(),
      methodology: methodology.trim(),
      reflection: reflection.trim(),
    });
    setStep("review");
    navigate("/session/review");
  }

  return (
    <SessionLayout
      progress={80}
      showMap={true}
      currentStepText="Step 4 of 5: Draft & Reflection"
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

      {/* Draft Form */}
      <div className="max-w-2xl mr-auto w-full mt-4">
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-6 ml-11">
          <div className="flex items-center gap-2 text-indigo-800 font-bold text-lg border-b border-indigo-200/50 pb-2">
            <Edit3 className="w-5 h-5" /> Draft Answer Stage
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-indigo-900 block">
                Write your current answer:
              </label>
              <textarea
                rows={3}
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
    setCTScore,
    setStep,
    setAIThinking,
    isAIThinking,
  } = useSessionStore();
  const [summary, setSummaryText] = useState<string | null>(null);
  const [score, setScoreValue] = useState<number | null>(null);
  const hasGenerated = useRef(false);

  // Auto-generate summary and CT score on mount
  useEffect(() => {
    if (hasGenerated.current || !activeSession?.draft) return;
    hasGenerated.current = true;

    async function generate() {
      if (!activeSession?.draft) return;
      setAIThinking(true);
      try {
        const [summaryResult, scoreResult] = await Promise.all([
          generateSummary(
            activeSession.originalQuestion,
            activeSession.messages,
            activeSession.draft
          ),
          evaluateCTScore(activeSession.messages, activeSession.hintsUsed),
        ]);

        setSummaryText(summaryResult);
        setScoreValue(scoreResult);
        setAISummary(summaryResult);
        setCTScore(scoreResult);
      } catch (err) {
        console.error("Failed to generate review:", err);
        setSummaryText(
          "Session completed. Your thinking log has been recorded."
        );
        setScoreValue(70);
        setAISummary("Session completed.");
        setCTScore(70);
      } finally {
        setAIThinking(false);
      }
    }

    generate();
  }, [activeSession, setAISummary, setCTScore, setAIThinking]);

  if (!activeSession) {
    navigate("/student/task");
    return null;
  }

  return (
    <SessionLayout
      progress={100}
      showMap={true}
      currentStepText="Step 5 of 5: Final Review"
      logicMapNodes={activeSession.logicMap}
    >
      {isAIThinking ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-500 font-medium">
            Generating your session review...
          </p>
        </div>
      ) : (
        <>
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

              {/* CT Score */}
              {score !== null && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-900">
                    Critical Thinking Score
                  </span>
                  <span className="text-2xl font-bold text-indigo-600">
                    {score}/100
                  </span>
                </div>
              )}
            </div>
          </AIBubble>

          <div className="max-w-2xl mx-auto w-full mt-6">
            <button
              onClick={() => {
                setStep("log");
                navigate("/session/log");
              }}
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

// ─── Thinking Log (Screen 14) ───────────────────────────────

/** Full thinking log view with chat history and session metadata. */
export function SessionLog() {
  const navigate = useNavigate();
  const { activeSession, submitSession, isLoading } = useSessionStore();
  const { userProfile } = useAuthStore();

  if (!activeSession) {
    navigate("/student/task");
    return null;
  }

  const initials = (userProfile?.displayName || "S")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  /** Submits the session to the teacher and navigates to confirmation. */
  async function handleSubmit() {
    await submitSession();
    navigate("/session/confirmation");
  }

  return (
    <div className="flex-1 w-full bg-slate-50 h-full overflow-y-auto p-4 md:p-8 pb-20">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
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

          {/* Chat History */}
          <div>
            <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-4 mt-8">
              Full Chat History
            </h3>
            <div className="space-y-4">
              {activeSession.messages.slice(0, 8).map((msg) => (
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
                    {msg.role === "student" ? initials : "SA"}
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

              {activeSession.messages.length > 8 && (
                <div className="py-4 text-center">
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                    {activeSession.messages.length - 8} Messages Hidden
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* CT Score */}
          {activeSession.ctScore > 0 && (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">
                  Critical Thinking Score
                </h3>
                <p className="text-sm text-slate-500">
                  Based on your reasoning process
                </p>
              </div>
              <span className="text-4xl font-bold text-indigo-600">
                {activeSession.ctScore}
                <span className="text-lg text-slate-400">/100</span>
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-slate-200">
            <button className="flex-1 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 font-bold py-3 px-4 rounded-xl transition-colors flex justify-center items-center gap-2">
              <Save className="w-5 h-5" /> Save Log
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Share className="w-5 h-5" /> Submit to Teacher
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
                  <BrainCircuit className="w-4 h-4" /> Critical Thinking
                </span>
                <span className="font-bold text-emerald-600">
                  {activeSession.ctScore} pts
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
