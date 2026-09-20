import { useEffect, useMemo, useState } from "react";
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
  startLearningSession,
  previewVerifiedProblem,
} from "@/lib/secure-api";
import { secureErrorMessage } from "@/lib/secure-error";
import { useAuthStore } from "@/stores/auth-store";
import { StudentShell } from "./StudentShell";

export function SecureTaskStart() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();
  const [mode, setMode] = useState<"curated" | "free_form">("curated");
  const [catalog, setCatalog] = useState<LearningCatalog | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Basic");
  const [question, setQuestion] = useState("");
  const [consented, setConsented] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<GetCurrentConsentNoticeResponse | null>(null);
  const [topicRecommendations, setTopicRecommendations] = useState<Record<string, AdaptiveRecommendation>>({});
  const [subjectProgress, setSubjectProgress] = useState<Record<string, SubjectProgress>>({});
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const userId = firebaseUser?.uid;

  useEffect(() => {
    if (!db || !userId) return;
    const database = db;
    let active = true;
    const timer = window.setTimeout(() => {
    setLoading(true);
    setError(null);
    setConsented(null);
    setCatalog(null);
    Promise.all([
      getLearningCatalog(),
      getCurrentConsentNotice(),
      getDoc(doc(database, "learning_progress", userId)),
    ])
      .then(async ([nextCatalog, currentNotice, progressSnapshot]) => {
        const consentSnapshot = await getDoc(
          doc(database, "users", userId, "consents", currentNotice.version)
        );
        if (!active) return;
        setCatalog(nextCatalog);
        const firstSubject = nextCatalog.subjects[0]?.id ?? "";
        const firstTopic = nextCatalog.topics.find((topic) => topic.subjectId === firstSubject)?.id ?? "";
        setSubjectId((current) => current || firstSubject);
        setTopicId((current) => current || firstTopic);
        setConsented(consentSnapshot.exists());
        setNotice(currentNotice);
        setTopicRecommendations(
          progressSnapshot.exists() ? progressSnapshot.data().topicRecommendations ?? {} : {}
        );
        setSubjectProgress(progressSnapshot.exists() ? progressSnapshot.data().subjectProgress ?? {} : {});
      })
      .catch((cause) => active && setError(secureErrorMessage(cause, "Unable to load learning materials.")))
      .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [userId, loadAttempt]);

  const selectedTopic = catalog?.topics.find((topic) => topic.id === topicId) ?? null;
  const adaptiveRecommendation = useMemo<AdaptiveRecommendation>(() =>
    topicRecommendations[topicKey(selectedTopic?.name ?? "")] ?? {
      recommendedDifficulty: "Basic",
      reason: "No completed session exists for this topic, so adaptive practice begins at Basic.",
      confidence: "low",
    }, [selectedTopic?.name, topicRecommendations]);
  const topics = catalog?.topics.filter((topic) => topic.subjectId === subjectId) ?? [];

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
    if (!topicId) return;
    setError(null);
    setLoading(true);
    try {
      let confirmationHash: string | undefined;
      if (mode === "free_form") {
        const preview = await previewVerifiedProblem({ topicId, question: question.trim(), requestedDifficulty: difficulty });
        if (!window.confirm(`Confirm these givens before starting: ${preview.description}`)) return;
        confirmationHash = preview.confirmationHash;
      }
      const result = await startLearningSession(
        mode === "curated"
          ? { mode, topicId }
          : { mode, topicId, question: question.trim(), requestedDifficulty: difficulty, confirmationHash }
      );
      navigate(`/session/${result.session.id}/learn`);
    } catch (cause) {
      setError(secureErrorMessage(cause, "The secure session could not be started."));
    } finally {
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
        <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
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
          <p className="mt-2 text-slate-600 dark:text-slate-400">Choose an approved topic. For prepared practice, MINDGUIDE selects an adaptive, non-repeating validated question.</p>
        </div>
        {error && <ErrorMessage message={error} />}
        {catalog && catalog.subjects.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Choose a subject</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {catalog.subjects.map((subject) => {
                const progress = subjectProgress[subject.name];
                const selected = subject.id === subjectId;
                return (
                  <button key={subject.id} type="button" onClick={() => {
                    setSubjectId(subject.id);
                    setTopicId(catalog.topics.find((topic) => topic.subjectId === subject.id)?.id ?? "");
                  }} className={`rounded-2xl border p-5 text-left transition ${selected ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600/20 dark:bg-indigo-950/30" : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900"}`}>
                    <h3 className="font-bold text-slate-950 dark:text-white">{subject.name}</h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{subject.description}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
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
        <div className="grid grid-cols-2 gap-3">
          <ModeButton active={mode === "curated"} onClick={() => setMode("curated")} icon={<BookOpen className="mx-auto mb-2 h-5 w-5" />} label="Prepared problem" />
          <ModeButton active={mode === "free_form"} onClick={() => setMode("free_form")} icon={<CheckCircle2 className="mx-auto mb-2 h-5 w-5" />} label="My own problem" />
        </div>
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          {catalog && catalog.topics.length > 0 ? (
            <>
              <div className={`grid gap-4 ${mode === "free_form" ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                <label className="text-sm font-bold">Validated topic
                  <select value={topicId} onChange={(event) => setTopicId(event.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal">
                    {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                  </select>
                </label>
                {mode === "free_form" && (
                  <label className="text-sm font-bold">Intrinsic complexity
                    <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} className="mt-2 w-full rounded-lg border p-3 font-normal">
                      <option>Basic</option><option>Intermediate</option><option>Advanced</option>
                    </select>
                  </label>
                )}
              </div>
              {mode === "curated" ? (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
                  <p className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300">Adaptive assignment · {adaptiveRecommendation.recommendedDifficulty}</p>
                  <p className="mt-1 text-sm text-indigo-900 dark:text-indigo-200">{adaptiveRecommendation.reason}</p>
                </div>
              ) : (
                <label className="block text-sm font-bold">Keyboard-entered problem
                  <span className="block text-sm font-normal">Use mean, median, or mode followed by a numeric dataset; or product, permutation, or combination followed by integer parameters. Review the extracted givens before starting.</span>
                  <textarea required value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={5} placeholder="Examples: mean: 4, 8, 12 or combination: 8, 3" className="mt-2 w-full rounded-lg border p-3 font-normal" />
                </label>
              )}
              <button disabled={loading || !topicId || (mode === "free_form" && question.trim().length < 8)} onClick={() => void begin()} className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
                {loading ? "Starting secure session..." : mode === "curated" ? "Assign my prepared problem" : "Validate and start"}
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              No approved topics are available yet.
            </div>
          )}
        </div>
      </div>
    </StudentShell>
  );
}

function CenteredLoader() {
  return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
}

function ErrorMessage({ message }: { message: string }) {
  return <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{message}</div>;
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-4 font-bold ${active ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}>{icon}{label}</button>;
}

function topicKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
