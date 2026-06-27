/**
 * Session screens — Part 1: Trigger, Questioning, Productive, Hints, Logic Map.
 *
 * These components manage the interactive Socratic conversation between
 * the student and the AI. All messages are stored in the Zustand session store
 * and sent to the Gemini/Ollama AI engine for real responses.
 *
 * @module components/SessionScreensPart1
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
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
import type { ChatMessage, LogicMapNode } from "@/types";

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
  const { activeSession } = useSessionStore();

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
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function handleSend() {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-end gap-2 max-w-2xl w-full mx-auto mt-auto">
      <textarea
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="w-full resize-none outline-none p-3 text-sm text-slate-800 disabled:opacity-50"
        placeholder={placeholder}
      />
      <div className="flex flex-col gap-2 p-1">
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition-colors shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Shows progressively unlocked support from the selected prepared problem. */
export function ProgressiveSupportPanel() {
  const { activeSession, isAIThinking, setUnlockLevel, persistSession } =
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
            setUnlockLevel(unlockGate.nextLevel);
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
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  // Auto-start the session on mount
  useEffect(() => {
    if (hasStarted.current || !activeSession) return;
    hasStarted.current = true;

    async function initSession() {
      if (!activeSession) return;
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
        addMessage({
          id: `msg-${Date.now()}-student`,
          role: "student",
          content: activeSession.originalQuestion,
          timestamp: Date.now(),
        });
        // Add AI's response
        addMessage({
          id: `msg-${Date.now()}-ai`,
          role: "ai",
          content: response,
          timestamp: Date.now(),
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
  }, [activeSession, addMessage, persistSession, setAIThinking, setPhase]);

  if (!activeSession) {
    navigate("/student/task");
    return null;
  }

  return (
    <SessionLayout
      progress={getMindGuidePhaseProgress(activeSession.currentPhase)}
      currentStepText={getMindGuidePhaseLabel(activeSession.currentPhase)}
    >
      <StudentBubble text={activeSession.originalQuestion} />

      {isAIThinking && <AIThinking />}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm max-w-2xl mr-auto ml-11">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
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
                  navigate("/session/questioning");
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
    setAIThinking,
    persistSession,
    isAIThinking,
  } = useSessionStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [exchangeCount, setExchangeCount] = useState(0);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages.length, isAIThinking, scrollToBottom]);

  if (!activeSession) {
    navigate("/student/task");
    return null;
  }

  /** Sends student message to AI and stores the response. */
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
    addMessage(studentMsg);
    await persistSession();
    setAIThinking(true);

    try {
      const conversationWithStudent = [...activeSession!.messages, studentMsg];
      const { message: aiText, nextPhase, diagnosis } = await sendStudentResponse(
        conversationWithStudent,
        message,
        {
          currentPhase: responsePhase,
          selectedProblem: activeSession!.selectedProblem,
          subject: activeSession!.subject,
          topic: activeSession!.topic,
          originalQuestion: activeSession!.originalQuestion,
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
      if (nextPhase) {
        setPhase(nextPhase);
      }
      await persistSession();
      setExchangeCount((c) => c + 1);
    } catch {
      addMessage({
        id: `msg-${Date.now()}-error`,
        role: "ai",
        content:
          "I'm having trouble connecting right now. Please try sending your message again.",
        timestamp: Date.now(),
      });
      await persistSession();
    } finally {
      setAIThinking(false);
    }
  }

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

      {isAIThinking && <AIThinking />}

      <div ref={chatEndRef} />

      <div className="mt-auto">
        <div className="max-w-2xl mx-auto flex justify-between mb-2">
          <button
            onClick={async () => {
              setStep("hints");
              await persistSession();
              navigate("/session/hints");
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
                navigate("/session/draft");
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
                  navigate("/session/logic-map");
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

// ─── Productive Response (Screen 9) ─────────────────────────

/** Alias that redirects to the questioning flow with context. */
export function SessionProductive() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/session/questioning", { replace: true });
  }, [navigate]);
  return null;
}

// ─── Session Hints (Screen 10) ──────────────────────────────

/** Progressive hint screen — generates hints via AI. */
export function SessionHints() {
  const navigate = useNavigate();
  const { activeSession, setAIThinking, isAIThinking } = useSessionStore();
  const [hints, setHints] = useState<string[]>([]);
  const [currentLevel, setCurrentLevel] = useState(0);

  if (!activeSession) {
    navigate("/student/task");
    return null;
  }

  /** Generates the next hint level. */
  async function handleGetHint() {
    const nextLevel = currentLevel + 1;
    if (nextLevel > 3) return;

    setAIThinking(true);
    try {
      const hint = await generateHint(
        nextLevel,
        activeSession!.originalQuestion,
        activeSession!.messages
      );
      setHints((prev) => [...prev, hint]);
      setCurrentLevel(nextLevel);
    } catch {
      setHints((prev) => [
        ...prev,
        "Could not generate a hint right now. Try rethinking the problem from scratch.",
      ]);
    } finally {
      setAIThinking(false);
    }
  }

  // Auto-generate first hint on mount
  useEffect(() => {
    if (hints.length === 0) {
      handleGetHint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <div key={idx} className="flex gap-3 items-start">
                <span className="w-5 h-5 bg-amber-200 text-amber-800 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-sm text-amber-900 font-medium">{hint}</p>
              </div>
            ))}
            {isAIThinking && (
              <div className="flex gap-3 items-center">
                <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                <span className="text-sm text-amber-700">
                  Generating hint...
                </span>
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
              onClick={() => navigate("/session/questioning")}
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
    setAIThinking,
    isAIThinking,
    updateLogicMap,
    persistSession,
  } = useSessionStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [mapNodes, setMapNodes] = useState<LogicMapNode[]>(
    activeSession?.logicMap || []
  );
  const hasExtracted = useRef(false);

  // Auto-extract logic map on mount
  useEffect(() => {
    if (hasExtracted.current || !activeSession) return;
    hasExtracted.current = true;

    async function doExtract() {
      if (!activeSession) return;
      try {
        const nodes = await extractLogicMap(
          activeSession.originalQuestion,
          activeSession.messages
        );
        setMapNodes(nodes);
        updateLogicMap(nodes);
        await persistSession();
      } catch {
        console.error("Failed to extract logic map");
      }
    }

    doExtract();
  }, [activeSession, persistSession, updateLogicMap]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages.length, isAIThinking]);

  if (!activeSession) {
    navigate("/student/task");
    return null;
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
    addMessage(studentMsg);
    await persistSession();
    setAIThinking(true);

    try {
      const conversationWithStudent = [...activeSession!.messages, studentMsg];
      const { message: aiText, nextPhase, diagnosis } = await sendStudentResponse(
        conversationWithStudent,
        message,
        {
          currentPhase: responsePhase,
          selectedProblem: activeSession!.selectedProblem,
          subject: activeSession!.subject,
          topic: activeSession!.topic,
          originalQuestion: activeSession!.originalQuestion,
        }
      );
      addMessage({
        id: `msg-${Date.now()}-ai`,
        role: "ai",
        content: aiText,
        timestamp: Date.now(),
        metadata: diagnosis ? { diagnosis } : undefined,
      });
      setDiagnosisResult(diagnosis ?? null);
      if (nextPhase) {
        setPhase(nextPhase);
      }

      // Re-extract logic map after each exchange
      const nodes = await extractLogicMap(
        activeSession!.originalQuestion,
        conversationWithStudent
      );
      setMapNodes(nodes);
      updateLogicMap(nodes);
      await persistSession();
    } catch {
      addMessage({
        id: `msg-${Date.now()}-error`,
        role: "ai",
        content: "Connection issue. Please try again.",
        timestamp: Date.now(),
      });
      await persistSession();
    } finally {
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
        <div className="max-w-2xl mx-auto flex justify-end">
          <button
            onClick={async () => {
              if (isFinalAnswerUnlocked(activeSession.currentPhase)) {
                setStep("draft");
                await persistSession();
                navigate("/session/draft");
              } else {
                navigate("/session/questioning");
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
