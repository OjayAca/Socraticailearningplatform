import { loadView, peekView } from "@/lib/view-cache";
import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router";
import { AlertCircle, BookOpen, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type {
  AdaptiveRecommendation,
  Difficulty,
  GetCurrentConsentNoticeResponse,
  LearningCatalog,
  SubjectProgress,
} from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  bootstrapProfile,
  getCurrentConsentNotice,
  getLearningCatalog,
  getPreparedTopicIds,
  startLearningSession,
  previewVerifiedProblem,
} from "@/lib/secure-api";
import { secureErrorMessage } from "@/lib/secure-error";
import { useAuthStore } from "@/stores/auth-store";
import { MathInput } from "./MathInput";
import { customGuidance } from "@/lib/learning/custom-problem-config";
import { StudentShell } from "./StudentShell";

async function loadTaskSetup(userId: string) {
  const [catalog, notice, progress] = await Promise.all([
    getLearningCatalog(), getCurrentConsentNotice(), getDoc(doc(db!, "learning_progress", userId)),
  ]);
  const consent = await getDoc(doc(db!, "users", userId, "consents", notice.version));
  const progressData = progress.exists() ? progress.data() : {};
  return {
    catalog, notice, consented: consent.exists(),
    topicRecommendations: (progressData.topicRecommendations ?? {}) as Record<string, AdaptiveRecommendation>,
    subjectProgress: (progressData.subjectProgress ?? {}) as Record<string, SubjectProgress>
  };
}

export function SecureTaskStart() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();
  const cached = peekView<Awaited<ReturnType<typeof loadTaskSetup>>>(`task-setup:${firebaseUser?.uid}`);
  const [mode, setMode] = useState<"curated" | "free_form" | null>(null);
  const [catalog, setCatalog] = useState<LearningCatalog | null>(cached?.catalog ?? null);
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficultyOverride, setDifficultyOverride] = useState<Difficulty | null>(null);
  const [availableIds, setAvailableIds] = useState<string[] | null>(null);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [question, setQuestion] = useState("");
  const [questionLatex, setQuestionLatex] = useState("");
  const submitting = useRef(false);
  const [consented, setConsented] = useState<boolean | null>(cached?.consented ?? null);
  const [notice, setNotice] = useState<GetCurrentConsentNoticeResponse | null>(cached?.notice ?? null);
  const [topicRecommendations, setTopicRecommendations] = useState<Record<string, AdaptiveRecommendation>>(cached?.topicRecommendations ?? {});
  const [subjectProgress, setSubjectProgress] = useState<Record<string, SubjectProgress>>(cached?.subjectProgress ?? {});
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const userId = firebaseUser?.uid;

  useEffect(() => {
    if (!db || !userId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const key = `task-setup:${userId}`;
      if (!peekView(key)) setLoading(true);
      setError(null);
      loadView(key, () => loadTaskSetup(userId))
        .then(({ catalog: nextCatalog, notice: currentNotice, consented: nextConsented, topicRecommendations: recommendations, subjectProgress: progress }) => {
          if (!active) return;
          setCatalog(nextCatalog);
          setConsented(nextConsented);
          setNotice(currentNotice);
          setTopicRecommendations(recommendations);
          setSubjectProgress(progress);
        })
        .catch((cause) => active && setError(secureErrorMessage(cause, "Unable to load learning materials.")))
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [userId, loadAttempt]);

  useEffect(() => {
    if (mode !== "curated") return;
    let active = true;
    getPreparedTopicIds(subjectId)
      .then(ids => { if (active) setAvailableIds(ids); })
      .catch(cause => { if (active) setError(secureErrorMessage(cause, "Unable to load available topics.")); });
    return () => { active = false; };
  }, [mode, subjectId, availabilityAttempt]);

  const subjectTopics = catalog?.topics.filter(topic => topic.subjectId === subjectId) ?? [];
  const topics = subjectTopics.filter(topic => topic.ready && availableIds?.includes(topic.id));
  const selectedTopic = topics.find(topic => topic.id === topicId);
  const recommendation = topicRecommendations[topicKey(selectedTopic?.name ?? "")];
  const difficulty = difficultyOverride ?? recommendation?.recommendedDifficulty ?? "Basic";
  const examples = subjectTopics.map(topic => customGuidance(topic.id)).filter(item => !!item);
  const canStart = mode === "curated" ? !!selectedTopic :
    mode === "free_form" && question.trim().length >= 8 && questionLatex.length <= 2000;

  function changeMode(next: typeof mode) {
    setMode(next);
    setTopicId("");
    setDifficultyOverride(null);
    setQuestion("");
    setQuestionLatex("");
    setAvailableIds(null);
    setError(null);
  }

  async function acceptNotice() {
    if (!acknowledge || !userProfile || !notice) return;
    setLoading(true);
    setError(null);
    try {
      await bootstrapProfile({ displayName: userProfile.displayName, consentVersion: notice.version });
      setConsented(true);
    } catch (cause) {
      setError(secureErrorMessage(cause, "Consent could not be recorded."));
    } finally {
      setLoading(false);
    }
  }

  async function begin() {
    if (submitting.current || loading || !subjectId || !mode || !canStart) return;
    submitting.current = true;
    setError(null);
    setLoading(true);
    try {
      const ownInput = { subjectId, question: question.trim(), ...(questionLatex ? { questionLatex } : {}) };
      const result = mode === "curated"
        ? await startLearningSession({ mode, subjectId, topicId, requestedDifficulty: difficulty })
        : await startLearningSession({ mode, ...ownInput, confirmationHash: (await previewVerifiedProblem(ownInput)).confirmationHash });
      navigate(`/session/${result.session.id}/learn`);
    } catch (cause) {
      setError(secureErrorMessage(cause, "The secure session could not be started."));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  if (loading && consented === null) {
    return <StudentShell active="task"><CenteredLoader /></StudentShell>;
  }

  if (consented === null) {
    return (
      <StudentShell active="task">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Learning setup could not be loaded</h1>
          <p className="text-slate-600 dark:text-slate-300">We could not check the learning catalog and privacy notice. Try loading them again.</p>
          {error && <ErrorMessage message={error} />}
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">Try again</button>
        </div>
      </StudentShell>
    );
  }

  if (consented === false) {
    return (
      <StudentShell active="task">
        <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-100 bg-white p-4 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <ShieldCheck className="h-12 w-12 text-indigo-600 dark:text-indigo-400" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">Privacy and Responsible AI Notice</h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">{notice?.summary}</p>
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Practice feedback is calculated in your browser. Learning records follow the retention policy described in the notice.
          </div>
          <label className="mt-6 flex items-start gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} className="mt-1" />
            I have read the notice, understand that automated practice feedback can be inaccurate, and consent to the described capstone data use.
          </label>
          {error && <p className="mt-4 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <button type="button" disabled={!acknowledge || loading} onClick={() => void acceptNotice()} className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50">
            {loading ? "Saving acknowledgement..." : "Acknowledge and continue"}
          </button>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell active="task">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">Start a secure MINDGUIDE session</h1>
        </div>
        {catalog && catalog.subjects.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Choose a subject</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {catalog.subjects.map((subject) => {
                const progress = subjectProgress[subject.name];
                const selected = subject.id === subjectId;
                return (
                  <button key={subject.id} type="button" disabled={loading} aria-pressed={selected} onClick={() => {
                    if (selected) return;
                    changeMode(null);
                    setSubjectId(subject.id);
                  }} className={`rounded-2xl border p-5 text-left transition ${selected ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600/20 dark:bg-indigo-950/30" : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900"}`}>
                    <h3 className="font-bold text-slate-950 dark:text-white">{subject.name}</h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{subject.description}</p>
                    <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <span><strong className="block text-slate-950 dark:text-white">{progress?.sessionsCompleted ?? 0}</strong>Completed</span>
                      <span><strong className="block text-slate-950 dark:text-white">{progress?.averageCTScore ?? 0}/100</strong>Average</span>
                      <span><strong className="block text-indigo-700 dark:text-indigo-300">{progress?.recommendedDifficulty ?? "Basic"}</strong>Recommended</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {!catalog?.subjects.length && <p>No approved topics are available yet.</p>}
        {subjectId && <section>
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">Choose a problem type</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModeButton active={mode === "curated"} disabled={loading} onClick={() => changeMode("curated")} icon={<BookOpen className="mx-auto mb-2 h-5 w-5" />} label="Prepared Problem" />
            <ModeButton active={mode === "free_form"} disabled={loading} onClick={() => changeMode("free_form")} icon={<CheckCircle2 className="mx-auto mb-2 h-5 w-5" />} label="Own Problem" />
          </div>
        </section>}
        {mode && <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          {mode === "curated" ? <>
            {availableIds === null ? (error
              ? <button type="button" onClick={() => { setError(null); setAvailabilityAttempt(n => n + 1); }}>Retry loading topics</button>
              : <p role="status">Loading available topics…</p>)
              : topics.length === 0 ? <p>No approved prepared topics are available for this subject.</p>
                : <>
                  <label className="block text-sm font-bold">Topic
                    <select disabled={loading} value={topicId} onChange={event => {
                      setTopicId(event.target.value); setDifficultyOverride(null); setError(null);
                    }} className="mt-2 w-full rounded-lg border p-3 font-normal">
                      <option value="">Select a topic</option>
                      {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                    </select>
                  </label>
                  {selectedTopic?.subtopics && <details className="text-sm"><summary>Subtopics</summary><ul className="ml-5 list-disc">{selectedTopic.subtopics.map(item => <li key={item.id}>{item.name}{item.children && <ul className="ml-5 list-disc">{item.children.map(child => <li key={child.id}>{child.name}</li>)}</ul>}</li>)}</ul></details>}
                  {selectedTopic && <label className="block text-sm font-bold">Difficulty
                    <select disabled={loading} value={difficulty} onChange={event => {
                      setDifficultyOverride(event.target.value as Difficulty); setError(null);
                    }} className="mt-2 w-full rounded-lg border p-3 font-normal">
                      {(["Basic", "Intermediate", "Advanced"] as const).map(level => <option key={level}>{level}</option>)}
                    </select>
                    <span className="mt-1 block text-xs font-normal">Recommended level · {recommendation?.recommendedDifficulty ?? "Basic"}</span>
                  </label>}
                </>}
          </> : <>
            <MathInput label="Mathematical problem" maxLength={2000} disabled={loading} value={{ plainText: question, latex: questionLatex }}
              onChange={value => { setQuestion(value.plainText); setQuestionLatex(value.latex ?? ""); setError(null); }}
              explanationPlaceholder={examples[0]?.example} />
            <p className="text-sm">For optional notation, place [math] once in your problem where the expression belongs.</p>
            {examples.length > 0 && <details className="text-sm"><summary>Supported formats and examples</summary>
              <ul className="ml-5 list-disc space-y-2">{examples.map(item => <li key={item.example}><strong>{item.types}</strong><br />{item.example}<br />{item.limitation}</li>)}</ul>
            </details>}
            {questionLatex.length > 2000 && <p role="alert">Notation must be at most 2000 characters.</p>}
          </>}
          {error && <ErrorMessage message={error} />}
          <button disabled={loading || !canStart} onClick={() => void begin()} className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
            {loading ? "Starting secure session..." : mode === "curated" ? "Start Session" : "Validate and start"}
          </button>
        </div>}
      </div>
    </StudentShell>
  );
}

function CenteredLoader() {
  return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
}

function ErrorMessage({ message }: { message: string }) {
  return <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-5 w-5 shrink-0" />{message}</div>;
}

function ModeButton({ active, disabled, onClick, icon, label }: { active: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={() => { if (!active) onClick(); }} className={`rounded-xl border p-4 font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${active ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"}`}>{icon}{label}</button>;
}

function topicKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
