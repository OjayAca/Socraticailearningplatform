import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router";
import { AlertCircle, BookOpen, CheckCircle2, Loader2, ShieldCheck, UserRoundCheck } from "lucide-react";
import type {
  AcademicProfile,
  AdaptiveRecommendation,
  Difficulty,
  GetCurrentConsentNoticeResponse,
  LearningCatalog,
} from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  bootstrapProfile,
  completeAcademicProfile,
  getCurrentConsentNotice,
  getLearningCatalog,
  startLearningSession,
} from "@/lib/secure-api";
import { secureErrorMessage } from "@/lib/secure-error";
import { useAuthStore } from "@/stores/auth-store";
import { StudentShell } from "./StudentShell";

const EMPTY_PROFILE: AcademicProfile = {
  studentNumber: "",
  course: "",
  yearLevel: "",
  section: "",
};

export function SecureTaskStart() {
  const navigate = useNavigate();
  const { firebaseUser, userProfile, reloadProfile } = useAuthStore();
  const [mode, setMode] = useState<"curated" | "free_form">("curated");
  const [catalog, setCatalog] = useState<LearningCatalog | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Basic");
  const [question, setQuestion] = useState("");
  const [academicProfile, setAcademicProfile] = useState<AcademicProfile>(
    userProfile?.academicProfile ?? EMPTY_PROFILE
  );
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
      getLearningCatalog(),
      getCurrentConsentNotice(),
      getDoc(doc(database, "learning_progress", firebaseUser.uid)),
    ])
      .then(async ([nextCatalog, currentNotice, progressSnapshot]) => {
        const consentSnapshot = await getDoc(
          doc(database, "users", firebaseUser.uid, "consents", currentNotice.version)
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
      })
      .catch((cause) => setError(secureErrorMessage(cause, "Learning catalog could not be loaded.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  const selectedTopic = catalog?.topics.find((topic) => topic.id === topicId) ?? null;
  const adaptiveRecommendation = useMemo<AdaptiveRecommendation>(() =>
    topicRecommendations[topicKey(selectedTopic?.name ?? "")] ?? {
      recommendedDifficulty: "Basic",
      reason: "No completed session exists for this topic, so adaptive practice begins at Basic.",
      confidence: "low",
    }, [selectedTopic?.name, topicRecommendations]);
  const topics = catalog?.topics.filter((topic) => topic.subjectId === subjectId) ?? [];

  async function saveAcademicProfile(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await completeAcademicProfile(academicProfile);
      await reloadProfile();
    } catch (cause) {
      setError(secureErrorMessage(cause, "Academic profile could not be saved."));
    } finally {
      setLoading(false);
    }
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
    if (!topicId) return;
    setError(null);
    setLoading(true);
    try {
      const result = await startLearningSession(
        mode === "curated"
          ? { mode, topicId }
          : { mode, topicId, question: question.trim(), requestedDifficulty: difficulty }
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

  if (userProfile && !userProfile.academicProfileComplete) {
    return (
      <StudentShell active="task">
        <form onSubmit={saveAcademicProfile} className="mx-auto max-w-2xl rounded-3xl border bg-white p-8 shadow-sm">
          <UserRoundCheck className="h-12 w-12 text-indigo-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Complete your academic profile</h1>
          <p className="mt-2 text-sm text-slate-600">
            These fields are required before your first learning session and are visible only to you and authorized System Administrators.
          </p>
          {error && <ErrorMessage message={error} />}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {([
              ["studentNumber", "Student number"],
              ["course", "Course"],
              ["yearLevel", "Year level"],
              ["section", "Section"],
            ] as const).map(([field, label]) => (
              <label key={field} className="text-sm font-bold text-slate-800">
                {label}
                <input
                  required
                  maxLength={field === "course" ? 160 : 80}
                  value={academicProfile[field]}
                  onChange={(event) => setAcademicProfile((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))}
                  className="mt-2 w-full rounded-lg border p-3 font-normal"
                />
              </label>
            ))}
          </div>
          <button disabled={loading} className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
            {loading ? "Saving profile..." : "Save and continue"}
          </button>
        </form>
      </StudentShell>
    );
  }

  if (consented === false) {
    return (
      <StudentShell active="task">
        <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-100 bg-white p-8 shadow-sm">
          <ShieldCheck className="h-12 w-12 text-indigo-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Privacy and Responsible AI Notice</h1>
          <p className="mt-3 text-slate-600">{notice?.summary}</p>
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            Raw AI service logs are retained for 90 days. Identifiable learning records follow the configured capstone retention period.
          </div>
          <label className="mt-6 flex items-start gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} className="mt-1" />
            I have read the notice, understand that AI feedback can be inaccurate, and consent to the described capstone data use.
          </label>
          {error && <ErrorMessage message={error} />}
          <button disabled={!acknowledge || loading} onClick={() => void acceptNotice()} className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
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
          <h1 className="text-3xl font-bold text-slate-950">Start a secure MINDGUIDE session</h1>
          <p className="mt-2 text-slate-600">Choose an approved topic. For prepared practice, the server assigns an adaptive, non-repeating validated variant.</p>
        </div>
        {error && <ErrorMessage message={error} />}
        <div className="grid grid-cols-2 gap-3">
          <ModeButton active={mode === "curated"} onClick={() => setMode("curated")} icon={<BookOpen className="mx-auto mb-2 h-5 w-5" />} label="Prepared problem" />
          <ModeButton active={mode === "free_form"} onClick={() => setMode("free_form")} icon={<CheckCircle2 className="mx-auto mb-2 h-5 w-5" />} label="My own problem" />
        </div>
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          {catalog && catalog.topics.length > 0 ? (
            <>
              <div className={`grid gap-4 ${mode === "free_form" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                <label className="text-sm font-bold">Subject
                  <select value={subjectId} onChange={(event) => {
                    const nextSubject = event.target.value;
                    setSubjectId(nextSubject);
                    setTopicId(catalog.topics.find((topic) => topic.subjectId === nextSubject)?.id ?? "");
                  }} className="mt-2 w-full rounded-lg border p-3 font-normal">
                    {catalog.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </label>
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
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-xs font-bold uppercase text-indigo-700">Adaptive assignment · {adaptiveRecommendation.recommendedDifficulty}</p>
                  <p className="mt-1 text-sm text-indigo-900">{adaptiveRecommendation.reason}</p>
                </div>
              ) : (
                <label className="block text-sm font-bold">Keyboard-entered problem
                  <textarea required value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={5} placeholder="Enter a solvable problem in the selected approved topic." className="mt-2 w-full rounded-lg border p-3 font-normal" />
                </label>
              )}
              <button disabled={loading || !topicId || (mode === "free_form" && question.trim().length < 8)} onClick={() => void begin()} className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">
                {loading ? "Starting secure session..." : mode === "curated" ? "Assign my prepared problem" : "Validate and start"}
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              No topic is ready for formal evaluation. A System Administrator must complete all three faculty-validated variants at every difficulty for a topic.
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
  return <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{message}</div>;
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-4 font-bold ${active ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}>{icon}{label}</button>;
}

function topicKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
