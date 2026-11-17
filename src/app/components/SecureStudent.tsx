import { studentHistory, historyResponse, historyMessage, type HistoryMessage } from "@/lib/learning/student-response";
import { displayPhaseLabel, displaySessionStatus } from "@/lib/learning/display-labels";
import { MathText } from "./MathText";
import { TutorMessageBubble } from "./TutorMessageBubble";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flame,
  Gauge,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { dashboardProgress, sessionTime } from "@/lib/learning/dashboard-progress";
import { peekView, watchView } from "@/lib/view-cache";
import { db } from "@/lib/firebase";
import { createFollowUpSession } from "@/lib/secure-api";
import {
  isResumableLearningSession,
  learnerSessionDestination,
} from "@/lib/session-compatibility";
import { useAuthStore } from "@/stores/auth-store";
import { NotificationContent } from "./student/NotificationContent";
import { ProfileContent } from "./student/ProfileContent";
import { SettingsContent } from "./student/SettingsContent";
import { StudentShell } from "./StudentShell";
import { ScorecardDetails } from "./ScorecardDetails";
import { Alert } from "./ui/alert";
import { ListRowSkeleton, Skeleton } from "./ui/skeleton";

type SessionsState = { sessions: Record<string, any>[]; loading: boolean; error: string | null };
function useLearnerSessions(maximum?: number, attempt = 0) {
  const uid = useAuthStore((state) => state.firebaseUser?.uid);
  const key = `sessions:${uid}`;
  const [result, setResult] = useState<{ key: string; state: SessionsState }>(() => ({
    key, state: peekView<SessionsState>(key) ?? { sessions: [], loading: true, error: null },
  }));
  useEffect(() => {
    if (!db || !uid) return;
    const database = db;
    return watchView<SessionsState>(key, (next, error) => onSnapshot(
      query(collection(database, "sessions"), where("studentId", "==", uid)), snapshot => {
        const sessions = snapshot.docs.map(item => studentHistory(item.id,item.data()));
        sessions.sort((a: Record<string, any>, b: Record<string, any>) => sessionTime(b.updatedAt ?? b.createdAt) - sessionTime(a.updatedAt ?? a.createdAt));
        next({ sessions, loading: false, error: null });
      }, error), state => setResult({ key, state }), () => setResult({ key, state: {
        sessions: [], loading: false, error: "Learning progress could not be loaded. Please try again.",
      } }));
  }, [uid, key, attempt]);
  const state = result.key === key ? result.state : { sessions: [], loading: true, error: null };
  return { ...state, sessions: maximum ? state.sessions.slice(0, maximum) : state.sessions };
}

export function SecureStudentDashboard() {
  const uid = useAuthStore((state) => state.firebaseUser?.uid);
  return <StudentDashboardMetrics key={uid ?? "signed-out"} uid={uid} />;
}

function StudentDashboardMetrics({ uid }: { uid: string | undefined }) {
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const { sessions, loading, error } = useLearnerSessions(undefined, attempt);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const unavailable = !db || !uid;
  const isMetricsLoading = loading && !unavailable;
  const progress = !loading && !error && !unavailable ? dashboardProgress(sessions, now) : null;
  const pendingValue = isMetricsLoading ? "Loading…" : "—";
  const unfinishedSession = !loading && !error && !unavailable
    ? sessions.find((session) =>
        isResumableLearningSession({
          id: String(session.id),
          schemaVersion: session.schemaVersion,
          workflowVersion: session.workflowVersion,
          status: session.status,
        }),
      )
    : undefined;

  return (
    <StudentShell active="dashboard">
      <div className="space-y-6">
        {(error || unavailable) && (
          <Alert
            tone="error"
            action={
              error ? (
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  onClick={() => {
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry learning progress
                </button>
              ) : undefined
            }
          >
            {error ?? "Sign in to load your learning progress."}
          </Alert>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Learning overview">
          <Stat
            label="Completed"
            loading={isMetricsLoading}
            value={progress?.sessionsCompleted ?? pendingValue}
            Icon={CheckCircle2}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          />
          <Stat
            label="Formative average"
            loading={isMetricsLoading}
            value={progress ? progress.averageCTScore === null ? "—" : `${progress.averageCTScore}/100` : pendingValue}
            Icon={Gauge}
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          />
          <Stat
            label="Current streak"
            loading={isMetricsLoading}
            value={progress ? `${progress.currentStreak} ${progress.currentStreak === 1 ? "day" : "days"}` : pendingValue}
            Icon={Flame}
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          />
          <Stat
            label="Latest scorecard"
            loading={isMetricsLoading}
            value={progress?.latestScorecard ? `${progress.latestScorecard.total}/100` : isMetricsLoading ? pendingValue : "—"}
            Icon={Activity}
            iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
          />
        </section>

        {progress?.latestScorecard && (
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Latest scorecard</p>
            <h2 className="mt-2 text-lg font-bold text-slate-950 dark:text-white">{progress.latestScorecard.subject} · {progress.latestScorecard.topic}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{progress.latestScorecard.summary}</p>
          </section>
        )}

        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 px-5 py-6 text-white shadow-xl shadow-indigo-600/20 sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-indigo-100">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">
                  {unfinishedSession ? "Session in progress" : "Guided practice"}
                </span>
              </div>
              <h2 className="text-xl font-bold sm:text-2xl">
                {unfinishedSession
                  ? `Continue ${unfinishedSession.subject ?? "your session"}`
                  : "Ready to tackle a new problem?"}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100">
                {unfinishedSession
                  ? `${unfinishedSession.topic ?? unfinishedSession.originalQuestion ?? "Pick up right where you left off"} — resume your saved reasoning without creating a duplicate session.`
                  : "Continue an authoritative reasoning session or review preserved learning evidence."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
              {unfinishedSession && (
                <Link
                  to={learnerSessionDestination({
                    id: String(unfinishedSession.id),
                    schemaVersion: unfinishedSession.schemaVersion,
                    workflowVersion: unfinishedSession.workflowVersion,
                    status: unfinishedSession.status,
                  })}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                >
                  Continue Session
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              )}
              <Link
                to="/student/task"
                className={
                  unfinishedSession
                    ? "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/15 px-5 py-3 text-sm font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                    : "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-lg transition hover:-translate-y-0.5 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                }
              >
                Start session
                {!unfinishedSession && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
              </Link>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-950 dark:text-white">Recent sessions</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Resume active work or review your preserved learning evidence.
            </p>
          </div>
          {!unavailable && (loading ? <ListRowSkeleton rows={4} label="Loading learning records" /> : !error && <SessionRows sessions={sessions.slice(0, 10)} />)}
        </section>
      </div>
    </StudentShell>
  );
}

type HistoryStatusFilter = "all" | "active" | "completed" | "returned" | "ended";

const HISTORY_STATUS_FILTERS: ReadonlyArray<{
  readonly id: HistoryStatusFilter;
  readonly label: string;
}> = [
  { id: "all", label: "All statuses" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "returned", label: "Returned" },
  { id: "ended", label: "Ended / Expired" },
];

function matchesStatusFilter(status: unknown, filter: HistoryStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return status === "in_progress" || status === "ready_for_submission";
  if (filter === "completed")
    return status === "submitted" || status === "reviewed" || status === "completed";
  if (filter === "returned") return status === "returned";
  return status === "abandoned" || status === "expired";
}

function formatSessionDate(session: Record<string, unknown>): string | null {
  const raw =
    session.submittedAt ??
    session.completedAt ??
    session.learningCompletedAt ??
    session.updatedAt ??
    session.createdAt;
  const ms = sessionTime(raw);
  if (!ms) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

function sessionStatusBadgeClass(status: unknown): string {
  if (status === "completed" || status === "reviewed" || status === "submitted") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "in_progress" || status === "ready_for_submission") {
    return "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";
  }
  if (status === "returned") {
    return "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

export function SecureStudentHistory() {
  const [attempt, setAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const { sessions, loading, error } = useLearnerSessions(undefined, attempt);

  const subjectOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const session of sessions) {
      if (typeof session.subject === "string" && session.subject.trim()) {
        unique.add(session.subject.trim());
      }
    }
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  const activeSubjectFilter =
    subjectFilter !== "all" && !subjectOptions.includes(subjectFilter) ? "all" : subjectFilter;

  const filteredSessions = useMemo(() => {
    const queryText = searchQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      if (!matchesStatusFilter(session.status, statusFilter)) return false;
      if (activeSubjectFilter !== "all" && session.subject !== activeSubjectFilter) return false;
      if (!queryText) return true;
      const haystack = [
        session.subject,
        session.topic,
        session.originalQuestion,
        displaySessionStatus(session.status),
      ]
        .filter((part) => typeof part === "string")
        .join(" ")
        .toLowerCase();
      return haystack.includes(queryText);
    });
  }, [sessions, searchQuery, statusFilter, activeSubjectFilter]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 || statusFilter !== "all" || activeSubjectFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setSubjectFilter("all");
  }

  return (
    <StudentShell active="history">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Learning history
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            Completed records and preserved legacy history remain read-only. Active sessions can be resumed from this list.
          </p>
        </div>

        {error && (
          <Alert
            tone="error"
            action={
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Retry
              </button>
            }
          >
            {error}
          </Alert>
        )}

        {!loading && !error && sessions.length > 0 && (
          <section
            aria-label="Filter learning history"
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  aria-label="Search sessions"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by subject, topic, or problem…"
                  className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-10 text-base text-slate-900 transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-slate-200"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
              {hasActiveFilters && (
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Showing {filteredSessions.length} of {sessions.length}
                  </span>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {HISTORY_STATUS_FILTERS.map((item) => {
                const active = statusFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatusFilter(item.id)}
                    className={`min-h-11 rounded-xl border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      active
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}

              {subjectOptions.length > 1 &&
                subjectOptions.map((subject) => {
                  const active = activeSubjectFilter === subject;
                  return (
                    <button
                      key={subject}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setSubjectFilter((current) => (current === subject ? "all" : subject))
                      }
                      className={`min-h-11 rounded-xl border px-3.5 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        active
                          ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200"
                          : "border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {subject}
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          {loading && !error ? (
            <ListRowSkeleton rows={5} label="Loading learning records" />
          ) : !error ? (
            filteredSessions.length === 0 && hasActiveFilters ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <Search aria-hidden="true" className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  No sessions match your current search or filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <SessionRows sessions={filteredSessions} />
            )
          ) : null}
        </div>
      </div>
    </StudentShell>
  );
}

export function SecureStudentReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Record<string, any> | null>(null);
  const [responses, setResponses] = useState<Record<string, any>[]>([]);
  const [conversation, setConversation] = useState<HistoryMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  useEffect(() => {
    if (!db || !sessionId) return;
    let active = true;
    Promise.all([
      getDoc(doc(db, "sessions", sessionId)),
      getDocs(query(collection(db, "sessions", sessionId, "responses"), orderBy("createdAt", "asc"))),
    ])
      .then(async ([sessionSnapshot, responseSnapshot]) => {
        if (!active) return;
        setSession(sessionSnapshot.exists() ? studentHistory(sessionSnapshot.id, sessionSnapshot.data()) : null);
        setResponses(responseSnapshot.docs.map((item) => historyResponse.parse({ ...item.data(), id: item.id })));
        if (sessionSnapshot.exists() && sessionSnapshot.data()?.workflowVersion === 6) {
          const messages = await getDocs(
            query(collection(db!, "sessions", sessionId, "messages"), orderBy("createdAt", "asc")),
          );
          if (active) {
            setConversation(messages.docs.map((item) => historyMessage.parse({ ...item.data(), id: item.id })));
          }
        }
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "The learning record could not be loaded."),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sessionId]);

  async function retry() {
    if (!sessionId || creatingFollowUp) return;
    setCreatingFollowUp(true);
    setError(null);
    try {
      const result = await createFollowUpSession(sessionId);
      navigate(`/session/${result.session.id}/learn`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A follow-up could not be created.");
    } finally {
      setCreatingFollowUp(false);
    }
  }

  if (!sessionId) return <Navigate to="/student/history" replace />;
  if (loading) {
    return (
      <StudentShell active="history">
        <ListRowSkeleton rows={4} label="Loading learning records" />
      </StudentShell>
    );
  }
  if (!session) {
    return (
      <StudentShell active="history">
        <div className="space-y-4">
          <Alert tone="error">{error ?? "The learning record was not found."}</Alert>
          <Link
            to="/student/history"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Return to history
          </Link>
        </div>
      </StudentShell>
    );
  }

  const sessionDate = formatSessionDate(session);

  return (
    <StudentShell active="history">
      <div className="space-y-6">
        <Link
          to="/student/history"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to history
        </Link>

        {error && <Alert tone="error">{error}</Alert>}

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Reasoning record
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>
              {session.subject ?? "Legacy record"} · {session.topic ?? "Preserved session"}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${sessionStatusBadgeClass(session.status)}`}
            >
              {displaySessionStatus(session.status)}
            </span>
            {sessionDate && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                · {sessionDate}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <h3 className="font-bold text-slate-950 dark:text-white">Problem</h3>
          <div className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
            <MathText text={session.originalQuestion ?? session.problemContext?.promptSnapshot} />
          </div>
          {session.scorecard && <ScorecardDetails scorecard={session.scorecard} />}
        </div>

        {session.workflowVersion !== 6 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            Preserved historical practice record. Start a new session for AI tutoring.
          </div>
        )}

        {session.draft && (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="font-bold text-slate-950 dark:text-white">Saved final draft</h3>
            {(session.draft.answer?.plainText || session.draft.answer?.latex) && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Final answer
                </p>
                <div className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                  <MathText
                    text={session.draft.answer?.plainText}
                    latex={session.draft.answer?.latex}
                  />
                </div>
              </div>
            )}
            {session.draft.methodology && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Methodology
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
                  {session.draft.methodology}
                </p>
              </div>
            )}
            {session.draft.reflection && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Reflection
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
                  {session.draft.reflection}
                </p>
              </div>
            )}
          </section>
        )}

        {conversation.length > 0 && (
          <section aria-label="Saved tutor conversation" className="space-y-3">
            <h3 className="font-bold text-slate-950 dark:text-white">Socratic conversation</h3>
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-950/50">
              {conversation.map((message) => (
                <TutorMessageBubble
                  key={message.id}
                  role={message.role}
                  text={message.text}
                  phaseLabel={message.phase ? displayPhaseLabel(message.phase) : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {responses.length > 0 && (
          <div className="space-y-3">
            {responses.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  {item.phase ? displayPhaseLabel(String(item.phase)) : "Reasoning checkpoint"}
                </p>
                <div className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                  <MathText text={item.response?.plainText} latex={item.response?.latex} />
                </div>
                {item.evaluation?.evidenceSummary && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    {item.evaluation.evidenceSummary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {session.releasedSolution && <SolutionDetails solution={session.releasedSolution} />}

        {session.adminReview && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p className="font-bold">Administrator feedback</p>
            <p className="mt-1 text-sm leading-6">{session.adminReview.comment}</p>
          </div>
        )}

        {session.status === "returned" && !session.followUpSessionId && (
          <button
            type="button"
            disabled={creatingFollowUp}
            onClick={() => void retry()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            {creatingFollowUp && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            <span>{creatingFollowUp ? "Creating follow-up..." : "Create one linked follow-up"}</span>
          </button>
        )}
      </div>
    </StudentShell>
  );
}

export function SecureStudentProfile() { return <StudentShell active="profile"><ProfileContent /></StudentShell>; }
export function SecureStudentSettings() { return <StudentShell active="settings"><SettingsContent /></StudentShell>; }
export function SecureStudentNotifications() { return <StudentShell active="notifications"><NotificationContent /></StudentShell>; }

function SessionRows({ sessions }: { sessions: Record<string, any>[] }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {sessions.length === 0 && (
        <div className="px-5 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <BookOpen aria-hidden="true" className="h-6 w-6" />
          </span>
          <p className="mt-4 mx-auto max-w-md text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
            Your learning journey starts here. Start your first MINDGUIDE session to practice mathematical reasoning.
          </p>
          <Link
            to="/student/task"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Start your first session
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      )}
      {sessions.map((session) => {
        const score = session.scorecard?.total ?? session.ctScore;
        const formattedDate = formatSessionDate(session);
        return (
          <Link
            key={session.id}
            to={learnerSessionDestination({
              id: String(session.id),
              schemaVersion: session.schemaVersion,
              workflowVersion: session.workflowVersion,
              status: session.status,
            })}
            className="grid min-h-11 gap-2 px-5 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
          >
            <div className="min-w-0">
              <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">
                {session.subject ?? "Legacy record"}
              </span>
              {formattedDate && (
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {formattedDate}
                </span>
              )}
            </div>
            <span className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
              {session.topic ?? session.originalQuestion ?? "Preserved session"}
            </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              {typeof score === "number" ? `${score}/100` : "—"}
            </span>
            <span
              className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${sessionStatusBadgeClass(session.status)}`}
            >
              {displaySessionStatus(session.status)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  loading = false,
  Icon,
  iconClassName,
}: {
  label: string;
  value: ReactNode;
  loading?: boolean;
  Icon: LucideIcon;
  iconClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
        {loading ? (
          <>
            <span className="sr-only">Loading…</span>
            <Skeleton className="mt-1 h-8 w-20" />
          </>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function SolutionDetails({ solution }: { solution: Record<string, any> }) {
  return (
    <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        Unlocked worked solution
      </p>
      <p className="text-sm">
        <strong>Method:</strong> {solution.method}
      </p>
      <p className="text-sm">
        <strong>Why it applies:</strong> {solution.justification}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {(solution.steps ?? []).map((step: string, index: number) => (
          <li key={`${step}_${index}`}>{step}</li>
        ))}
      </ol>
      <p className="text-sm">
        <strong>Final answer:</strong> {solution.answer}
      </p>
      <p className="text-sm">
        <strong>Verification:</strong> {solution.verification}
      </p>
      <p className="text-sm">
        <strong>Interpretation:</strong> {solution.interpretation}
      </p>
    </div>
  );
}
