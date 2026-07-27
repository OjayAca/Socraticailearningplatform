import { useCallback, useEffect, useState, type ReactNode } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Gauge,
  Loader2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { createFollowUpSession } from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";
import { NotificationContent } from "./student/NotificationContent";
import { ProfileContent } from "./student/ProfileContent";
import { SettingsContent } from "./student/SettingsContent";
import { StudentShell } from "./StudentShell";

function useLearnerSessions(maximum = 100) {
  const uid = useAuthStore((state) => state.firebaseUser?.uid);
  const [sessions, setSessions] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!db || !uid) return;
    setLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, "sessions"), where("studentId", "==", uid), orderBy("updatedAt", "desc"), limit(maximum)));
      setSessions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Learning records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [maximum, uid]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return { sessions, loading, error };
}

export function SecureStudentDashboard() {
  const { sessions, loading, error } = useLearnerSessions(20);
  const completed = sessions.filter((item) => ["submitted", "reviewed", "returned"].includes(item.status));
  const average = completed.length ? Math.round(completed.reduce((sum, item) => sum + Number(item.scorecard?.total ?? item.ctScore ?? 0), 0) / completed.length) : 0;
  const activeSessions = sessions.filter((item) => item.status === "in_progress").length;

  return (
    <StudentShell active="dashboard">
      <div className="space-y-6">
        {error && <Notice message={error} />}

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Learning overview">
          <Stat
            label="Completed"
            value={completed.length}
            Icon={CheckCircle2}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          />
          <Stat
            label="Formative average"
            value={`${average}/100`}
            Icon={Gauge}
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          />
          <Stat
            label="Active"
            value={activeSessions}
            Icon={Activity}
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          />
        </section>

        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 px-5 py-6 text-white shadow-xl shadow-indigo-600/20 sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-indigo-100">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">Guided practice</span>
              </div>
              <h2 className="text-xl font-bold sm:text-2xl">Ready to tackle a new problem?</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100">
                Continue an authoritative reasoning session or review preserved learning evidence.
              </p>
            </div>
            <Link
              to="/student/task"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600 sm:self-auto"
            >
              Start session
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-950 dark:text-white">Recent sessions</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Resume active work or review your preserved learning evidence.
            </p>
          </div>
          {loading ? <Spinner /> : <SessionRows sessions={sessions.slice(0, 10)} />}
        </section>
      </div>
    </StudentShell>
  );
}

export function SecureStudentHistory() {
  const { sessions, loading, error } = useLearnerSessions();
  return (
    <StudentShell active="history">
      <h2 className="text-3xl font-bold text-slate-950 dark:text-white">Learning history</h2>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Submitted v3 records and preserved legacy history remain read-only.
      </p>
      {error && <Notice message={error} />}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        {loading ? <Spinner /> : <SessionRows sessions={sessions} />}
      </div>
    </StudentShell>
  );
}

export function SecureStudentReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Record<string, any> | null>(null);
  const [responses, setResponses] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!db || !sessionId) return;
    let active = true;
    Promise.all([
      getDoc(doc(db, "sessions", sessionId)),
      getDocs(query(collection(db, "sessions", sessionId, "responses"), orderBy("createdAt", "asc"))),
    ]).then(([sessionSnapshot, responseSnapshot]) => {
      if (!active) return;
      setSession(sessionSnapshot.exists() ? { id: sessionSnapshot.id, ...sessionSnapshot.data() } : null);
      setResponses(responseSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "The learning record could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [sessionId]);
  async function retry() { if (!sessionId) return; try { const result = await createFollowUpSession(sessionId); navigate(`/session/${result.session.id}/learn`); } catch (cause) { setError(cause instanceof Error ? cause.message : "A follow-up could not be created."); } }
  if (!sessionId) return <Navigate to="/student/history" replace />;
  if (loading) return <StudentShell active="history"><Spinner /></StudentShell>;
  if (!session) return <StudentShell active="history"><Notice message={error ?? "The learning record was not found."} /><Link to="/student/history" className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Return to history</Link></StudentShell>;
  return <StudentShell active="history">{error && <Notice message={error} />}<><h2 className="text-3xl font-bold text-slate-950 dark:text-white">Reasoning record</h2><p className="mt-2 text-slate-600 dark:text-slate-400">{session.subject} · {session.topic} · {session.status}</p><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"><h3 className="font-bold text-slate-950 dark:text-white">Problem</h3><p className="mt-2 text-slate-700 dark:text-slate-300">{session.originalQuestion ?? session.problemContext?.promptSnapshot}</p>{session.scorecard && <ScorecardDetails scorecard={session.scorecard} />}</div><div className="mt-5 space-y-3">{responses.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"><p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400">{String(item.phase).replace(/_/g, " ")}</p><p className="mt-2 text-slate-800 dark:text-slate-200">{item.response?.plainText}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{item.evaluation?.evidenceSummary}</p></div>)}</div>{session.releasedSolution && <SolutionDetails solution={session.releasedSolution} />}{session.adminReview && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><p className="font-bold">Administrator feedback</p><p className="mt-1">{session.adminReview.comment}</p></div>}{session.status === "returned" && !session.followUpSessionId && <button onClick={() => void retry()} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Create one linked follow-up</button>}</></StudentShell>;
}

export function SecureStudentProfile() { return <StudentShell active="profile"><ProfileContent /></StudentShell>; }
export function SecureStudentSettings() { return <StudentShell active="settings"><SettingsContent /></StudentShell>; }
export function SecureStudentNotifications() { return <StudentShell active="notifications"><NotificationContent /></StudentShell>; }

function SessionRows({ sessions }: { sessions: Record<string, any>[] }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {sessions.length === 0 && (
        <div className="px-5 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <BookOpen className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold text-slate-700 dark:text-slate-300">No learning records yet.</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Start your first guided session when you are ready.</p>
        </div>
      )}
      {sessions.map((session) => (
        <Link
          key={session.id}
          to={session.status === "in_progress" && session.schemaVersion === 3 && session.workflowVersion === 4 ? `/session/${session.id}/learn` : `/student/review/${session.id}`}
          className="grid gap-2 px-5 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
        >
          <span className="font-semibold text-slate-900 dark:text-slate-100">{session.subject ?? "Legacy record"}</span>
          <span className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{session.topic ?? session.originalQuestion ?? "Preserved session"}</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">{session.scorecard?.total ?? session.ctScore ?? "—"}</span>
          <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{String(session.status).replace(/_/g, " ")}</span>
        </Link>
      ))}
    </div>
  );
}

function Stat({ label, value, Icon, iconClassName }: { label: string; value: ReactNode; Icon: LucideIcon; iconClassName: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function Spinner() { return <div role="status" aria-label="Loading learning records" className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-indigo-600 dark:text-indigo-400" /></div>; }
function Notice({ message }: { message: string }) { return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{message}</div>; }
function ScorecardDetails({ scorecard }: { scorecard: Record<string, any> }) { return <div className="mt-4"><p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{scorecard.total}/100</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.values(scorecard.criteria ?? {}).map((criterion: any) => <div key={criterion.category} className="rounded-lg bg-indigo-50 p-3 text-sm text-slate-900 dark:bg-indigo-950/40 dark:text-indigo-100"><div className="flex justify-between font-bold"><span>{String(criterion.category).replace(/([A-Z])/g, " $1")}</span><span>{criterion.score}/25</span></div><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{criterion.reason}</p></div>)}</div></div>; }
function SolutionDetails({ solution }: { solution: Record<string, any> }) { return <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">Unlocked worked solution</p><p className="mt-2 text-sm"><strong>Method:</strong> {solution.method}</p><p className="mt-2 text-sm"><strong>Why it applies:</strong> {solution.justification}</p><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{(solution.steps ?? []).map((step: string) => <li key={step}>{step}</li>)}</ol><p className="mt-3 text-sm"><strong>Final answer:</strong> {solution.answer}</p><p className="mt-2 text-sm"><strong>Verification:</strong> {solution.verification}</p><p className="mt-2 text-sm"><strong>Interpretation:</strong> {solution.interpretation}</p></div>; }
