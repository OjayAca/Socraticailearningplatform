import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useNavigate } from "react-router";
import { AlertCircle, BookOpen, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type { AdaptiveRecommendation, Difficulty, GetCurrentConsentNoticeResponse, PublicProblem, Subject } from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import { bootstrapProfile, getCurrentConsentNotice, startLearningSession } from "@/lib/secure-api";
import { secureErrorMessage } from "@/lib/secure-error";
import { useAuthStore } from "@/stores/auth-store";
import { SUBJECT_TOPICS } from "@/types";
import { StudentShell } from "./StudentShell";

export function SecureTaskStart() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile } = useAuthStore();
  const [mode, setMode] = useState<"curated" | "free_form">("curated");
  const [subject, setSubject] = useState<Subject>("Quantitative Methods");
  const [topic, setTopic] = useState<string>(SUBJECT_TOPICS["Quantitative Methods"][0]);
  const [difficulty, setDifficulty] = useState<Difficulty>("Basic");
  const [problems, setProblems] = useState<PublicProblem[]>([]);
  const [problemId, setProblemId] = useState("");
  const [question, setQuestion] = useState("");
  const [consented, setConsented] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<GetCurrentConsentNoticeResponse | null>(null);
  const [topicRecommendations, setTopicRecommendations] = useState<Record<string, AdaptiveRecommendation>>({});
  const [acknowledge, setAcknowledge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !firebaseUser) return;
    const database = db;
    let active = true;
    Promise.all([
      getDocs(query(collection(database, "problems"), where("status", "==", "approved"))),
      getCurrentConsentNotice(),
      getDoc(doc(database, "learning_progress", firebaseUser.uid)),
    ])
      .then(async ([problemSnapshot, currentNotice, progressSnapshot]) => {
        const consentSnapshot = await getDoc(doc(database, "users", firebaseUser.uid, "consents", currentNotice.version));
        if (!active) return;
        setProblems(problemSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PublicProblem)));
        setConsented(consentSnapshot.exists());
        setNotice(currentNotice);
        setTopicRecommendations(progressSnapshot.exists() ? progressSnapshot.data().topicRecommendations ?? {} : {});
      })
      .catch((cause) => setError(secureErrorMessage(cause, "Learning content could not be loaded.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [firebaseUser]);

  const adaptiveRecommendation = useMemo<AdaptiveRecommendation>(() =>
    topicRecommendations[topicKey(topic)] ?? {
      recommendedDifficulty: "Basic",
      reason: "No completed session exists for this topic, so adaptive practice begins at Basic.",
      confidence: "low",
    }, [topic, topicRecommendations]);

  const effectiveDifficulty = mode === "curated"
    ? adaptiveRecommendation.recommendedDifficulty
    : difficulty;

  const availableProblems = useMemo(() => {
    const topicProblems = problems.filter((problem) => problem.subject === subject && problem.topic === topic);
    const exact = topicProblems.filter((problem) => problem.difficulty === effectiveDifficulty);
    if (exact.length > 0 || topicProblems.length === 0) return exact;
    const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
    const target = levels.indexOf(effectiveDifficulty);
    const nearestDistance = Math.min(...topicProblems.map((problem) =>
      Math.abs(levels.indexOf(problem.difficulty) - target)
    ));
    return topicProblems.filter((problem) =>
      Math.abs(levels.indexOf(problem.difficulty) - target) === nearestDistance
    );
  }, [effectiveDifficulty, problems, subject, topic]);

  const selectedProblemId = availableProblems.some((problem) => problem.id === problemId)
    ? problemId
    : availableProblems[0]?.id ?? "";

  function changeSubject(value: Subject) {
    setSubject(value);
    setTopic(SUBJECT_TOPICS[value][0]);
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
    setError(null);
    setLoading(true);
    try {
      const result = await startLearningSession(
        mode === "curated"
          ? { mode, problemId: selectedProblemId, subject, topic }
          : { mode, question: question.trim(), subject, topic, difficulty }
      );
      navigate(`/session/${result.session.id}/learn`);
    } catch (cause) {
      setError(secureErrorMessage(cause, "The secure session could not be started."));
    } finally {
      setLoading(false);
    }
  }

  if (loading && consented === null) {
    return (
      <StudentShell active="task">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </StudentShell>
    );
  }

  if (consented === false) {
    return (
      <StudentShell active="task">
        <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-100 bg-white p-8 shadow-sm">
          <ShieldCheck className="h-12 w-12 text-indigo-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Privacy and Responsible AI Notice</h1>
          <p className="mt-3 text-slate-600">{notice?.summary ?? "MINDGUIDE stores learning responses and formative feedback for capstone evaluation. AI feedback may be inaccurate and should be verified."}</p>
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            Raw AI service logs are retained for 90 days. Identifiable learning records are retained through study closure plus 12 months and are then anonymized.
          </div>
          <label className="mt-6 flex items-start gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} className="mt-1" />
            I have read the notice, understand that AI feedback can be inaccurate, and consent to the described data use for this capstone evaluation.
          </label>
          {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
          <button type="button" disabled={!acknowledge || loading} onClick={() => void acceptNotice()} className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
            {loading ? "Saving acknowledgement..." : "Acknowledge and continue"}
          </button>
        </div>
      </StudentShell>
    );
  }

  return (
    <StudentShell active="task">
      <div className="mx-auto max-w-3xl space-y-6">
        <div><h1 className="text-3xl font-bold text-slate-950">Start a secure MINDGUIDE session</h1><p className="mt-2 text-slate-600">Work through Problem Understanding, Method Selection, Computation, and Interpretation before the solution is unlocked.</p></div>
        {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="h-5 w-5" />{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setMode("curated")} className={`rounded-xl border p-4 font-bold ${mode === "curated" ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}><BookOpen className="mx-auto mb-2 h-5 w-5" />Prepared problem</button>
          <button onClick={() => setMode("free_form")} className={`rounded-xl border p-4 font-bold ${mode === "free_form" ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}><CheckCircle2 className="mx-auto mb-2 h-5 w-5" />My own problem</button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className={`grid gap-4 ${mode === "free_form" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <label className="text-sm font-bold">Subject<select value={subject} onChange={(event) => changeSubject(event.target.value as Subject)} className="mt-2 w-full rounded-lg border p-3 font-normal"><option>Quantitative Methods</option><option>Discrete Mathematics</option></select></label>
            <label className="text-sm font-bold">Topic<select value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal">{SUBJECT_TOPICS[subject].map((item) => <option key={item}>{item}</option>)}</select></label>
            {mode === "free_form" && <label className="text-sm font-bold">Complexity<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} className="mt-2 w-full rounded-lg border p-3 font-normal"><option>Basic</option><option>Intermediate</option><option>Advanced</option></select></label>}
          </div>
          {mode === "curated" ? (
            <><div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs font-bold uppercase text-indigo-700">Adaptive difficulty · {adaptiveRecommendation.recommendedDifficulty}</p><p className="mt-1 text-sm text-indigo-900">{adaptiveRecommendation.reason}</p></div><label className="block text-sm font-bold">Prepared problem<select value={selectedProblemId} onChange={(event) => setProblemId(event.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal"><option value="">Select a problem</option>{availableProblems.map((problem) => <option key={problem.id} value={problem.id}>{problem.problemText}</option>)}</select></label></>
          ) : (
            <label className="block text-sm font-bold">Keyboard-entered problem<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={5} placeholder="Enter a solvable problem in the selected topic. Images and OCR are not supported." className="mt-2 w-full rounded-lg border p-3 font-normal" /></label>
          )}
          <button type="button" disabled={loading || (mode === "curated" ? !selectedProblemId : question.trim().length < 8)} onClick={() => void begin()} className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{loading ? "Starting securely..." : "Begin reasoning"}</button>
        </div>
      </div>
    </StudentShell>
  );
}

function topicKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
