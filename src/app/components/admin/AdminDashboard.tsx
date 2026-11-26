"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  FilePlus2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { Link } from "react-router";
import type { LearningProgress, Subject } from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import { displaySessionStatus } from "@/lib/learning/display-labels";
import { Alert } from "../ui/alert";
import { ListRowSkeleton, Skeleton } from "../ui/skeleton";
import { AdminShell } from "./AdminShell";
import {
  AdminStat,
  PageTitle,
} from "./admin-shared";
import {
  errorMessage,
  formatTimestamp,
  statusBadgeClass,
  type TimestampLike,
} from "./admin-utils";

const SUBJECTS: ReadonlyArray<Subject> = ["Quantitative Methods", "Discrete Mathematics"];
const ACTIVE_SESSION_STATUSES = new Set(["in_progress", "ready_for_submission"]);
const COMPLETED_SESSION_STATUSES = new Set(["completed", "submitted", "reviewed"]);
const MS_PER_DAY = 86_400_000;

interface DashboardUserDoc {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
  createdAt?: TimestampLike;
}

interface DashboardSessionDoc {
  id: string;
  studentId?: string;
  studentName?: string;
  subject?: string;
  topic?: string;
  status?: string;
  ctScore?: number;
  scorecard?: {
    total?: number;
  } | null;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  learningCompletedAt?: TimestampLike;
}

interface DashboardProblemDoc {
  id: string;
  subject?: string;
  topic?: string;
  difficulty?: string;
  status?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

interface DashboardAuditDoc {
  id: string;
  action?: string;
  operation?: string;
  target?: string;
  reason?: string;
  createdAt?: TimestampLike;
}

interface DashboardState {
  users: DashboardUserDoc[];
  sessions: DashboardSessionDoc[];
  problems: DashboardProblemDoc[];
  audits: DashboardAuditDoc[];
  progressRecords: LearningProgress[];
  totalSessionCount: number;
  submittedSessionCount: number;
  activeServerCount: number | null;
  completedServerCount: number | null;
  auditCount: number;
}

interface WeeklyActivityBucket {
  key: string;
  dayLabel: string;
  fullDateLabel: string;
  completed: number;
  ongoing: number;
}

interface SubjectPerformanceSummary {
  subject: Subject;
  sessionCount: number;
  completedCount: number;
  activeCount: number;
  scoredCount: number;
  averageScore: number | null;
}

type ActivityCategory = "registration" | "session" | "content" | "audit";

interface AdminActivityItem {
  id: string;
  category: ActivityCategory;
  title: string;
  subtitle: string;
  timestampMs: number;
  timestampRaw: TimestampLike;
  href: string;
  badge?: string;
}

function toEpochMs(value: TimestampLike): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "object") {
    if ("toMillis" in value && typeof value.toMillis === "function") {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if ("toDate" in value && typeof value.toDate === "function") {
      const ms = value.toDate().getTime();
      return Number.isNaN(ms) ? null : ms;
    }
  }
  return null;
}

function toDayKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSessionScore(session: DashboardSessionDoc): number | null {
  const raw = session.scorecard?.total ?? session.ctScore;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function buildWeeklyBuckets(
  sessions: ReadonlyArray<DashboardSessionDoc>,
  referenceNowMs: number,
): WeeklyActivityBucket[] {
  const anchor = new Date(referenceNowMs);
  anchor.setHours(0, 0, 0, 0);
  const anchorMs = anchor.getTime();

  const buckets: WeeklyActivityBucket[] = [];
  const indexByKey = new Map<string, number>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayDate = new Date(anchorMs - offset * MS_PER_DAY);
    const key = toDayKey(dayDate.getTime());
    indexByKey.set(key, buckets.length);
    buckets.push({
      key,
      dayLabel: dayDate.toLocaleDateString(undefined, { weekday: "short" }),
      fullDateLabel: dayDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      completed: 0,
      ongoing: 0,
    });
  }

  for (const session of sessions) {
    const status = session.status ?? "";
    const isCompleted = COMPLETED_SESSION_STATUSES.has(status);
    const isOngoing = ACTIVE_SESSION_STATUSES.has(status);
    if (!isCompleted && !isOngoing) continue;

    const timestampMs =
      toEpochMs(session.learningCompletedAt) ??
      toEpochMs(session.updatedAt) ??
      toEpochMs(session.createdAt);
    if (timestampMs === null) continue;

    const bucketIndex = indexByKey.get(toDayKey(timestampMs));
    if (bucketIndex === undefined) continue;

    if (isCompleted) {
      buckets[bucketIndex].completed += 1;
    } else {
      buckets[bucketIndex].ongoing += 1;
    }
  }

  return buckets;
}

function computeSubjectPerformance(
  sessions: ReadonlyArray<DashboardSessionDoc>,
): SubjectPerformanceSummary[] {
  return SUBJECTS.map((subject) => {
    const matching = sessions.filter((session) => session.subject === subject);
    let completedCount = 0;
    let activeCount = 0;
    let scoreSum = 0;
    let scoredCount = 0;

    for (const session of matching) {
      const status = session.status ?? "";
      if (COMPLETED_SESSION_STATUSES.has(status)) completedCount += 1;
      else if (ACTIVE_SESSION_STATUSES.has(status)) activeCount += 1;

      const score = getSessionScore(session);
      if (score !== null) {
        scoreSum += score;
        scoredCount += 1;
      }
    }

    return {
      subject,
      sessionCount: matching.length,
      completedCount,
      activeCount,
      scoredCount,
      averageScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : null,
    };
  });
}

function buildActivityFeed(data: DashboardState): AdminActivityItem[] {
  const items: AdminActivityItem[] = [];

  for (const user of data.users) {
    if (user.role !== "student") continue;
    const ms = toEpochMs(user.createdAt);
    if (ms === null) continue;
    items.push({
      id: `user-${user.id}`,
      category: "registration",
      title: `New learner registered: ${user.displayName ?? user.email ?? user.id}`,
      subtitle: user.email ?? "Student account created",
      timestampMs: ms,
      timestampRaw: user.createdAt,
      href: `/admin/progress/${user.id}`,
      badge: user.status ?? "active",
    });
  }

  for (const session of data.sessions) {
    const status = session.status ?? "";
    if (!COMPLETED_SESSION_STATUSES.has(status)) continue;
    const rawTs = session.learningCompletedAt ?? session.updatedAt ?? session.createdAt;
    const ms = toEpochMs(rawTs);
    if (ms === null) continue;
    const score = getSessionScore(session);
    items.push({
      id: `session-${session.id}`,
      category: "session",
      title: `${session.studentName ?? "Learner"} · ${displaySessionStatus(status)}`,
      subtitle: `${session.subject ?? "Session"} · ${session.topic ?? "Practice"}${
        score !== null ? ` · Score ${score}/100` : ""
      }`,
      timestampMs: ms,
      timestampRaw: rawTs,
      href: `/admin/review/${session.id}`,
      badge: status,
    });
  }

  for (const problem of data.problems) {
    const rawTs = problem.createdAt ?? problem.updatedAt;
    const ms = toEpochMs(rawTs);
    if (ms === null) continue;
    items.push({
      id: `problem-${problem.id}`,
      category: "content",
      title: `Content item: ${problem.topic ?? problem.id}`,
      subtitle: `${problem.subject ?? "Curriculum"}${
        problem.difficulty ? ` · ${problem.difficulty}` : ""
      }`,
      timestampMs: ms,
      timestampRaw: rawTs,
      href: "/admin/content/problems",
      badge: problem.status ?? "draft",
    });
  }

  for (const audit of data.audits) {
    const ms = toEpochMs(audit.createdAt);
    if (ms === null) continue;
    items.push({
      id: `audit-${audit.id}`,
      category: "audit",
      title: audit.action ?? audit.operation ?? "Administrative audit event",
      subtitle: audit.reason ?? audit.target ?? audit.id,
      timestampMs: ms,
      timestampRaw: audit.createdAt,
      href: "/admin/logs",
    });
  }

  items.sort((a, b) => b.timestampMs - a.timestampMs);
  return items.slice(0, 10);
}

function asDocRecord<T>(id: string, data: DocumentData): T & { id: string } {
  return { id, ...(data as T) };
}

function activityIcon(category: ActivityCategory) {
  switch (category) {
    case "registration":
      return {
        Icon: UserPlus,
        badgeClass: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
      };
    case "session":
      return {
        Icon: CheckCircle2,
        badgeClass: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
      };
    case "content":
      return {
        Icon: BookOpen,
        badgeClass: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
      };
    case "audit":
      return {
        Icon: ShieldCheck,
        badgeClass: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
      };
  }
}

const EMPTY_DATA: DashboardState = {
  users: [],
  sessions: [],
  problems: [],
  audits: [],
  progressRecords: [],
  totalSessionCount: 0,
  submittedSessionCount: 0,
  activeServerCount: null,
  completedServerCount: null,
  auditCount: 0,
};

/**
 * Redesigned administrator overview console displaying learner, session, and critical thinking
 * metrics alongside weekly activity, subject performance, chronological admin feed, and quick actions.
 *
 * @returns The rendered administrator dashboard inside {@link AdminShell}.
 */
export function SecureAdminDashboard() {
  const [data, setData] = useState<DashboardState>(EMPTY_DATA);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [referenceNowMs, setReferenceNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!db) return;
    const firestore = db;
    let active = true;

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);

      Promise.all([
        getDocs(collection(firestore, "users")),
        getDocs(query(collection(firestore, "sessions"), orderBy("updatedAt", "desc"), limit(50))),
        getDocs(collection(firestore, "problems")),
        getCountFromServer(collection(firestore, "audit_logs")),
        getCountFromServer(collection(firestore, "sessions")),
        getCountFromServer(
          query(collection(firestore, "sessions"), where("status", "==", "submitted")),
        ),
        Promise.resolve(
          getDocs(
            query(collection(firestore, "audit_logs"), orderBy("createdAt", "desc"), limit(20)),
          ),
        ).catch(() => undefined),
        Promise.resolve(getDocs(collection(firestore, "learning_progress"))).catch(
          () => undefined,
        ),
        Promise.resolve(
          getCountFromServer(
            query(
              collection(firestore, "sessions"),
              where("status", "in", ["in_progress", "ready_for_submission"]),
            ),
          ),
        ).catch(() => undefined),
        Promise.resolve(
          getCountFromServer(
            query(
              collection(firestore, "sessions"),
              where("status", "in", ["completed", "submitted", "reviewed"]),
            ),
          ),
        ).catch(() => undefined),
      ])
        .then(
          ([
            usersSnapshot,
            sessionsSnapshot,
            problemsSnapshot,
            auditCountSnap,
            sessionCountSnap,
            submittedCountSnap,
            auditsSnapshot,
            progressSnapshot,
            activeCountSnap,
            completedCountSnap,
          ]) => {
            if (!active) return;

            const users = (usersSnapshot?.docs ?? []).map((item) =>
              asDocRecord<Omit<DashboardUserDoc, "id">>(item.id, item.data()),
            );
            const sessions = (sessionsSnapshot?.docs ?? []).map((item) =>
              asDocRecord<Omit<DashboardSessionDoc, "id">>(item.id, item.data()),
            );
            const problems = (problemsSnapshot?.docs ?? []).map((item) =>
              asDocRecord<Omit<DashboardProblemDoc, "id">>(item.id, item.data()),
            );
            const audits = (auditsSnapshot?.docs ?? []).map((item) =>
              asDocRecord<Omit<DashboardAuditDoc, "id">>(item.id, item.data()),
            );
            const progressRecords = (progressSnapshot?.docs ?? []).map(
              (item) => item.data() as LearningProgress,
            );

            setReferenceNowMs(Date.now());
            setData({
              users,
              sessions,
              problems,
              audits,
              progressRecords,
              auditCount: auditCountSnap?.data()?.count ?? audits.length,
              totalSessionCount: sessionCountSnap?.data()?.count ?? sessions.length,
              submittedSessionCount: submittedCountSnap?.data()?.count ?? 0,
              activeServerCount: activeCountSnap?.data()?.count ?? null,
              completedServerCount: completedCountSnap?.data()?.count ?? null,
            });
          },
        )
        .catch((cause) => {
          if (active) {
            setError(errorMessage(cause, "Administrator data could not be loaded."));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [attempt]);

  const metrics = useMemo(() => {
    const studentUsers = data.users.filter((user) => user.role === "student");
    const adminUsers = data.users.filter((user) => user.role === "admin");

    const recentActiveCount = data.sessions.filter((session) =>
      ACTIVE_SESSION_STATUSES.has(session.status ?? ""),
    ).length;

    const recentCompletedAll = data.sessions.filter((session) =>
      COMPLETED_SESSION_STATUSES.has(session.status ?? ""),
    ).length;

    const recentCompletedNonSubmitted = data.sessions.filter(
      (session) => session.status === "completed" || session.status === "reviewed",
    ).length;

    const activeSessionsCount = data.activeServerCount ?? recentActiveCount;
    const completedSessionsCount =
      data.completedServerCount ??
      Math.max(recentCompletedAll, data.submittedSessionCount + recentCompletedNonSubmitted);

    let progressTotalScore = 0;
    let progressTotalCompleted = 0;
    for (const record of data.progressRecords) {
      const completed = Number(record.sessionsCompleted ?? 0);
      if (completed <= 0) continue;
      const total =
        typeof record.scoreTotal === "number" && Number.isFinite(record.scoreTotal)
          ? record.scoreTotal
          : Number(record.averageCTScore ?? 0) * completed;
      if (Number.isFinite(total)) {
        progressTotalScore += total;
        progressTotalCompleted += completed;
      }
    }

    const scoredSessions = data.sessions
      .map(getSessionScore)
      .filter((score): score is number => score !== null);

    let avgCtScore: number | null = null;
    let scoredSourceLabel = "No scored sessions yet";

    if (progressTotalCompleted > 0) {
      avgCtScore = Math.round(progressTotalScore / progressTotalCompleted);
      scoredSourceLabel = `Across ${progressTotalCompleted} scored sessions`;
    } else if (scoredSessions.length > 0) {
      const sum = scoredSessions.reduce((acc, score) => acc + score, 0);
      avgCtScore = Math.round(sum / scoredSessions.length);
      scoredSourceLabel = `Across ${scoredSessions.length} recent scored sessions`;
    }

    return {
      studentCount: studentUsers.length,
      totalUsersCount: data.users.length,
      adminCount: adminUsers.length,
      activeSessionsCount,
      completedSessionsCount,
      avgCtScore,
      scoredSourceLabel,
    };
  }, [data]);

  const weeklyBuckets = useMemo(
    () => buildWeeklyBuckets(data.sessions, referenceNowMs),
    [data.sessions, referenceNowMs],
  );

  const weeklyMax = useMemo(() => {
    let peak = 1;
    for (const bucket of weeklyBuckets) {
      peak = Math.max(peak, bucket.completed, bucket.ongoing);
    }
    return peak;
  }, [weeklyBuckets]);

  const weeklyTotals = useMemo(
    () =>
      weeklyBuckets.reduce(
        (acc, bucket) => ({
          completed: acc.completed + bucket.completed,
          ongoing: acc.ongoing + bucket.ongoing,
        }),
        { completed: 0, ongoing: 0 },
      ),
    [weeklyBuckets],
  );

  const subjectSummaries = useMemo(
    () => computeSubjectPerformance(data.sessions),
    [data.sessions],
  );

  const activityFeed = useMemo(() => buildActivityFeed(data), [data]);

  return (
    <AdminShell active="dashboard">
      <div className="space-y-6">
        <PageTitle
          title="System Administrator Dashboard"
          description="Monitor learner activity, subject performance, critical thinking outcomes, and recent administrative events."
        />

        {error && (
          <Alert
            tone="error"
            action={
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Retry
              </button>
            }
          >
            {error}
          </Alert>
        )}

        <section
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Administrator platform metrics"
        >
          <AdminStat
            label="Total Learners"
            loading={loading}
            value={error ? "—" : metrics.studentCount}
            helperText={
              error
                ? undefined
                : `${metrics.totalUsersCount} total accounts · ${metrics.adminCount} ${metrics.adminCount === 1 ? "admin" : "admins"}`
            }
            Icon={Users}
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          />
          <AdminStat
            label="Active Learning Sessions"
            loading={loading}
            value={error ? "—" : metrics.activeSessionsCount}
            helperText={error ? undefined : "In progress and ready to submit"}
            Icon={Clock}
            iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
          />
          <AdminStat
            label="Completed Learning Sessions"
            loading={loading}
            value={error ? "—" : metrics.completedSessionsCount}
            helperText={
              error ? undefined : `${data.submittedSessionCount} awaiting review`
            }
            Icon={CheckCircle2}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          />
          <AdminStat
            label="Average Critical Thinking Score"
            loading={loading}
            value={
              error
                ? "—"
                : metrics.avgCtScore !== null
                  ? `${metrics.avgCtScore}/100`
                  : "—"
            }
            helperText={error ? undefined : metrics.scoredSourceLabel}
            Icon={Award}
            iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* A. Learning Activity */}
          <section
            aria-labelledby="admin-learning-activity-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7 dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="admin-learning-activity-heading"
                  className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white"
                >
                  <BarChart3 aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Learning Activity
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Last 7 days · Completed vs Ongoing sessions
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  Total sessions:{" "}
                  <span className="font-bold tabular-nums text-slate-950 dark:text-white">
                    {loading ? "…" : error ? "—" : data.totalSessionCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-600 dark:bg-indigo-400" />
                Completed ({weeklyTotals.completed})
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="h-2.5 w-2.5 rounded-sm bg-sky-400 dark:bg-sky-500" />
                Ongoing ({weeklyTotals.ongoing})
              </span>
            </div>

            {loading ? (
              <div className="mt-6 grid grid-cols-7 gap-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-36 w-full" />
                ))}
              </div>
            ) : (
              <div className="mt-6">
                <div
                  role="img"
                  aria-label={`Weekly learning activity across the last 7 days: ${weeklyTotals.completed} completed sessions and ${weeklyTotals.ongoing} ongoing sessions`}
                  className="grid grid-cols-7 items-end gap-2 sm:gap-3"
                >
                  {weeklyBuckets.map((bucket) => {
                    const completedHeight = Math.round((bucket.completed / weeklyMax) * 120);
                    const ongoingHeight = Math.round((bucket.ongoing / weeklyMax) * 120);
                    return (
                      <div
                        key={bucket.key}
                        className="flex flex-col items-center gap-2"
                        title={`${bucket.fullDateLabel}: ${bucket.completed} completed, ${bucket.ongoing} ongoing`}
                      >
                        <div className="flex h-32 w-full items-end justify-center gap-1 rounded-xl bg-slate-50 px-1.5 pt-3 pb-1.5 dark:bg-slate-800/40">
                          <div className="flex w-2.5 flex-col items-center sm:w-3">
                            {bucket.completed > 0 && (
                              <span className="mb-1 text-[10px] font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                                {bucket.completed}
                              </span>
                            )}
                            <div
                              className="w-full rounded-t bg-indigo-600 transition-all dark:bg-indigo-400"
                              style={{
                                height: `${bucket.completed > 0 ? Math.max(8, completedHeight) : 2}px`,
                                opacity: bucket.completed > 0 ? 1 : 0.2,
                              }}
                            />
                          </div>
                          <div className="flex w-2.5 flex-col items-center sm:w-3">
                            {bucket.ongoing > 0 && (
                              <span className="mb-1 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                                {bucket.ongoing}
                              </span>
                            )}
                            <div
                              className="w-full rounded-t bg-sky-400 transition-all dark:bg-sky-500"
                              style={{
                                height: `${bucket.ongoing > 0 ? Math.max(8, ongoingHeight) : 2}px`,
                                opacity: bucket.ongoing > 0 ? 1 : 0.2,
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {bucket.dayLabel}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {bucket.fullDateLabel}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {weeklyTotals.completed === 0 && weeklyTotals.ongoing === 0 && (
                  <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No learning sessions recorded in the last 7 days.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* B. Subject Performance */}
          <section
            aria-labelledby="admin-subject-performance-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5 dark:border-slate-800 dark:bg-slate-900/80"
          >
            <h2
              id="admin-subject-performance-heading"
              className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white"
            >
              <TrendingUp aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Subject Performance
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Session volume and average Critical Thinking score by subject
            </p>

            {loading ? (
              <div className="mt-5 space-y-4">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {subjectSummaries.map((item) => (
                  <div
                    key={item.subject}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-950 dark:text-white">
                          {item.subject}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {item.sessionCount} sessions · {item.completedCount} completed ·{" "}
                          {item.activeCount} ongoing
                        </p>
                      </div>
                      <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold tabular-nums text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {item.averageScore !== null ? `${item.averageScore}/100` : "—"}
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full bg-indigo-600 transition-all dark:bg-indigo-400"
                          style={{ width: `${item.averageScore ?? 0}%` }}
                          role="progressbar"
                          aria-label={`${item.subject} average critical thinking score`}
                          aria-valuenow={item.averageScore ?? 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {item.scoredCount > 0
                          ? `Based on ${item.scoredCount} scored sessions`
                          : "No scored sessions recorded yet"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* C. Recent Administrative Activities */}
          <section
            aria-labelledby="admin-recent-activities-heading"
            className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-7 dark:border-slate-800 dark:bg-slate-900/80"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h2
                  id="admin-recent-activities-heading"
                  className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white"
                >
                  <Activity aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Recent Administrative Activities
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Unified feed of registrations, completed sessions, content additions, and audit events
                </p>
              </div>
              <Link
                to="/admin/logs"
                className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                View logs
              </Link>
            </div>

            {loading ? (
              <ListRowSkeleton rows={4} label="Loading administrator data" />
            ) : activityFeed.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No recent administrative or learner activity recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {activityFeed.map((item) => {
                  const { Icon, badgeClass } = activityIcon(item.category);
                  return (
                    <li key={item.id}>
                      <Link
                        to={item.href}
                        className="flex min-h-11 items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/50"
                      >
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${badgeClass}`}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {item.subtitle}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {formatTimestamp(item.timestampRaw)}
                          </span>
                          {item.badge && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusBadgeClass(item.badge)}`}
                            >
                              {item.badge.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* D. Quick Actions */}
          <section
            aria-labelledby="admin-quick-actions-heading"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5 dark:border-slate-800 dark:bg-slate-900/80"
          >
            <h2
              id="admin-quick-actions-heading"
              className="text-base font-bold text-slate-950 dark:text-white"
            >
              Quick Actions
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Jump directly to core administrative workflows
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                to="/admin/users"
                className="group flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                    <Users aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      Manage Users
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Search accounts, update academic profiles, manage status
                    </span>
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                />
              </Link>

              <Link
                to="/admin/content/problems/new"
                className="group flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                    <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      Add Learning Content
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Author and validate new problem bank items
                    </span>
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                />
              </Link>

              <Link
                to="/admin/progress"
                className="group flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <TrendingUp aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      View Learner Progress
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Inspect mastery trends, streaks, and scorecards
                    </span>
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                />
              </Link>

              <Link
                to="/admin/reports"
                className="group flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                    <BarChart3 aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      Generate Reports
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Preview and export audited CSV or print reports
                    </span>
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                />
              </Link>
            </div>
          </section>
        </div>

        {/* Recent Learner Sessions Review Queue */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Recent learner sessions</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select a session to open the administrator formative review workspace.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {data.problems.length} problems · {data.auditCount} audit logs
            </span>
          </div>
          {loading ? (
            <ListRowSkeleton rows={4} label="Loading recent learner sessions" />
          ) : !error && data.sessions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <BookOpen aria-hidden="true" className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                No learner sessions recorded yet.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Learner submissions will appear here automatically.
              </p>
            </div>
          ) : !error ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.sessions.slice(0, 8).map((session) => {
                const score = getSessionScore(session);
                return (
                  <Link
                    key={session.id}
                    to={`/admin/review/${session.id}`}
                    className="grid min-h-11 gap-2 px-5 py-3.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
                  >
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {session.studentName ?? "Learner"}
                    </span>
                    <span className="line-clamp-1 text-sm text-slate-600 dark:text-slate-400">
                      {session.subject ?? "Subject"} · {session.topic ?? "Topic"}
                    </span>
                    <span className="font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                      {score !== null ? `${score}/100` : "—"}
                    </span>
                    <span
                      className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(session.status)}`}
                    >
                      {displaySessionStatus(session.status ?? "in_progress")}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </AdminShell>
  );
}
