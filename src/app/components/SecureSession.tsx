import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
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
} from "lucide-react";
import type {
  DiagnosisResult,
  MathResponse,
  SessionDraft,
  SessionProjection,
  SupportLevel,
} from "@mindguide/contracts";
import {
  PHASE_LABELS,
  SOLVER_STAGES,
  SOLVER_STAGE_LABELS,
  SOLVER_STAGE_PHASES,
  WORKFLOW_VERSION,
  isReasoningPhase,
  solverStageForPhase,
} from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  abandonLearningSession,
  evaluatePhaseResponse,
  finalizeScorecard,
  requestSessionSupport,
  saveSessionDraft,
  submitLearningSession,
} from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";
import { MathInput } from "./MathInput";

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
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [support, setSupport] = useState<{ level: SupportLevel; title: string; content: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!db || !sessionId || !firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDoc(doc(db, "sessions", sessionId));
      if (!snapshot.exists()) throw new Error("The learning session was not found.");
      const data = snapshot.data();
      if (data.schemaVersion !== 3 || data.workflowVersion !== WORKFLOW_VERSION) {
        throw new Error("This is a preserved legacy session. View it from your learning history or start a current-workflow follow-up.");
      }
      const projected = firestoreProjection(snapshot.id, data);
      setSession(projected);
      if (projected.draft) setDraft(projected.draft);
      setPrompt(projected.currentPrompt || promptFor(projected.currentPhase));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, sessionId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const progress = useMemo(() => {
    if (!session) return 0;
    const completed = SOLVER_STAGES.filter((stage) => session.stageProgress[stage].status === "completed").length;
    return Math.round((completed / SOLVER_STAGES.length) * 100);
  }, [session]);

  async function submitReasoning() {
    if (!session || !isReasoningPhase(session.currentPhase)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await evaluatePhaseResponse({
        sessionId: session.id,
        expectedPhase: session.currentPhase,
        revision: session.revision,
        response,
      });
      setSession(result.session);
      setDiagnosis(result.diagnosis);
      setPrompt(result.nextPrompt);
      if (result.evaluation.status === "accepted") setResponse(EMPTY_RESPONSE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The reasoning response could not be evaluated.");
    } finally {
      setLoading(false);
    }
  }

  async function requestSupport(level: SupportLevel) {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestSessionSupport({ sessionId: session.id, requestedLevel: level, revision: session.revision });
      setSession(result.session);
      setSupport({ level: result.level, title: result.title, content: result.content });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Support could not be unlocked.");
    } finally {
      setLoading(false);
    }
  }

  async function saveDraftAndScore() {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const saved = await saveSessionDraft({ sessionId: session.id, revision: session.revision, draft });
      const scored = await finalizeScorecard(saved.session.id, saved.session.revision);
      setSession(scored.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The formative scorecard could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  async function submitForReview() {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await submitLearningSession(session.id, session.revision);
      setSession(result.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be submitted.");
    } finally {
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
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6"><div className="max-w-xl rounded-3xl border bg-white p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-bold">Session {session.status}</h1><p className="mt-2 text-slate-600">Your authoritative reasoning record and scorecard are saved. Administrator feedback appears in your history.</p><Link to="/student/history" className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">View learning history</Link></div></div>
    );
  }

  const reasoning = isReasoningPhase(session.currentPhase);
  return (
    <div className="flex-1 bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{session.subject} · {session.topic} · {session.difficulty}</p><h1 className="mt-1 text-xl font-bold text-slate-950">{session.originalQuestion}</h1>{session.adaptiveRecommendation && <p className="mt-2 text-xs text-slate-500">Adaptive difficulty: {session.adaptiveRecommendation.reason}</p>}</div><span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">{progress}%</span></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{SOLVER_STAGES.map((stage) => { const state = session.stageProgress[stage]; return <div key={stage} className={`rounded-lg border p-3 text-xs font-semibold ${state.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state.status === "active" ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-400"}`}>{state.status === "completed" ? <CheckCircle2 className="mr-1 inline h-3 w-3" /> : <LockKeyhole className="mr-1 inline h-3 w-3" />}{SOLVER_STAGE_LABELS[stage]}<span className="mt-1 block font-normal">{state.acceptedGates}/{state.totalGates} reasoning checks</span></div>; })}</div>
        </div>

        {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        {diagnosis?.category && diagnosis.category !== "none" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-900">Corrective guidance · {diagnosis.category.replace(/_/g, " ")}</p><p className="mt-1 text-sm text-amber-800">{diagnosis.correctivePrompt}</p><p className="mt-2 text-xs font-semibold text-amber-700">Confidence: {diagnosis.confidence} · Severity: {diagnosis.severity}</p></div>}

        {reasoning ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div><p className="text-xs font-bold uppercase text-indigo-600">{SOLVER_STAGE_LABELS[session.currentStage]} · {PHASE_LABELS[session.currentPhase]}</p><h2 className="mt-2 text-lg font-bold text-slate-950">{prompt}</h2>{session.promptAdjustment !== "maintain" && <p className="mt-2 text-xs font-semibold text-indigo-500">Prompt support: {session.promptAdjustment === "simplify" ? "extra scaffolding" : "deeper reasoning"}</p>}</div>
            <MathInput value={response} onChange={setResponse} />
            <button disabled={loading || (!response.plainText.trim() && !response.latex?.trim())} onClick={() => void submitReasoning()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Submit reasoning</button>
          </div>
        ) : (
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
                <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Critical Thinking Scorecard</h2><span className="text-3xl font-bold text-indigo-600">{session.scorecard.total}/100</span></div>
                {Object.values(session.scorecard.criteria).map((criterion) => <div key={criterion.category} className="rounded-xl border border-indigo-100 bg-indigo-50 p-4"><div className="flex justify-between font-bold"><span>{criterion.category.replace(/([A-Z])/g, " $1")}</span><span>{criterion.score}/25</span></div><p className="mt-2 text-sm text-slate-700">{criterion.reason}</p><ul className="mt-2 list-disc pl-5 text-xs text-slate-600">{criterion.evidence.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-2 text-xs font-semibold text-indigo-700">Improve: {criterion.improvementAdvice}</p></div>)}
                <p className="rounded-xl bg-slate-50 p-4 text-sm">{session.scorecard.feedback}</p>
                {session.releasedSolution && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold uppercase text-emerald-700">Unlocked worked solution</p><h3 className="mt-2 font-bold text-emerald-950">Method</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.method}</p><h3 className="mt-4 font-bold text-emerald-950">Why it applies</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.justification}</p><h3 className="mt-4 font-bold text-emerald-950">Steps</h3><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-emerald-950">{session.releasedSolution.steps.map((step) => <li key={step}>{step}</li>)}</ol><h3 className="mt-4 font-bold text-emerald-950">Final answer</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.answer}</p><h3 className="mt-4 font-bold text-emerald-950">Verification</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.verification}</p><h3 className="mt-4 font-bold text-emerald-950">Interpretation</h3><p className="mt-1 text-sm text-emerald-900">{session.releasedSolution.interpretation}</p></div>}
                <p className="text-xs font-semibold text-slate-500">Formative AI-supported feedback only — not an official grade.</p>
                <button disabled={loading} onClick={() => void submitForReview()} className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white disabled:opacity-50">Submit immutable record for administrator review</button>
              </div>
            )}
          </div>
        )}

        {session.status === "in_progress" && session.allowedSupport.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-500" /><h2 className="font-bold">Available support</h2></div><div className="mt-3 flex flex-wrap gap-2">{session.allowedSupport.map((level) => <button key={level} onClick={() => void requestSupport(level)} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">{level.replace(/_/g, " ")}</button>)}</div>{support && <div className="mt-4 rounded-xl bg-amber-50 p-4"><p className="font-bold text-amber-900">{support.title}</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-amber-900">{support.content.map((item) => <li key={item}>{item}</li>)}</ol></div>}</div>}
        <button onClick={() => void abandonSession()} disabled={loading} className="mx-auto flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-700 disabled:opacity-50"><Ban className="h-4 w-4" />Abandon and preserve this session</button>
      </div>
    </div>
  );
}

function firestoreProjection(id: string, data: Record<string, any>): SessionProjection {
  const millis = (value: any) => value?.toMillis?.() ?? Date.now();
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
    id,
    schemaVersion: 3,
    workflowVersion: WORKFLOW_VERSION,
    revision: Number(data.revision ?? 0),
    studentId: data.studentId,
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
