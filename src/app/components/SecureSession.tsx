import { MathText } from "./MathText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Link, Navigate, useParams } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
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
  SessionDraft,
  SessionProjection,
  SupportLevel,
  TutorMessage,
} from "@mindguide/contracts";
import {
  PHASE_LABELS,
  SCHEMA_VERSION,
  SOLVER_STAGES,
  SOLVER_STAGE_LABELS,
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
  saveSessionDraft,
  submitLearningSession,
} from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";
import { MathInput } from "./MathInput";
import { ScorecardDetails } from "./ScorecardDetails";
import { TutorMessageBubble } from "./TutorMessageBubble";

const EMPTY_RESPONSE: MathResponse = { plainText: "", latex: "" };

export function SecureSession() {
  const { sessionId } = useParams();
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const [session, setSession] = useState<SessionProjection | null>(null);
  const [response, setResponse] = useState<MathResponse>(EMPTY_RESPONSE);
  const [draft, setDraft] = useState<SessionDraft>({
    answer: { plainText: "", latex: "" },
    methodology: "",
    reflection: "",
  });
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [slowRequest, setSlowRequest] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlowRequest(loading), loading ? 15000 : 0);
    return () => window.clearTimeout(timer);
  }, [loading]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const busy = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const restoreComposerFocus = useRef(false);
  const lastSend = useRef<{ key: string; requestId: string } | null>(null);
  const lastHint = useRef<{ key: string; requestId: string } | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [showEquation, setShowEquation] = useState(false);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const refreshMessages = useCallback(async () => {
    if (!db || !sessionId) return;
    const result = await getDocs(collection(db, "sessions", sessionId, "messages"));
    setMessages(result.docs.map(item => ({ ...item.data(), id: item.id, createdAt: item.get("createdAt")?.toMillis?.() ?? 0 } as TutorMessage)).sort((a,b) => a.createdAt-b.createdAt));
  }, [sessionId]);

  const load = useCallback(async () => {
    if (!db || !sessionId || !firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      await checkLearningSessionActivity(sessionId);
      const snapshot = await getDoc(doc(db, "sessions", sessionId));
      if (!snapshot.exists()) throw new Error("The learning session was not found.");
      const data = snapshot.data();
      if (!isCurrentLearningSession(data)) {
        throw new Error("This session uses an incompatible legacy workflow. View it from your learning history or start a current-workflow follow-up.");
      }
      const projected = firestoreProjection(snapshot.id, data);
      setSession(projected);
      if (projected.draft) setDraft(projected.draft);
      const local = sessionStorage.getItem(`mindguide.draft.${firebaseUser.uid}.${sessionId}`);
      if (local && projected.status === "in_progress") {
        const saved = JSON.parse(local);
        if (saved.revision === projected.revision) { setDraft(saved.draft); setResponse(saved.response); }
      }
      setPrompt(projected.currentPrompt || promptFor(projected.currentPhase));
      await refreshMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be loaded.");
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
    }
  }, [firebaseUser, sessionId, refreshMessages]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!firebaseUser || !sessionId || !session || loading) return;
    const key = `mindguide.draft.${firebaseUser.uid}.${sessionId}`;
    if (session.status !== "in_progress") { sessionStorage.removeItem(key); return; }
    sessionStorage.setItem(key, JSON.stringify({ revision: session.revision, draft, response }));
  }, [draft, response, session, sessionId, firebaseUser, loading]);

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

  const progress = useMemo(() => {
    if (!session) return 0;
    const completed = SOLVER_STAGES.filter((stage) => session.stageProgress[stage].status === "completed").length;
    return Math.round((completed / SOLVER_STAGES.length) * 100);
  }, [session]);

  async function submitReasoning() {
    if (!session || busy.current || loading || session.needsOpening || !isReasoningPhase(session.currentPhase) || (!response.plainText.trim() && !response.latex?.trim())) return;
    busy.current = true;
    restoreComposerFocus.current = true;
    const key = JSON.stringify([session.id, session.currentPhase, session.revision, response]);
    if (lastSend.current?.key !== key) lastSend.current = { key, requestId: crypto.randomUUID() };
    const requestId = lastSend.current.requestId;
    setPendingText([response.plainText, response.latex].filter(Boolean).join("\n"));
    setLoading(true);
    setError(null);
    try {
      const result = await evaluatePhaseResponse({
        sessionId: session.id,
        expectedPhase: session.currentPhase,
        revision: session.revision,
        response,
        intent: "answer",
        requestId,
      });
      setSession(result.session);
      setPrompt(result.nextPrompt);
      setResponse(EMPTY_RESPONSE);
      setPendingText(null);
      lastSend.current = null;
      // Keep an acknowledged exchange visible even if the subsequent history read fails.
      const studentMessage: TutorMessage = { id: `${requestId}_student`, role: "student", phase: session.currentPhase, text: [response.plainText, response.latex].filter(Boolean).join("\n"), createdAt: Date.now() };
      setMessages(current => [...current.filter(message => message.id !== studentMessage.id && message.id !== result.tutorMessage?.id), studentMessage, ...(result.tutorMessage ? [result.tutorMessage] : [])]);
      await refreshMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The reasoning response could not be evaluated.");
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
    }
  }

  async function requestSupport(level: SupportLevel) {
    if (!session || busy.current || loading || session.needsOpening || !isReasoningPhase(session.currentPhase) || !session.allowedSupport.includes(level)) return;
    busy.current = true;
    const key = JSON.stringify([session.id, session.revision, level]);
    if (lastHint.current?.key !== key) lastHint.current = { key, requestId: crypto.randomUUID() };
    const requestId = lastHint.current.requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await requestSessionSupport({ sessionId: session.id, requestedLevel: level, revision: session.revision, requestId });
      setSession(result.session);
      setPrompt(result.session.currentPrompt);
      lastHint.current = null;
      const hint: TutorMessage = { id: `${requestId}_tutor`, role: "assistant", phase: session.currentPhase, text: result.content.join("\n\n"), createdAt: Date.now() };
      setMessages(current => [...current.filter(message => message.id !== hint.id), hint]);
      await refreshMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Support could not be unlocked.");
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
    }
  }

  async function saveDraftAndScore() {
    if (!session || busy.current || loading) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const saved = await saveSessionDraft({ sessionId: session.id, revision: session.revision, draft });
      setSession(saved.session);
      const scored = await finalizeScorecard(saved.session.id, saved.session.revision);
      setSession(scored.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The formative scorecard could not be generated.");
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
    }
  }

  async function submitForReview() {
    if (!session || busy.current || loading) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await submitLearningSession(session.id, session.revision);
      setSession(result.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be submitted.");
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
    }
  }

  async function abandonSession() {
    if (!session || !window.confirm("Abandon this session? Its reasoning record will be preserved as read-only history.")) return;
    setLoading(true);
    setError(null);
    try {
      const result = await abandonLearningSession(session.id);
      setSession(result.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be abandoned.");
    } finally {
      busy.current = false;
      setPendingText(null);
      setLoading(false);
    }
  }

  if (!sessionId) return <Navigate to="/student/history" replace />;
  if (loading && !session) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border bg-white p-8 text-center"><AlertCircle className="mx-auto h-10 w-10 text-amber-500" /><h1 className="mt-3 text-xl font-bold">Session unavailable</h1><p className="mt-2 text-slate-600">{error}</p><div className="mt-5 flex justify-center gap-3"><button onClick={() => void load()} className="rounded-lg border px-4 py-2 font-bold"><RefreshCw className="mr-2 inline h-4 w-4" />Retry</button><Link to="/student/history" className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">History</Link></div></div>
      </div>
    );
  }

  if (["submitted", "reviewed", "returned", "abandoned", "expired"].includes(session.status)) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6"><div className="max-w-xl rounded-3xl border bg-white p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-bold">Session {session.status}</h1><p className="mt-2 text-slate-600">Your practice reasoning record and scorecard are saved. Administrator feedback appears in your history.</p><Link to="/student/history" className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">View learning history</Link></div></div>
    );
  }

  const reasoning = isReasoningPhase(session.currentPhase);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 text-slate-800">
      <header className="shrink-0 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-sm font-bold text-white">MG</span>
          <div className="min-w-0 flex-1"><h1 className="text-base font-bold sm:text-lg">Socratic Session: {session.subject}</h1><p className="text-xs text-slate-500">{session.topic}</p></div>
          <Link to="/student/history" aria-label="Close session and return to history" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-violet-600"><X className="h-5 w-5" /></Link>
        </div>
        <div className="mb-1.5 mt-3 flex justify-between gap-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500"><span>{SOLVER_STAGE_LABELS[session.currentStage]}</span><span>{progress}%</span></div>
        <div role="progressbar" aria-label="Learning progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progress}%` }} /></div>
      </header>

      <details className="shrink-0 border-b border-slate-100 bg-white px-4 text-sm sm:px-6">
        <summary className="cursor-pointer py-2 text-xs font-medium text-slate-500 focus-visible:outline-violet-600">Session details</summary>
        <div className="max-h-[35dvh] space-y-4 overflow-y-auto pb-4">
          <div><h2 className="font-semibold">Your problem</h2><MathText text={session.originalQuestion} /><p className="mt-1 text-xs text-slate-500">{session.difficulty}</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{SOLVER_STAGES.map(stage => {
            const state = session.stageProgress[stage];
            return <div key={stage} className={`rounded-lg border p-3 text-xs ${state.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state.status === "active" ? "border-violet-200 bg-violet-50 text-violet-700" : "text-slate-500"}`}>
              {state.status === "completed" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : <LockKeyhole className="mr-1 inline h-3 w-3" />}{SOLVER_STAGE_LABELS[stage]}<span className="mt-1 block">{state.acceptedGates}/{state.totalGates} reasoning checks</span>
            </div>;
          })}</div>
          {session.adaptiveRecommendation && <p className="text-xs text-slate-500">Adaptive difficulty: {session.adaptiveRecommendation.reason}</p>}
          {!!session.supportHistory?.length && <section><h2 className="font-semibold">Support history</h2>{session.supportHistory.map((entry, index) => <div key={index} className="mt-2 rounded-lg bg-slate-50 p-3"><p className="mb-1 text-xs text-slate-500">{PHASE_LABELS[entry.phase]} · {entry.title}</p>{entry.content.map((line, i) => <MathText key={i} text={line} />)}</div>)}</section>}
          <button onClick={() => void abandonSession()} disabled={loading} className="flex items-center gap-2 rounded-lg py-2 text-xs text-slate-500 hover:text-red-700 disabled:opacity-50"><Ban className="h-4 w-4" />Abandon and preserve this session</button>
        </div>
      </details>

      <div ref={scrollRef} onScroll={() => {
        const viewport = scrollRef.current;
        if (!viewport) return;
        nearBottom.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
        setHasNewMessages(!nearBottom.current);
      }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <section aria-label="Socratic tutor conversation" role="log" aria-live="polite" className="space-y-5">
            {messages.map(message => <TutorMessageBubble key={message.id} role={message.role} text={message.text} />)}
            {!messages.length && !session.needsOpening && <TutorMessageBubble role="assistant" text={prompt} />}
            {pendingText && <TutorMessageBubble role="student" text={pendingText} />}
            {loading && <p role="status" className="flex items-center gap-2 text-sm text-violet-700"><Loader2 className="h-4 w-4 animate-spin" />{slowRequest ? "Your tutor is taking longer than usual. Please keep this session open while we wait for your result…" : "Your tutor is thinking…"}</p>}
          </section>
          {session.needsOpening && <button disabled={loading} className="rounded-xl bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={async () => {
            if (busy.current) return;
            busy.current = true; setLoading(true); setError(null);
            try { const result = await resumeTutorOpening(session.id, session.revision); setSession(result.session); setPrompt(result.session.currentPrompt); await refreshMessages(); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "The tutor could not start."); }
            finally { busy.current = false; setLoading(false); }
          }}>Start AI conversation</button>}
          {!reasoning && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div><p className="text-xs font-bold uppercase text-indigo-600">Progressive solution unlock</p><h2 className="mt-2 text-lg font-bold">All four Socratic stages are complete.</h2><p className="mt-1 text-slate-600">Complete your final response and reflection. Your scorecard is generated before the worked solution is released.</p></div>
            {!session.scorecard ? (
              <>
                <MathInput label="Final answer" explanationPlaceholder="State and explain your final answer..." value={draft.answer} onChange={(answer) => setDraft((current) => ({ ...current, answer }))} />
                <label className="block text-sm font-bold">Methodology<textarea rows={4} maxLength={4000} value={draft.methodology} onChange={(event) => setDraft((current) => ({ ...current, methodology: event.target.value }))} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label>
                <label className="block text-sm font-bold">Reflection and interpretation<textarea rows={4} maxLength={2000} value={draft.reflection} onChange={(event) => setDraft((current) => ({ ...current, reflection: event.target.value }))} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label>
                <button disabled={loading || !draft.methodology.trim() || !draft.reflection.trim() || (!draft.answer.plainText.trim() && !draft.answer.latex?.trim())} onClick={() => void saveDraftAndScore()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">Generate evidence-backed scorecard<ArrowRight className="h-5 w-5" /></button>
              </>
            ) : (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Critical Thinking Scorecard</h2>
                <ScorecardDetails scorecard={session.scorecard} />
                {session.releasedSolution && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold uppercase text-emerald-700">Unlocked worked solution</p><h3 className="mt-2 font-bold text-emerald-950">Method</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.method}</p><h3 className="mt-4 font-bold text-emerald-950">Why it applies</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.justification}</p><h3 className="mt-4 font-bold text-emerald-950">Steps</h3><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-emerald-950">{session.releasedSolution.steps.map((step) => <li key={step}><MathText text={step} /></li>)}</ol><h3 className="mt-4 font-bold text-emerald-950">Final answer</h3><p className="mt-1 text-sm text-emerald-900"><MathText text={session.releasedSolution.answer} /></p><h3 className="mt-4 font-bold text-emerald-950">Verification</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.verification}</p><h3 className="mt-4 font-bold text-emerald-950">Interpretation</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.interpretation}</p></div>}
                <p className="text-xs font-semibold text-slate-500">Formative AI-supported feedback only — not an official grade.</p>
                <button disabled={loading} onClick={() => void submitForReview()} className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-50">Submit immutable record for administrator review</button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
      {hasNewMessages && <button onClick={jumpToLatest} className="mx-auto mb-2 flex shrink-0 items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-medium text-violet-700 shadow-sm"><ArrowDown className="h-3 w-3" />Jump to latest</button>}
      {error && <div role="alert" className="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button disabled={loading} onClick={() => void load()} className="underline">Reload saved progress</button></div>}
      {reasoning && <footer className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:pb-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <button disabled={loading || session.needsOpening || !session.allowedSupport.length} onClick={() => {
              const level = session.allowedSupport.at(-1);
              if (level) void requestSupport(level);
            }} className="flex items-center gap-1.5 rounded-full bg-violet-100/70 px-3 py-1.5 font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"><Lightbulb className="h-3.5 w-3.5" />I need a hint</button>
            <button aria-expanded={showEquation} aria-controls="chat-equation" onClick={() => setShowEquation(!showEquation)} className="rounded-lg px-2 py-1 text-slate-500 hover:text-violet-700">{showEquation ? "Hide equation" : response.latex?.trim() ? "Edit equation •" : "Add equation"}</button>
          </div>
          <form onSubmit={event => { event.preventDefault(); void submitReasoning(); }} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
            <div className="flex items-end gap-3">
              <textarea ref={composerRef} aria-label="Message your tutor" placeholder="Type your response here…" value={response.plainText} maxLength={4000} rows={2} disabled={loading || session.needsOpening}
                onChange={event => setResponse(current => ({ ...current, plainText: event.target.value }))}
                onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submitReasoning(); } }}
                className="max-h-36 min-h-12 w-full resize-none bg-transparent p-1 text-sm leading-6 outline-none placeholder:text-slate-400 disabled:opacity-60" />
              <button type="submit" aria-label="Send message" disabled={loading || session.needsOpening || (!response.plainText.trim() && !response.latex?.trim())} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
            {showEquation && <fieldset id="chat-equation" disabled={loading || session.needsOpening} className="mt-3 max-h-[25dvh] overflow-y-auto border-t border-slate-100 pt-3"><MathInput notationOnly disabled={loading || session.needsOpening} value={response} onChange={setResponse} /></fieldset>}
          </form>
        </div>
      </footer>}
    </div>
  );
}

function firestoreProjection(id: string, data: Record<string, any>): SessionProjection {
  const millis = (value: any) => value?.toMillis?.() ?? (typeof value === "number" ? value : Date.now());
  const currentPhase = data.currentPhase as SessionProjection["currentPhase"];
  const currentStage = solverStageForPhase(currentPhase);
  const gateStates = data.gateStates ?? {};
  const stageProgress = Object.fromEntries(SOLVER_STAGES.map((stage) => {
    const phases = SOLVER_STAGE_PHASES[stage];
    const acceptedGates = phases.filter((phase) => gateStates[phase]?.status === "accepted").length;
    return [stage, {
      stage,
      acceptedGates,
      totalGates: phases.length,
      status: acceptedGates === phases.length ? "completed" : stage === currentStage ? "active" : "locked",
    }];
  })) as SessionProjection["stageProgress"];
  return {
    needsOpening: data.needsOpening ?? false,
    scoringSource: data.scoringSource,
    id,
    schemaVersion: SCHEMA_VERSION,
    workflowVersion: WORKFLOW_VERSION,
    revision: Number(data.revision ?? 0),
    lastDiagnosis: data.lastDiagnosis ?? null,
    supportHistory: data.supportHistory ?? [],
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
    adaptiveRecommendation: data.adaptiveRecommendation ?? data.difficultyRecommendation ?? null,
    configurationVersions: data.configurationVersions ?? null,
    promptAdjustment: data.promptAdjustment ?? "maintain",
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    learningCompletedAt: data.learningCompletedAt ? millis(data.learningCompletedAt) : null,
  };
}

function promptFor(phase: string): string {
  const prompts: Record<string, string> = {
    problem_understanding: "Restate the problem in your own words and identify what it asks you to determine.",
    relevant_information_identification: "Which values, variables, sets, propositions, or conditions are relevant, and what is unknown?",
    method_selection: "Which method, formula, theorem, or proof strategy should be used?",
    formula_theorem_justification: "Why do the formula or theorem conditions apply to this problem?",
    guided_computation_or_proof: "Show the next justified computation or proof step.",
    verification_and_checking: "How can you verify the calculation, cases, or logical conclusion?",
    result_interpretation: "What does the verified result mean in the context of the original problem?",
  };
  return prompts[phase] ?? "Complete the controlled support and formative scorecard stages.";
}
