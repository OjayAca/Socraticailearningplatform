import { useCallback, useEffect, useState, type ReactNode } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { createFollowUpSession } from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";
import { NotificationContent, ProfileContent, SettingsContent } from "./SharedScreens";
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
  return <StudentShell active="dashboard"><h1 className="text-3xl font-bold">Learner dashboard</h1><p className="mt-2 text-slate-600">Continue an authoritative reasoning session or review preserved learning evidence.</p>{error && <Notice message={error} />}<div className="mt-6 grid gap-4 sm:grid-cols-3"><Stat label="Completed" value={completed.length} /><Stat label="Formative average" value={`${average}/100`} /><Stat label="Active" value={sessions.filter((item) => item.status === "in_progress").length} /></div><div className="mt-8 rounded-2xl border bg-white"><div className="flex items-center justify-between border-b p-4"><h2 className="font-bold">Recent sessions</h2><Link to="/student/task" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Start session</Link></div>{loading ? <Spinner /> : <SessionRows sessions={sessions.slice(0, 10)} />}</div></StudentShell>;
}

export function SecureStudentHistory() {
  const { sessions, loading, error } = useLearnerSessions();
  return <StudentShell active="history"><h1 className="text-3xl font-bold">Learning history</h1><p className="mt-2 text-slate-600">Submitted v3 records and preserved legacy history remain read-only.</p>{error && <Notice message={error} />}<div className="mt-6 rounded-2xl border bg-white">{loading ? <Spinner /> : <SessionRows sessions={sessions} />}</div></StudentShell>;
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
  if (!session) return <StudentShell active="history"><Notice message={error ?? "The learning record was not found."} /><Link to="/student/history" className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">Return to history</Link></StudentShell>;
  return <StudentShell active="history">{error && <Notice message={error} />}<><h1 className="text-3xl font-bold">Reasoning record</h1><p className="mt-2 text-slate-600">{session.subject} · {session.topic} · {session.status}</p><div className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-bold">Problem</h2><p className="mt-2">{session.originalQuestion ?? session.problemContext?.promptSnapshot}</p>{session.scorecard && <ScorecardDetails scorecard={session.scorecard} />}</div><div className="mt-5 space-y-3">{responses.map((item) => <div key={item.id} className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-indigo-600">{String(item.phase).replace(/_/g, " ")}</p><p className="mt-2">{item.response?.plainText}</p><p className="mt-2 text-sm text-slate-600">{item.evaluation?.evidenceSummary}</p></div>)}</div>{session.releasedSolution && <SolutionDetails solution={session.releasedSolution} />}{session.adminReview && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold">Administrator feedback</p><p className="mt-1">{session.adminReview.comment}</p></div>}{session.status === "returned" && !session.followUpSessionId && <button onClick={() => void retry()} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">Create one linked follow-up</button>}</></StudentShell>;
}

export function SecureStudentProfile() { return <StudentShell active="profile"><ProfileContent /></StudentShell>; }
export function SecureStudentSettings() { return <StudentShell active="settings"><SettingsContent /></StudentShell>; }
export function SecureStudentNotifications() { return <StudentShell active="notifications"><NotificationContent /></StudentShell>; }

function SessionRows({ sessions }: { sessions: Record<string, any>[] }) { return <div className="divide-y">{sessions.length === 0 && <p className="p-8 text-center text-slate-500">No learning records yet.</p>}{sessions.map((session) => <Link key={session.id} to={session.status === "in_progress" && session.schemaVersion === 3 && session.workflowVersion === 4 ? `/session/${session.id}/learn` : `/student/review/${session.id}`} className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[1fr_1.5fr_auto_auto]"><span className="font-semibold">{session.subject ?? "Legacy record"}</span><span className="text-slate-600">{session.topic ?? session.originalQuestion ?? "Preserved session"}</span><span className="font-bold text-indigo-600">{session.scorecard?.total ?? session.ctScore ?? "—"}</span><span className="text-sm capitalize text-slate-500">{String(session.status).replace(/_/g, " ")}</span></Link>)}</div>; }
function Stat({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>; }
function Spinner() { return <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>; }
function Notice({ message }: { message: string }) { return <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{message}</div>; }
function ScorecardDetails({ scorecard }: { scorecard: Record<string, any> }) { return <div className="mt-4"><p className="text-3xl font-bold text-indigo-600">{scorecard.total}/100</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.values(scorecard.criteria ?? {}).map((criterion: any) => <div key={criterion.category} className="rounded-lg bg-indigo-50 p-3 text-sm"><div className="flex justify-between font-bold"><span>{String(criterion.category).replace(/([A-Z])/g, " $1")}</span><span>{criterion.score}/25</span></div><p className="mt-1 text-xs text-slate-600">{criterion.reason}</p></div>)}</div></div>; }
function SolutionDetails({ solution }: { solution: Record<string, any> }) { return <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold uppercase text-emerald-700">Unlocked worked solution</p><p className="mt-2 text-sm"><strong>Method:</strong> {solution.method}</p><p className="mt-2 text-sm"><strong>Why it applies:</strong> {solution.justification}</p><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{(solution.steps ?? []).map((step: string) => <li key={step}>{step}</li>)}</ol><p className="mt-3 text-sm"><strong>Final answer:</strong> {solution.answer}</p><p className="mt-2 text-sm"><strong>Verification:</strong> {solution.verification}</p><p className="mt-2 text-sm"><strong>Interpretation:</strong> {solution.interpretation}</p></div>; }
