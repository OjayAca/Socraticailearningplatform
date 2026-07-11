/**
 * Session screens — Part 1: Trigger, Questioning, Hints, Logic Map.
 *
 * These components manage the interactive Socratic conversation between
 * the student and the AI. All messages are stored in the Zustand session store
 * and sent to the Gemini/Ollama AI engine for real responses.
 *
 * @module components/SessionScreensPart1
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  X,
  Send,
  Lightbulb,
  Map,
  CheckCircle2,
  HelpCircle,
  Loader2,
  AlertCircle,
  Unlock,
} from "lucide-react";
import { motion } from "motion/react";
import { useSessionStore } from "@/stores/session-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  startSession,
  sendStudentResponse,
  generateHint,
  extractLogicMap,
  getMindGuidePhaseLabel,
  getMindGuidePhaseProgress,
  isFinalAnswerUnlocked,
} from "@/lib/socratic-engine";
import {
  canUnlockNextSupport,
  getUnlockedSupport,
} from "@/lib/progressive-unlock";
import { getSessionPath } from "@/lib/session-routes";
import type { ChatMessage, LogicMapNode, MindGuidePhase } from "@/types";

// ─── Session Layout ─────────────────────────────────────────

/**
 * Shared layout for all session screens.
 * Provides header with progress, main chat area, and optional logic map panel.
 */
export function SessionLayout({
  children,
  progress,
  showMap = false,
  currentStepText,
  logicMapNodes = [],
}: {
  children: React.ReactNode;
  progress: number;
  showMap?: boolean;
  currentStepText: string;
  logicMapNodes?: LogicMapNode[];
}) {
  const navigate = useNavigate();
  const { activeSession, error, clearError } = useSessionStore();

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Main Workspace Area */}
      <div
        className={`flex flex-col flex-1 ${
          showMap ? "w-2/3 border-r border-slate-200" : "w-full"
        } transition-all duration-300`}
      >
        {/* Top Header */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                MG
              </div>
              <div>
                <h1 className="font-bold text-slate-800">
                  Socratic Session: {activeSession?.subject || ""}
                </h1>
                <p className="text-sm text-slate-500 font-medium">
                  {activeSession?.topic || ""}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/student/dashboard")}
              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              title="Exit Session"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>
                {activeSession?.currentPhase
                  ? getMindGuidePhaseLabel(activeSession.currentPhase)
                  : currentStepText}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </header>

        {/* Chat / Interaction Area */}
        <div className="flex-1 bg-slate-50 overflow-y-auto p-6 pb-20 flex flex-col gap-6 scroll-smooth">
          {error && (
            <div
              role="alert"
              className="mx-auto flex w-full max-w-2xl items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="shrink-0 rounded-md px-2 py-1 font-semibold hover:bg-red-100"
              >
                Dismiss
              </button>
            </div>
          )}
          {showMap && (
            <details className="lg:hidden rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                View logic map ({logicMapNodes.length} steps)
              </summary>
              <ol className="mt-4 space-y-3">
                {logicMapNodes.length ? (
                  logicMapNodes.map((node) => (
                    <li
                      key={node.step}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                    >
                      <span className="font-bold text-slate-800">
                        {node.step}. {node.title}
                      </span>
                      {node.description && (
                        <p className="mt-1 text-slate-600">{node.description}</p>
                      )}
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-slate-500">
                    The map will appear after your reasoning is analyzed.
                  </li>
                )}
              </ol>
            </details>
          )}
          {children}
        </div>
      </div>

      {/* Logic Map Panel */}
      {showMap && (
        <div className="w-1/3 bg-white flex flex-col border-l border-slate-200 hidden lg:flex">
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Map className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">Logic Map</h2>
          </div>
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="relative pl-6 space-y-8 before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {logicMapNodes.map((node) => (
                <div
                  key={node.step}
                  className="relative flex items-center justify-between group"
                >
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded-full border border-white shadow shrink-0 z-10 font-bold text-xs -ml-[11px] ${
                      node.completed
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {node.step}
                  </div>
                  <div
                    className={`w-[calc(100%-2rem)] p-4 rounded-xl border shadow-sm ${
                      node.completed
                        ? "bg-white border-indigo-100 shadow-indigo-50"
                        : "bg-slate-50 border-slate-200 border-dashed"
                    }`}
                  >
                    <h3
                      className={`text-sm ${
                        node.completed
                          ? "font-bold text-slate-800"
                          : "font-semibold text-slate-500"
                      }`}
                    >
                      {node.title}
                    </h3>
                    {node.description && (
                      <p className="text-xs text-slate-500 mt-1">
                        {node.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {logicMapNodes.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">
                  Logic map will appear as you work through the problem...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat Bubble Components ─────────────────────────────────

/** Renders a student message bubble (right-aligned, indigo). */
export function StudentBubble({ text }: { text: string }) {
  const { userProfile } = useAuthStore();
  const initials = (userProfile?.displayName || "S")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end gap-3 w-full max-w-2xl ml-auto"
    >
      <div className="bg-indigo-600 text-white p-4 rounded-2xl rounded-tr-sm shadow-sm shadow-indigo-100/50 flex-1">
        <p className="text-sm font-medium leading-relaxed">{text}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center text-indigo-700 font-bold text-xs shadow-sm">
        {initials}
      </div>
    </motion.div>
  );
}

/** Renders an AI message bubble (left-aligned, white). */
export function AIBubble({
  text,
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 w-full max-w-2xl mr-auto"
    >
      <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs shadow-sm shadow-slate-100">
        MG
      </div>
      <div className="bg-white p-4 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm shadow-slate-100 flex-1 space-y-4">
        {text && (
          <p className="text-sm text-slate-700 font-medium leading-relaxed">
            {text}
          </p>
        )}
        {children}
      </div>
    </motion.div>
  );
}

/** AI thinking indicator (animated dots). */
function AIThinking() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-3 w-full max-w-2xl mr-auto"
    >
      <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex-shrink-0 flex items-center justify-center text-indigo-600 font-bold text-xs shadow-sm shadow-slate-100">
        MG
      </div>
      <div className="bg-white p-4 rounded-2xl rounded-tl-sm border border-slate-200 shadow-sm flex items-center gap-1.5">
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </motion.div>
  );
}

// ─── Chat Input ─────────────────────────────────────────────

/** Chat input textarea with send button. */
function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your response here...",
}: {
  onSend: (message: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  async function handleSend() {
    if (!input.trim() || disabled) return;
    try {
      await onSend(input.trim());
      setInput("");
    } catch {
      // Parent surfaces the actionable error and the response stays editable.
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-end gap-2 max-w-2xl w-full mx-auto mt-auto">
      <textarea
        rows={2}
        maxLength={2_000}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="w-full resize-none outline-none p-3 text-sm text-slate-800 disabled:opacity-50"
        placeholder={placeholder}
      />
      <div className="flex flex-col gap-2 p-1">
        <button
          onClick={() => void handleSend()}
          disabled={disabled || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition-colors shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <span className="pb-2 pr-2 text-[10px] font-medium text-slate-400">
        {input.length}/2000
      </span>
    </div>
  );
}

/** Shows progressively unlocked support from the selected prepared problem. */
export function ProgressiveSupportPanel() {
  const { activeSession, isAIThinking, setUnlockLevel, addHint, persistSession } =
    useSessionStore();

  if (!activeSession?.selectedProblem) return null;

  const support = getUnlockedSupport(
    activeSession.selectedProblem,
    activeSession.unlockLevel
  );
  const unlockGate = canUnlockNextSupport(activeSession);

  return (
    <div className="max-w-2xl mx-auto w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Unlock className="w-4 h-4 text-indigo-600" />
            Progressive Support
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Level {activeSession.unlockLevel}/5 unlocked
          </p>
        </div>
        <button
          onClick={async () => {
            const nextSupport = getUnlockedSupport(
              activeSession.selectedProblem!,
              unlockGate.nextLevel
            ).items.find((item) => item.level === unlockGate.nextLevel);
            setUnlockLevel(unlockGate.nextLevel);
            if (nextSupport) {
              addHint(
                `${nextSupport.title}: ${nextSupport.content.join(" ")}`,
                nextSupport.level,
                "progressive_unlock"
              );
            }
            await persistSession();
          }}
          disabled={!unlockGate.canUnlock || isAIThinking}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-semibold text-xs transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Unlock Next Support
        </button>
      </div>

      {unlockGate.reason && (
        <p className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2">
          {unlockGate.reason}
        </p>
      )}

      {support.items.length === 0 ? (
        <p className="text-sm text-slate-500">
          No support unlocked yet. Try the current reasoning prompt first.
        </p>
      ) : (
        <div className="space-y-3">
          {support.items.map((item) => (
            <div
              key={item.level}
              className="bg-indigo-50 border border-indigo-100 rounded-xl p-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">
                Level {item.level}: {item.title}
              </h3>
              <div className="space-y-2">
                {item.content.map((line, index) => (
                  <p
                    key={`${item.level}-${index}`}
                    className="text-sm text-indigo-950 font-medium leading-relaxed"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Session Trigger (Screen 7) ─────────────────────────────

/**
 * The opening of a session — the AI receives the student's question
 * and returns the first Socratic probe.
 */
export function SessionTrigger() {
  const navigate = useNavigate();
  const {
    activeSession,
    addMessage,
    setStep,
    setPhase,
    setAIThinking,
    persistSession,
    isAIThinking,
  } = useSessionStore();
  const persistedOpening = activeSession?.messages.find(
    (message) =>
      message.role === "ai" &&
      message.metadata?.messageType === "opening_prompt"
  );
  const [aiResponse, setAiResponse] = useState<string | null>(
    persistedOpening?.content ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Auto-start the session on mount
  useEffect(() => {
    if (hasStarted.current || !activeSession) return;
    const existingOpening = activeSession.messages.find(
      (message) =>
        message.role === "ai" &&
        message.metadata?.messageType === "opening_prompt"
    );
    if (existingOpening) {
      hasStarted.current = true;
      return;
    }
    hasStarted.current = true;

    async function initSession() {
      if (!activeSession) return;
      setError(null);
      setAIThinking(true);
      try {
        const response = await startSession(
          activeSession.subject,
          activeSession.topic,
          activeSession.originalQuestion,
          activeSession.selectedProblem
        );
        setAiResponse(response);
        setPhase("problem_understanding");

        // Add the student's original question as first message
        if (
          !activeSession.messages.some(
            (message) => message.metadata?.messageType === "original_question"
          )
        ) {
          addMessage({
            id: `msg-${Date.now()}-student`,
            role: "student",
            content: activeSession.originalQuestion,
            timestamp: Date.now(),
            metadata: { messageType: "original_question" },
          });
        }
        // Add AI's response
        addMessage({
          id: `msg-${Date.now()}-ai`,
          role: "ai",
          content: response,
          timestamp: Date.now(),
          metadata: { messageType: "opening_prompt" },
        });
        await persistSession();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to start AI session"
        );
      } finally {
        setAIThinking(false);
      }
    }

    initSession();
  }, [
    activeSession,
    addMessage,
    persistSession,
    retryNonce,
    setAIThinking,
    setPhase,
  ]);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }
  return (
    <SessionLayout
      progress={getMindGuidePhaseProgress(activeSession.currentPhase)}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
    >
      <StudentBubble text={activeSession.originalQuestion} />

      {isAIThinking && <AIThinking />}

      {error && (
        <div className="max-w-2xl mr-auto ml-11 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              hasStarted.current = false;
              setRetryNonce((value) => value + 1);
            }}
            className="mt-3 rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
          >
            Retry AI connection
          </button>
        </div>
      )}

      {aiResponse && (
        <AIBubble>
          <div className="space-y-4">
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              {aiResponse}
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={async () => {
                  setStep("questioning");
                  await persistSession();
                  navigate(getSessionPath(activeSession.id, "questioning"));
                }}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Continue to Questioning
              </button>
              <button
                onClick={() => navigate("/student/dashboard")}
                className="text-slate-500 hover:text-slate-700 px-4 py-2 font-semibold text-sm"
              >
                Exit Session
              </button>
            </div>
          </div>
        </AIBubble>
      )}
    </SessionLayout>
  );
}

// ─── Session Questioning (Screen 8) ─────────────────────────

/** The main interactive chat — real AI-powered Socratic questioning. */
export function SessionQuestioning() {
  const navigate = useNavigate();
  const {
    activeSession,
    addMessage,
    setStep,
    setPhase,
    setDiagnosisResult,
    addAIFallbackEvent,
    setAIThinking,
    persistSession,
    isAIThinking,
  } = useSessionStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const exchangeCount =
    activeSession?.messages.filter(
      (message) =>
        message.role === "student" &&
        message.metadata?.messageType === "phase_response"
    ).length ?? 0;

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages.length, isAIThinking, scrollToBottom]);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }
  const session = activeSession;

  async function requestAIResponse(
    studentMsg: ChatMessage,
    responsePhase: MindGuidePhase
  ) {
    const controller = new AbortController();
    requestControllerRef.current?.abort();
    requestControllerRef.current = controller;
    setRequestError(null);
    setAIThinking(true);

    try {
      const currentSession =
        useSessionStore.getState().activeSession ?? session;
      const conversationWithStudent = currentSession.messages.some(
        (entry) => entry.id === studentMsg.id
      )
        ? currentSession.messages
        : [...currentSession.messages, studentMsg];
      const {
        message: aiText,
        nextPhase,
        diagnosis,
        aiFallbackEvent,
      } = await sendStudentResponse(
        conversationWithStudent,
        studentMsg.content,
        {
        currentPhase: responsePhase,
        selectedProblem: currentSession.selectedProblem,
        subject: currentSession.subject,
        topic: currentSession.topic,
        originalQuestion: currentSession.originalQuestion,
        phaseResponses: currentSession.phaseResponses,
        hintsUsed: currentSession.hintsUsed,
        unlockLevel: currentSession.unlockLevel,
        problemMode: currentSession.problemMode,
        freeFormAnalysis:
          currentSession.problemContext.mode === "free_form"
            ? currentSession.problemContext.analysis
            : undefined,
        signal: controller.signal,
        }
      );

      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: "ai",
        content: aiText,
        timestamp: Date.now(),
        metadata: diagnosis ? { diagnosis } : undefined,
      };
      addMessage(aiMsg);
      setDiagnosisResult(diagnosis ?? null);
      if (aiFallbackEvent) {
        addAIFallbackEvent(aiFallbackEvent);
      }
      if (nextPhase) {
        setPhase(nextPhase);
      }
      await persistSession();
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "The response could not be saved. Please try again."
      );
      throw error;
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setAIThinking(false);
    }
  }

  /** Persists a student response before requesting its matching AI reply. */
  async function handleSendMessage(message: string) {
    const responsePhase = session.currentPhase;
    const studentMsg: ChatMessage = {
      id: `msg-${Date.now()}-student`,
      role: "student",
      content: message,
      timestamp: Date.now(),
      metadata: {
        messageType: "phase_response",
        phase: responsePhase,
      },
    };

    setRequestError(null);
    try {
      addMessage(studentMsg);
      await persistSession();
      await requestAIResponse(studentMsg, responsePhase);
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "The response could not be saved. Please try again."
      );
      throw error;
    }
  }

  const pendingStudentMessage =
    activeSession.messages.at(-1)?.role === "student"
      ? activeSession.messages.at(-1) ?? null
      : null;

  const progress = getMindGuidePhaseProgress(activeSession.currentPhase);
  const finalAnswerUnlocked = isFinalAnswerUnlocked(activeSession.currentPhase);

  return (
    <SessionLayout
      progress={progress}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
    >
      {/* Render all messages */}
      {activeSession.messages.map((msg) =>
        msg.role === "student" ? (
          <StudentBubble key={msg.id} text={msg.content} />
        ) : (
          <AIBubble key={msg.id} text={msg.content} />
        )
      )}

      {isAIThinking && (
        <>
          <AIThinking />
          <button
            type="button"
            onClick={() => requestControllerRef.current?.abort()}
            className="mx-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel AI request
          </button>
        </>
      )}

      <div ref={chatEndRef} />

      <div className="mt-auto">
        {requestError && (
          <div className="mx-auto mb-3 max-w-2xl rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <p>{requestError}</p>
            {pendingStudentMessage && (
              <button
                type="button"
                onClick={() => {
                  const phase =
                    (pendingStudentMessage.metadata?.phase as MindGuidePhase) ??
                    activeSession.currentPhase;
                  void persistSession()
                    .then(() => requestAIResponse(pendingStudentMessage, phase))
                    .catch((error) =>
                      setRequestError(
                        error instanceof Error
                          ? error.message
                          : "The response could not be retried."
                      )
                    );
                }}
                className="mt-2 rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
              >
                Retry AI response
              </button>
            )}
          </div>
        )}
        <div className="max-w-2xl mx-auto flex justify-between mb-2">
          <button
            onClick={async () => {
              setStep("hints");
              await persistSession();
              navigate(getSessionPath(activeSession.id, "hints"));
            }}
            disabled={isAIThinking}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            <HelpCircle className="w-3.5 h-3.5" /> I need a hint
          </button>

          {finalAnswerUnlocked ? (
            <button
              onClick={async () => {
                setStep("draft");
                await persistSession();
                navigate(getSessionPath(activeSession.id, "draft"));
              }}
              disabled={isAIThinking}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready to draft
            </button>
          ) : (
            exchangeCount >= 2 && (
              <button
                onClick={async () => {
                  setStep("logic_map");
                  await persistSession();
                  navigate(getSessionPath(activeSession.id, "logic_map"));
                }}
                disabled={isAIThinking}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> View logic map
              </button>
            )
          )}
        </div>
        <ProgressiveSupportPanel />
        <ChatInput onSend={handleSendMessage} disabled={isAIThinking} />
      </div>
    </SessionLayout>
  );
}

// ─── Session Hints (Screen 10) ──────────────────────────────

/** Progressive hint screen — generates hints via AI. */
export function SessionHints() {
  const navigate = useNavigate();
  const {
    activeSession,
    addHint,
    setStep,
    persistSession,
    setAIThinking,
    isAIThinking,
  } = useSessionStore();
  const [hintError, setHintError] = useState<string | null>(null);
  const hintControllerRef = useRef<AbortController | null>(null);
  const hasRequestedFirstHint = useRef(false);
  const hints = (activeSession?.hints ?? []).filter(
    (hint) => hint.source === "ai"
  );
  const currentLevel = hints.reduce(
    (highest, hint) => Math.max(highest, hint.level),
    0
  );

  /** Generates the next hint level. */
  async function handleGetHint() {
    if (!activeSession) return;
    const nextLevel = currentLevel + 1;
    if (nextLevel > 3) return;

    const controller = new AbortController();
    hintControllerRef.current?.abort();
    hintControllerRef.current = controller;
    setHintError(null);
    setAIThinking(true);
    try {
      const hint = await generateHint(
        nextLevel,
        activeSession.originalQuestion,
        activeSession.messages,
        controller.signal
      );
      addHint(hint, nextLevel);
      await persistSession();
    } catch (error) {
      setHintError(
        error instanceof Error
          ? error.message
          : "Could not generate a hint right now. Please try again."
      );
    } finally {
      if (hintControllerRef.current === controller) {
        hintControllerRef.current = null;
      }
      setAIThinking(false);
    }
  }

  // Auto-generate first hint on mount
  useEffect(() => {
    if (
      activeSession &&
      hints.length === 0 &&
      !hasRequestedFirstHint.current
    ) {
      hasRequestedFirstHint.current = true;
      void handleGetHint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }

  return (
    <SessionLayout
      progress={getMindGuidePhaseProgress(activeSession.currentPhase)}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
    >
      {/* Show recent messages for context */}
      {activeSession.messages.slice(-2).map((msg) =>
        msg.role === "student" ? (
          <StudentBubble key={msg.id} text={msg.content} />
        ) : (
          <AIBubble key={msg.id} text={msg.content} />
        )
      )}

      {/* Hint Panel */}
      <div className="max-w-2xl mr-auto w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm ml-11 space-y-4">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
            <Lightbulb className="w-4 h-4" /> Progressive Hints
          </div>

          <div className="space-y-3">
            {hints.map((hint, idx) => (
              <div key={hint.id} className="flex gap-3 items-start">
                <span className="w-5 h-5 bg-amber-200 text-amber-800 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-sm text-amber-900 font-medium">
                  {hint.content}
                </p>
              </div>
            ))}
            {hintError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                {hintError}
              </div>
            )}
            {isAIThinking && (
              <div className="flex items-center justify-between gap-3">
                <span className="flex gap-3 items-center">
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                  <span className="text-sm text-amber-700">
                    Generating hint...
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => hintControllerRef.current?.abort()}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            {currentLevel < 3 && (
              <button
                onClick={handleGetHint}
                disabled={isAIThinking}
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Need More Help ({currentLevel}/3)
              </button>
            )}
            <button
              onClick={async () => {
                setStep("questioning");
                await persistSession();
                navigate(getSessionPath(activeSession.id, "questioning"));
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Got it, Try Again
            </button>
          </div>
        </div>
      </div>
      <ProgressiveSupportPanel />
    </SessionLayout>
  );
}

// ─── Logic Map (Screen 11) ──────────────────────────────────

/** Logic map screen — AI extracts reasoning steps from conversation. */
export function SessionLogicMap() {
  const navigate = useNavigate();
  const {
    activeSession,
    addMessage,
    setStep,
    setPhase,
    setDiagnosisResult,
    addAIFallbackEvent,
    setAIThinking,
    isAIThinking,
    updateLogicMap,
    persistSession,
  } = useSessionStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [mapNodes, setMapNodes] = useState<LogicMapNode[]>(
    activeSession?.logicMap || []
  );
  const [mapError, setMapError] = useState<string | null>(null);
  const [requestError, setLogicRequestError] = useState<string | null>(null);
  const [mapRetryNonce, setMapRetryNonce] = useState(0);
  const mapControllerRef = useRef<AbortController | null>(null);
  const hasExtracted = useRef(false);

  // Auto-extract logic map on mount
  useEffect(() => {
    if (hasExtracted.current || !activeSession) return;
    if (activeSession.logicMap.length > 0) {
      hasExtracted.current = true;
      return;
    }
    hasExtracted.current = true;
    const controller = new AbortController();
    mapControllerRef.current?.abort();
    mapControllerRef.current = controller;

    async function doExtract() {
      if (!activeSession) return;
      setMapError(null);
      setAIThinking(true);
      try {
        const nodes = await extractLogicMap(
          activeSession.originalQuestion,
          activeSession.messages,
          controller.signal
        );
        updateLogicMap(nodes);
        await persistSession();
        setMapNodes(nodes);
      } catch (error) {
        setMapError(
          error instanceof Error
            ? error.message
            : "The logic map could not be generated."
        );
      } finally {
        if (mapControllerRef.current === controller) {
          mapControllerRef.current = null;
        }
        setAIThinking(false);
      }
    }

    void doExtract();
    return () => controller.abort();
  }, [
    activeSession,
    mapRetryNonce,
    persistSession,
    setAIThinking,
    updateLogicMap,
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages.length, isAIThinking]);

  if (!activeSession) {
    return <Navigate to="/student/history" replace />;
  }

  /** Sends student message in logic map view. */
  async function handleSendMessage(message: string) {
    const responsePhase = activeSession!.currentPhase;
    const studentMsg: ChatMessage = {
      id: `msg-${Date.now()}-student`,
      role: "student",
      content: message,
      timestamp: Date.now(),
      metadata: {
        messageType: "phase_response",
        phase: responsePhase,
      },
    };
    const controller = new AbortController();
    mapControllerRef.current?.abort();
    mapControllerRef.current = controller;
    setLogicRequestError(null);
    setAIThinking(true);

    try {
      addMessage(studentMsg);
      await persistSession();
      const conversationWithStudent = [...activeSession!.messages, studentMsg];
      const {
        message: aiText,
        nextPhase,
        diagnosis,
        aiFallbackEvent,
      } = await sendStudentResponse(conversationWithStudent, message, {
        currentPhase: responsePhase,
        selectedProblem: activeSession!.selectedProblem,
        subject: activeSession!.subject,
        topic: activeSession!.topic,
        originalQuestion: activeSession!.originalQuestion,
        phaseResponses: activeSession!.phaseResponses,
        hintsUsed: activeSession!.hintsUsed,
        unlockLevel: activeSession!.unlockLevel,
        problemMode: activeSession!.problemMode,
        freeFormAnalysis:
          activeSession!.problemContext.mode === "free_form"
            ? activeSession!.problemContext.analysis
            : undefined,
        signal: controller.signal,
      });
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: "ai",
        content: aiText,
        timestamp: Date.now(),
        metadata: diagnosis ? { diagnosis } : undefined,
      };
      addMessage(aiMessage);
      setDiagnosisResult(diagnosis ?? null);
      if (aiFallbackEvent) {
        addAIFallbackEvent(aiFallbackEvent);
      }
      if (nextPhase) {
        setPhase(nextPhase);
      }

      // Re-extract logic map after each exchange
      const nodes = await extractLogicMap(
        activeSession!.originalQuestion,
        [...conversationWithStudent, aiMessage],
        controller.signal
      );
      updateLogicMap(nodes);
      await persistSession();
      setMapNodes(nodes);
    } catch (error) {
      setLogicRequestError(
        error instanceof Error
          ? error.message
          : "The response could not be generated. Please retry."
      );
      throw error;
    } finally {
      if (mapControllerRef.current === controller) {
        mapControllerRef.current = null;
      }
      setAIThinking(false);
    }
  }

  return (
    <SessionLayout
      progress={getMindGuidePhaseProgress(activeSession.currentPhase)}
      showMap={true}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
      logicMapNodes={mapNodes}
    >
      {/* Render all messages */}
      {activeSession.messages.map((msg) =>
        msg.role === "student" ? (
          <StudentBubble key={msg.id} text={msg.content} />
        ) : (
          <AIBubble key={msg.id} text={msg.content} />
        )
      )}

      {isAIThinking && <AIThinking />}

      <div ref={chatEndRef} />

      <div className="mt-auto space-y-2">
        {(mapError || requestError) && (
          <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <p>{requestError ?? mapError}</p>
            {mapError && (
              <button
                type="button"
                onClick={() => {
                  hasExtracted.current = false;
                  setMapRetryNonce((value) => value + 1);
                }}
                className="mt-2 rounded-lg bg-red-100 px-3 py-2 font-semibold hover:bg-red-200"
              >
                Retry logic map
              </button>
            )}
          </div>
        )}
        <div className="max-w-2xl mx-auto flex justify-end">
          <button
            onClick={async () => {
              if (isFinalAnswerUnlocked(activeSession.currentPhase)) {
                setStep("draft");
                await persistSession();
                navigate(getSessionPath(activeSession.id, "draft"));
              } else {
                setStep("questioning");
                await persistSession();
                navigate(getSessionPath(activeSession.id, "questioning"));
              }
            }}
            disabled={isAIThinking}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />{" "}
            {isFinalAnswerUnlocked(activeSession.currentPhase)
              ? "I'm ready to write my answer"
              : "Return to guided phases"}
          </button>
        </div>
        <ProgressiveSupportPanel />
        <ChatInput onSend={handleSendMessage} disabled={isAIThinking} />
      </div>
    </SessionLayout>
  );
}
