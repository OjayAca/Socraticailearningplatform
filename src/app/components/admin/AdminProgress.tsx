"use client";

import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { db } from "@/lib/firebase";
import { displaySessionStatus } from "@/lib/learning/display-labels";
import { resolveStoredStreak } from "@/lib/learning/session-state";
import {
  DIAGNOSIS_CATEGORY_LABELS,
  type AccountStatus,
  type AdaptiveRecommendation,
  type DiagnosisCategory,
  type GateEvaluation,
  type LearningProgress,
  type PersistentMisconceptionRecord,
  type ReleasedSolution,
  type ScorecardCategory,
  type ScorecardResult,
  type SubjectProgress,
  type SupportSummary,
  type UserRole,
} from "@mindguide/contracts";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  Award,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ScorecardDetails } from "../ScorecardDetails";
import { Alert } from "../ui/alert";
import { ListRowSkeleton } from "../ui/skeleton";
import { AdminShell } from "./AdminShell";
import {
  AdminPagination,
  AdminSearchInput,
  AdminStat,
  AdminTabs,
  PageTitle,
  type AdminTabItem,
} from "./admin-shared";
import {
  errorMessage,
  formatTimestamp,
  paginateSlice,
  searchableUser,
  statusBadgeClass,
  type SearchableAcademicProfile,
  type TimestampLike,
} from "./admin-utils";

type ProgressTabId = "overview" | "sessions" | "scorecard";
type ActivityFilter = "all" | "active" | "ongoing" | "completed" | "inactive";

const PAGE_SIZE = 10;
const COMPLETED_SESSION_STATUSES = new Set(["completed", "submitted", "reviewed", "returned"]);
const ONGOING_SESSION_STATUSES = new Set(["in_progress", "ready_for_submission"]);

const TOPIC_NAME_BY_ID = new Map<string, string>(
  VALIDATED_TOPICS.map((topic) => [topic.id, topic.name]),
);

const SCORECARD_ADMIN_COMPONENTS: ReadonlyArray<{
  key: ScorecardCategory;
  label: string;
  description: string;
}> = [
  {
    key: "accuracy",
    label: "Accuracy",
    description: "Correctness of calculations and final conclusions (0–25).",
  },
  {
    key: "logicalValidity",
    label: "Logical Reasoning",
    description: "Soundness of inferences and verification checks (0–25).",
  },
  {
    key: "methodSelection",
    label: "Formula and Theorem Justification",
    description: "Appropriate method choice and verified conditions (0–25).",
  },
  {
    key: "explanationQuality",
    label: "Reflection",
    description: "Contextual interpretation, clarity, and limitations (0–25).",
  },
];

interface UserProfileDoc {
  displayName?: string;
  email?: string;
  role?: UserRole;
  status?: AccountStatus;
  academicProfile?: SearchableAcademicProfile | null;
}

interface AdminSessionRecord {
  id: string;
  studentId?: string;
  studentName?: string;
  subject?: string;
  topic?: string;
  difficulty?: string | null;
  status?: string;
  currentPhase?: string;
  originalQuestion?: string;
  scorecard?: ScorecardResult | null;
  releasedSolution?: ReleasedSolution | null;
  gateEvaluations?: Partial<Record<string, GateEvaluation>>;
  gateStates?: Partial<Record<string, string>>;
  diagnosisSummary?: string[];
  responseCount?: number;
  supportUsage?: number;
  supportSummary?: SupportSummary;
  adaptiveRecommendation?: AdaptiveRecommendation | null;
  ctScore?: number;
  statsCommittedAt?: TimestampLike;
  completedAt?: TimestampLike;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  submittedAt?: TimestampLike;
  learningCompletedAt?: TimestampLike;
}

interface CriteriaAverages {
  accuracy: number | null;
  logicalValidity: number | null;
  methodSelection: number | null;
  explanationQuality: number | null;
  overall: number | null;
  scoredSessions: number;
}

interface LearnerAnalyticsRow extends UserProfileDoc {
  id: string;
  progress?: LearningProgress;
  sessions: AdminSessionRecord[];
  subjects: string[];
  topics: string[];
  completedCount: number;
  ongoingCount: number;
  averageCTScore: number;
  lastActivityAt: TimestampLike;
  scorecardMetrics: CriteriaAverages;
}

interface ParsedTopicRecommendation {
  topicKey: string;
  topicLabel: string;
  recommendedDifficulty?: string;
  masteryStatus?: string;
  decisionLabel?: string;
  reason?: string;
}

function timestampMillis(value: TimestampLike): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "object") {
    if ("toMillis" in value && typeof value.toMillis === "function") {
      return value.toMillis();
    }
    if ("toDate" in value && typeof value.toDate === "function") {
      return value.toDate().getTime();
    }
  }
  return 0;
}

function sessionTimestamp(session: AdminSessionRecord): TimestampLike {
  return (
    session.updatedAt ??
    session.submittedAt ??
    session.learningCompletedAt ??
    session.completedAt ??
    session.createdAt
  );
}

function resolveTopicLabel(rawTopic: string): string {
  return TOPIC_NAME_BY_ID.get(rawTopic) ?? rawTopic;
}

function computeCriteriaAverages(
  sessions: ReadonlyArray<AdminSessionRecord>,
  progress?: LearningProgress,
): CriteriaAverages {
  const sums: Record<ScorecardCategory, number> = {
    accuracy: 0,
    logicalValidity: 0,
    methodSelection: 0,
    explanationQuality: 0,
  };
  const counts: Record<ScorecardCategory, number> = {
    accuracy: 0,
    logicalValidity: 0,
    methodSelection: 0,
    explanationQuality: 0,
  };
  let totalSum = 0;
  let totalCount = 0;

  for (const session of sessions) {
    const scorecard = session.scorecard;
    if (!scorecard) continue;
    if (typeof scorecard.total === "number" && Number.isFinite(scorecard.total)) {
      totalSum += scorecard.total;
      totalCount += 1;
    }
    const criteria = scorecard.criteria;
    if (!criteria) continue;
    for (const component of SCORECARD_ADMIN_COMPONENTS) {
      const score = criteria[component.key]?.score;
      if (typeof score === "number" && Number.isFinite(score)) {
        sums[component.key] += score;
        counts[component.key] += 1;
      }
    }
  }

  const averageOrNull = (sum: number, count: number): number | null =>
    count > 0 ? Math.round((sum / count) * 10) / 10 : null;

  const progressAverage =
    typeof progress?.averageCTScore === "number" &&
    Number.isFinite(progress.averageCTScore) &&
    (progress.sessionsCompleted > 0 || progress.latestScorecard !== null)
      ? progress.averageCTScore
      : null;

  const overall =
    totalCount > 0
      ? Math.round(totalSum / totalCount)
      : progressAverage ??
        (typeof progress?.latestScorecard?.total === "number"
          ? progress.latestScorecard.total
          : null);

  return {
    accuracy: averageOrNull(sums.accuracy, counts.accuracy),
    logicalValidity: averageOrNull(sums.logicalValidity, counts.logicalValidity),
    methodSelection: averageOrNull(sums.methodSelection, counts.methodSelection),
    explanationQuality: averageOrNull(sums.explanationQuality, counts.explanationQuality),
    overall,
    scoredSessions: totalCount,
  };
}

function summarizeGateResponses(sessions: ReadonlyArray<AdminSessionRecord>): {
  correctResponses: number;
  incorrectResponses: number;
} {
  let correctResponses = 0;
  let incorrectResponses = 0;

  for (const session of sessions) {
    const evaluations = session.gateEvaluations ? Object.values(session.gateEvaluations) : [];
    if (evaluations.length > 0) {
      for (const gate of evaluations) {
        if (!gate) continue;
        const corrective =
          typeof gate.correctiveCycleCount === "number" && Number.isFinite(gate.correctiveCycleCount)
            ? Math.max(0, gate.correctiveCycleCount)
            : gate.status === "needs_revision"
              ? 1
              : 0;
        const attempts =
          typeof gate.attemptCount === "number" && Number.isFinite(gate.attemptCount)
            ? Math.max(0, gate.attemptCount)
            : gate.status === "accepted"
              ? corrective + 1
              : corrective;
        const accepted =
          gate.status === "accepted"
            ? Math.max(1, attempts - corrective)
            : Math.max(0, attempts - corrective);

        correctResponses += accepted;
        incorrectResponses += corrective;
      }
      continue;
    }

    if (session.gateStates) {
      for (const state of Object.values(session.gateStates)) {
        if (state === "accepted") correctResponses += 1;
        else if (state === "needs_revision") incorrectResponses += 1;
      }
    }
  }

  return { correctResponses, incorrectResponses };
}

function parseTopicRecommendations(
  raw: Record<string, unknown> | undefined,
): ParsedTopicRecommendation[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw).flatMap(([topicKey, value]) => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    return [
      {
        topicKey,
        topicLabel: resolveTopicLabel(topicKey),
        recommendedDifficulty:
          typeof record.recommendedDifficulty === "string"
            ? record.recommendedDifficulty
            : undefined,
        masteryStatus:
          typeof record.masteryStatus === "string" ? record.masteryStatus : undefined,
        decisionLabel:
          typeof record.decisionLabel === "string" ? record.decisionLabel : undefined,
        reason: typeof record.reason === "string" ? record.reason : undefined,
      },
    ];
  });
}

function masteryBadgeClass(status?: string): string {
  switch (status) {
    case "Mastered":
    case "Advance":
    case "resolved":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
    case "Needs remediation":
    case "Remediate":
    case "confirmed":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
    default:
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
  }
}

function ScoreProgressBar({
  label,
  value,
  max,
  description,
}: {
  label: string;
  value: number | null;
  max: number;
  description?: string;
}) {
  const safePercent =
    value !== null && Number.isFinite(value)
      ? Math.min(100, Math.max(0, Math.round((value / max) * 100)))
      : 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{label}</span>
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
          {value !== null ? `${value}/${max}` : "—"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value ?? 0}
        aria-valuemin={0}
        aria-valuemax={max}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      >
        <div
          className="h-full rounded-full bg-indigo-600 transition-all motion-reduce:transition-none dark:bg-indigo-400"
          style={{ width: `${safePercent}%` }}
        />
      </div>
      {description && (
        <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * Administrator analytics console organized into Learner Overview, Learning Sessions,
 * and Critical Thinking Scorecard tabs sourced from `users`, `learning_progress`, and `sessions`.
 */
export function SecureAdminProgress() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<Array<UserProfileDoc & { id: string }>>([]);
  const [progressMap, setProgressMap] = useState<Map<string, LearningProgress>>(new Map());
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([]);
  const [activeTab, setActiveTab] = useState<ProgressTabId>("overview");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [overviewPage, setOverviewPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [scorecardPage, setScorecardPage] = useState(1);
  const [selectedLearnerId, setSelectedLearnerId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    let active = true;
    const database = db;

    Promise.all([
      getDocs(query(collection(database, "users"), where("role", "==", "student"))),
      getDocs(collection(database, "learning_progress")),
      Promise.resolve(getDocs(collection(database, "sessions"))).catch(() => null),
    ])
      .then(([usersSnapshot, progressSnapshot, sessionsSnapshot]) => {
        if (!active) return;

        const nextUsers = (usersSnapshot?.docs ?? []).map((item) => ({
          id: item.id,
          ...(item.data() as UserProfileDoc),
        }));

        const nextProgress = new Map(
          (progressSnapshot?.docs ?? []).map((item) => [
            item.id,
            item.data() as LearningProgress,
          ]),
        );

        const nextSessions = (sessionsSnapshot?.docs ?? [])
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<AdminSessionRecord, "id">),
          }))
          .sort(
            (left, right) =>
              timestampMillis(sessionTimestamp(right)) - timestampMillis(sessionTimestamp(left)),
          );

        setUsers(nextUsers);
        setProgressMap(nextProgress);
        setSessions(nextSessions);
      })
      .catch((cause) => {
        if (!active) return;
        setError(errorMessage(cause, "Learner progress could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const sessionsByStudent = useMemo(() => {
    const grouped = new Map<string, AdminSessionRecord[]>();
    for (const session of sessions) {
      if (!session.studentId) continue;
      const list = grouped.get(session.studentId) ?? [];
      list.push(session);
      grouped.set(session.studentId, list);
    }
    return grouped;
  }, [sessions]);

  const learnerRows = useMemo<LearnerAnalyticsRow[]>(() => {
    return users.map((user) => {
      const progress = progressMap.get(user.id);
      const learnerSessions = sessionsByStudent.get(user.id) ?? [];

      const subjectSet = new Set<string>();
      for (const session of learnerSessions) {
        if (session.subject) subjectSet.add(session.subject);
      }
      if (progress?.subjectProgress) {
        for (const subject of Object.keys(progress.subjectProgress)) {
          subjectSet.add(subject);
        }
      }
      if (progress?.latestScorecard?.subject) {
        subjectSet.add(progress.latestScorecard.subject);
      }

      const topicSet = new Set<string>();
      for (const session of learnerSessions) {
        if (session.topic) topicSet.add(session.topic);
      }
      if (progress?.topicRecommendations) {
        for (const topicKey of Object.keys(progress.topicRecommendations)) {
          topicSet.add(resolveTopicLabel(topicKey));
        }
      }
      if (progress?.latestScorecard?.topic) {
        topicSet.add(progress.latestScorecard.topic);
      }

      const completedFromSessions = learnerSessions.filter((session) =>
        COMPLETED_SESSION_STATUSES.has(session.status ?? ""),
      ).length;
      const ongoingCount = learnerSessions.filter((session) =>
        ONGOING_SESSION_STATUSES.has(session.status ?? ""),
      ).length;
      const completedCount =
        typeof progress?.sessionsCompleted === "number"
          ? progress.sessionsCompleted
          : completedFromSessions;

      const scorecardMetrics = computeCriteriaAverages(learnerSessions, progress);
      const averageCTScore =
        typeof progress?.averageCTScore === "number"
          ? progress.averageCTScore
          : scorecardMetrics.overall ?? 0;

      const latestSessionTime = learnerSessions[0] ? sessionTimestamp(learnerSessions[0]) : null;
      const lastActivityAt =
        timestampMillis(progress?.lastActivityAt) >= timestampMillis(latestSessionTime)
          ? progress?.lastActivityAt ?? latestSessionTime
          : latestSessionTime;

      return {
        ...user,
        progress,
        sessions: learnerSessions,
        subjects: [...subjectSet],
        topics: [...topicSet],
        completedCount,
        ongoingCount,
        averageCTScore,
        lastActivityAt,
        scorecardMetrics,
      };
    });
  }, [users, progressMap, sessionsByStudent]);

  const learnerNameById = useMemo(
    () =>
      new Map(
        learnerRows.map((row) => [
          row.id,
          row.displayName?.trim() || row.email?.trim() || row.id,
        ]),
      ),
    [learnerRows],
  );

  const availableSubjects = useMemo(() => {
    const names = new Set<string>(VALIDATED_SUBJECTS.map((item) => item.name));
    for (const row of learnerRows) {
      for (const subject of row.subjects) names.add(subject);
    }
    return [...names];
  }, [learnerRows]);

  const filteredLearners = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return learnerRows.filter((row) => {
      if (queryText) {
        const haystack = [
          searchableUser(row),
          row.subjects.join(" "),
          row.topics.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }

      if (subjectFilter !== "all" && !row.subjects.includes(subjectFilter)) {
        return false;
      }

      if (activityFilter === "active") {
        return row.completedCount > 0 || row.ongoingCount > 0 || timestampMillis(row.lastActivityAt) > 0;
      }
      if (activityFilter === "ongoing") {
        return row.ongoingCount > 0;
      }
      if (activityFilter === "completed") {
        return row.completedCount > 0;
      }
      if (activityFilter === "inactive") {
        return row.completedCount === 0 && row.ongoingCount === 0 && timestampMillis(row.lastActivityAt) === 0;
      }

      return true;
    });
  }, [learnerRows, search, subjectFilter, activityFilter]);

  const overviewPagination = useMemo(
    () => paginateSlice(filteredLearners, overviewPage, PAGE_SIZE),
    [filteredLearners, overviewPage],
  );

  const sessionMetrics = useMemo(() => {
    const progressCompletedSum = learnerRows.reduce((sum, row) => sum + row.completedCount, 0);
    const completedFromSessions = sessions.filter((session) =>
      COMPLETED_SESSION_STATUSES.has(session.status ?? ""),
    ).length;
    const ongoingSessions = sessions.filter((session) =>
      ONGOING_SESSION_STATUSES.has(session.status ?? ""),
    ).length;

    const completedSessions =
      sessions.length > 0 ? completedFromSessions : progressCompletedSum;
    const totalSessions = sessions.length > 0 ? sessions.length : completedSessions;
    const problemsAttempted = sessions.filter(
      (session) =>
        (session.responseCount ?? 0) > 0 ||
        COMPLETED_SESSION_STATUSES.has(session.status ?? "") ||
        ONGOING_SESSION_STATUSES.has(session.status ?? ""),
    ).length;
    const { correctResponses, incorrectResponses } = summarizeGateResponses(sessions);

    return {
      totalSessions,
      completedSessions,
      ongoingSessions,
      problemsAttempted,
      correctResponses,
      incorrectResponses,
    };
  }, [learnerRows, sessions]);

  const filteredSessions = useMemo(() => {
    if (selectedLearnerId === "all") return sessions;
    return sessions.filter((session) => session.studentId === selectedLearnerId);
  }, [sessions, selectedLearnerId]);

  const sessionsPagination = useMemo(
    () => paginateSlice(filteredSessions, sessionsPage, PAGE_SIZE),
    [filteredSessions, sessionsPage],
  );

  const cohortScorecard = useMemo(() => {
    const sessionAverages = computeCriteriaAverages(sessions);
    const learnerTotals = learnerRows
      .filter((row) => row.completedCount > 0 || row.scorecardMetrics.overall !== null)
      .map((row) => row.scorecardMetrics.overall ?? row.averageCTScore);

    const overall =
      sessionAverages.overall ??
      (learnerTotals.length > 0
        ? Math.round(learnerTotals.reduce((sum, score) => sum + score, 0) / learnerTotals.length)
        : null);

    return {
      ...sessionAverages,
      overall,
    };
  }, [sessions, learnerRows]);

  const scorecardPagination = useMemo(
    () => paginateSlice(filteredLearners, scorecardPage, PAGE_SIZE),
    [filteredLearners, scorecardPage],
  );

  const tabItems: AdminTabItem[] = [
    {
      id: "overview",
      label: "Learner Overview",
      badge: (
        <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-[11px] font-bold dark:bg-white/15">
          {filteredLearners.length}
        </span>
      ),
    },
    {
      id: "sessions",
      label: "Learning Sessions",
      badge: (
        <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-[11px] font-bold dark:bg-white/15">
          {sessionMetrics.totalSessions}
        </span>
      ),
    },
    {
      id: "scorecard",
      label: "Critical Thinking Scorecard",
    },
  ];

  function handleTabSelect(tabId: string) {
    setActiveTab(tabId as ProgressTabId);
  }

  return (
    <AdminShell active="progress">
      <PageTitle
        title="Learner Progress Analytics"
        description="Inspect learner mastery, ongoing and completed sessions, and Critical Thinking Scorecard performance."
      />

      {error && (
        <Alert tone="error" className="mb-6">
          {error}
        </Alert>
      )}

      <AdminTabs
        items={tabItems}
        activeId={activeTab}
        onSelect={handleTabSelect}
        ariaLabel="Learner progress sections"
        className="mb-6"
      />

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <ListRowSkeleton rows={5} label="Loading administrator data" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <section aria-label="Learner Overview">
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto_auto] dark:border-slate-800 dark:bg-slate-900/80">
                <AdminSearchInput
                  value={search}
                  onChange={(value) => {
                    setSearch(value);
                    setOverviewPage(1);
                    setScorecardPage(1);
                  }}
                  placeholder="Search learner or academic profile"
                  ariaLabel="Search learner progress"
                  clearAriaLabel="Clear learner search"
                />

                <label className="flex flex-col justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="sr-only">Subject filter</span>
                  <select
                    aria-label="Subject filter"
                    value={subjectFilter}
                    onChange={(event) => {
                      setSubjectFilter(event.target.value);
                      setOverviewPage(1);
                      setScorecardPage(1);
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All subjects</option>
                    {availableSubjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="sr-only">Activity filter</span>
                  <select
                    aria-label="Activity filter"
                    value={activityFilter}
                    onChange={(event) => {
                      setActivityFilter(event.target.value as ActivityFilter);
                      setOverviewPage(1);
                      setScorecardPage(1);
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All activity</option>
                    <option value="active">Has activity</option>
                    <option value="ongoing">Has ongoing sessions</option>
                    <option value="completed">Has completed sessions</option>
                    <option value="inactive">No activity yet</option>
                  </select>
                </label>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                {overviewPagination.items.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-slate-600 dark:text-slate-300">
                    No learners match your search.
                  </div>
                ) : (
                  <div
                    role="region"
                    aria-label="Learner progress table (scroll horizontally)"
                    tabIndex={0}
                    className="table-scroll max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-indigo-500"
                  >
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                        <tr>
                          <th className="p-4">Learner Name</th>
                          <th className="p-4">Email</th>
                          <th className="p-4">Subject</th>
                          <th className="p-4">Topics Studied</th>
                          <th className="p-4">Learning Progress</th>
                          <th className="p-4">Average Score</th>
                          <th className="p-4">Last Activity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {overviewPagination.items.map((row) => (
                          <tr
                            key={row.id}
                            onClick={(event) => {
                              if ((event.target as HTMLElement).closest("a, button")) return;
                              navigate(`/admin/progress/${row.id}`);
                            }}
                            className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <td className="p-4">
                              <Link
                                className="inline-flex min-h-11 items-center font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                to={`/admin/progress/${row.id}`}
                              >
                                {row.displayName || row.email || row.id}
                              </Link>
                              {row.academicProfile && (
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {[
                                    row.academicProfile.course,
                                    row.academicProfile.yearLevel,
                                    row.academicProfile.section,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </td>
                            <td className="p-4 text-xs text-slate-600 dark:text-slate-300">
                              {row.email || "—"}
                            </td>
                            <td className="p-4 text-xs text-slate-700 dark:text-slate-200">
                              {row.subjects.length > 0 ? row.subjects.join(", ") : "—"}
                            </td>
                            <td className="p-4 text-xs text-slate-700 dark:text-slate-200">
                              {row.topics.length > 0 ? (
                                <div>
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    {row.topics.length}{" "}
                                    {row.topics.length === 1 ? "topic" : "topics"}
                                  </span>
                                  <p className="mt-0.5 max-w-52 truncate text-slate-500 dark:text-slate-400">
                                    {row.topics.join(", ")}
                                  </p>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="p-4 text-xs">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                  {row.completedCount} completed
                                </span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {row.ongoingCount} ongoing
                                </span>
                              </div>
                            </td>
                            <td className="p-4 font-semibold text-indigo-600 dark:text-indigo-400">
                              {row.averageCTScore}/100
                            </td>
                            <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                              {formatTimestamp(row.lastActivityAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <AdminPagination
                page={overviewPagination.page}
                pageSize={PAGE_SIZE}
                totalItems={overviewPagination.totalItems}
                onPageChange={setOverviewPage}
                itemLabel="learners"
              />
            </section>
          )}

          {activeTab === "sessions" && (
            <section aria-label="Learning Sessions" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AdminStat
                  label="Total Sessions"
                  value={sessionMetrics.totalSessions}
                  Icon={Layers}
                  iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                />
                <AdminStat
                  label="Completed Sessions"
                  value={sessionMetrics.completedSessions}
                  Icon={CheckCircle2}
                  iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                />
                <AdminStat
                  label="Ongoing Sessions"
                  value={sessionMetrics.ongoingSessions}
                  Icon={Clock}
                  iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                />
                <AdminStat
                  label="Problems Attempted"
                  value={sessionMetrics.problemsAttempted}
                  Icon={BookOpen}
                  iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
                />
                <AdminStat
                  label="Correct Responses"
                  value={sessionMetrics.correctResponses}
                  Icon={Award}
                  iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  helperText="Accepted reasoning checkpoints"
                />
                <AdminStat
                  label="Incorrect Responses"
                  value={sessionMetrics.incorrectResponses}
                  Icon={XCircle}
                  iconClassName="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                  helperText="Corrective revision attempts"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                      Learner Session History
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Select a learner to inspect their session history or open a session for review.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Learner:</span>
                    <select
                      aria-label="Select learner for session history"
                      value={selectedLearnerId}
                      onChange={(event) => {
                        setSelectedLearnerId(event.target.value);
                        setSessionsPage(1);
                      }}
                      className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="all">All learners ({learnerRows.length})</option>
                      {learnerRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.displayName || row.email || row.id} ({row.sessions.length})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedLearnerId !== "all" && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-2.5 text-xs dark:border-indigo-900/50 dark:bg-indigo-950/30">
                    <span className="font-semibold text-indigo-900 dark:text-indigo-200">
                      Showing sessions for {learnerNameById.get(selectedLearnerId) ?? selectedLearnerId}
                    </span>
                    <Link
                      to={`/admin/progress/${selectedLearnerId}`}
                      className="font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Open learner detail
                    </Link>
                  </div>
                )}

                <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                  {sessionsPagination.items.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      No learning sessions recorded for this selection.
                    </p>
                  ) : (
                    sessionsPagination.items.map((session) => (
                      <Link
                        key={session.id}
                        to={`/admin/review/${session.id}`}
                        className="grid min-h-11 gap-2 py-3.5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 md:grid-cols-[1.1fr_1.4fr_auto_auto_auto] md:items-center md:px-2 dark:hover:bg-slate-800/50"
                      >
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {session.studentName ||
                              (session.studentId ? learnerNameById.get(session.studentId) : undefined) ||
                              "Learner"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {session.subject || "Subject unavailable"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {session.topic || "Topic unavailable"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {session.difficulty ? `${session.difficulty} · ` : ""}
                            {formatTimestamp(sessionTimestamp(session))}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                          {typeof session.scorecard?.total === "number"
                            ? `${session.scorecard.total}/100`
                            : "—"}
                        </span>
                        <span
                          className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(session.status)}`}
                        >
                          {displaySessionStatus(session.status)}
                        </span>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          Review →
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <AdminPagination
                page={sessionsPagination.page}
                pageSize={PAGE_SIZE}
                totalItems={sessionsPagination.totalItems}
                onPageChange={setSessionsPage}
                itemLabel="sessions"
              />
            </section>
          )}

          {activeTab === "scorecard" && (
            <section aria-label="Critical Thinking Scorecard" className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
                      <BrainCircuit aria-hidden="true" className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      Cohort Critical Thinking Scorecard
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Aggregated across recorded session scorecards and learner progress records.
                    </p>
                  </div>
                  <div className="rounded-xl bg-indigo-50 px-4 py-2 text-right dark:bg-indigo-950/40">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                      Overall Critical Thinking Score
                    </p>
                    <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
                      {cohortScorecard.overall !== null ? `${cohortScorecard.overall}/100` : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {SCORECARD_ADMIN_COMPONENTS.map((component) => (
                    <ScoreProgressBar
                      key={component.key}
                      label={component.label}
                      value={cohortScorecard[component.key]}
                      max={25}
                      description={component.description}
                    />
                  ))}
                  <ScoreProgressBar
                    label="Overall Critical Thinking Score"
                    value={cohortScorecard.overall}
                    max={100}
                    description="Combined 4-dimension critical thinking average (0–100)."
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
                  <Users aria-hidden="true" className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  Per-Learner Scorecard Breakdown
                </h2>

                {scorecardPagination.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No learners match the current filters.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {scorecardPagination.items.map((row) => (
                      <article
                        key={row.id}
                        className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <Link
                              to={`/admin/progress/${row.id}`}
                              className="text-sm font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              {row.displayName || row.email || row.id}
                            </Link>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {row.completedCount} completed · {row.scorecardMetrics.scoredSessions}{" "}
                              scored {row.scorecardMetrics.scoredSessions === 1 ? "session" : "sessions"}
                            </p>
                          </div>
                          <Link
                            to={`/admin/progress/${row.id}`}
                            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Open learner detail
                          </Link>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          {SCORECARD_ADMIN_COMPONENTS.map((component) => (
                            <ScoreProgressBar
                              key={component.key}
                              label={component.label}
                              value={row.scorecardMetrics[component.key]}
                              max={25}
                            />
                          ))}
                          <ScoreProgressBar
                            label="Overall Critical Thinking Score"
                            value={row.scorecardMetrics.overall}
                            max={100}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <AdminPagination
                page={scorecardPagination.page}
                pageSize={PAGE_SIZE}
                totalItems={scorecardPagination.totalItems}
                onPageChange={setScorecardPage}
                itemLabel="learners"
              />
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}

/**
 * Detailed progress analytics, Critical Thinking Scorecard breakdown, topic mastery,
 * misconception profile, and session history for an individual learner.
 */
export function SecureAdminProgressDetail() {
  const { userId } = useParams();
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !userId) return;
    let active = true;
    const database = db;

    Promise.all([
      getDoc(doc(database, "users", userId)),
      getDoc(doc(database, "learning_progress", userId)),
      getDocs(
        query(
          collection(database, "sessions"),
          where("studentId", "==", userId),
          orderBy("updatedAt", "desc"),
        ),
      ),
    ])
      .then(([profileSnapshot, progressSnapshot, sessionsSnapshot]) => {
        if (!active) return;
        setProfile(
          profileSnapshot.exists() ? (profileSnapshot.data() as UserProfileDoc) : null,
        );
        setProgress(
          progressSnapshot.exists() ? (progressSnapshot.data() as LearningProgress) : null,
        );
        setSessions(
          (sessionsSnapshot?.docs ?? []).map((item) => ({
            id: item.id,
            ...(item.data() as Omit<AdminSessionRecord, "id">),
          })),
        );
      })
      .catch((cause) => {
        if (!active) return;
        setError(errorMessage(cause, "Learner progress detail could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const scorecardAverages = useMemo(
    () => computeCriteriaAverages(sessions, progress ?? undefined),
    [sessions, progress],
  );

  const latestDetailedScorecard = useMemo(() => {
    const withCriteria = sessions.find((session) => Boolean(session.scorecard?.criteria));
    if (withCriteria?.scorecard) return withCriteria.scorecard;
    const withTotal = sessions.find((session) => typeof session.scorecard?.total === "number");
    return withTotal?.scorecard ?? null;
  }, [sessions]);

  const topicRecommendations = useMemo(
    () => parseTopicRecommendations(progress?.topicRecommendations),
    [progress],
  );

  const subjectEntries = useMemo(
    () =>
      Object.entries(progress?.subjectProgress ?? {}) as Array<[string, SubjectProgress]>,
    [progress],
  );

  const misconceptionEntries = useMemo(
    () =>
      Object.entries(progress?.misconceptionProfile ?? {}) as Array<
        [string, PersistentMisconceptionRecord]
      >,
    [progress],
  );

  const ongoingSessionsCount = useMemo(
    () =>
      sessions.filter((session) => ONGOING_SESSION_STATUSES.has(session.status ?? "")).length,
    [sessions],
  );

  if (!userId) return <Navigate to="/admin/progress" replace />;

  if (loading) {
    return (
      <AdminShell active="progress">
        <ListRowSkeleton rows={4} label="Loading administrator data" />
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell active="progress">
        <Alert tone="error">{error}</Alert>
      </AdminShell>
    );
  }

  if (!profile) {
    return (
      <AdminShell active="progress">
        <Alert tone="error">Learner profile not found.</Alert>
      </AdminShell>
    );
  }

  const completedCount =
    progress?.sessionsCompleted ??
    sessions.filter((session) => COMPLETED_SESSION_STATUSES.has(session.status ?? "")).length;
  const averageCTScore = progress?.averageCTScore ?? scorecardAverages.overall ?? 0;

  return (
    <AdminShell active="progress">
      <Link
        to="/admin/progress"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        <span>Learner progress</span>
      </Link>

      <div className="mt-3">
        <PageTitle
          title={profile.displayName ?? "Learner"}
          description={`${completedCount} completed · ${averageCTScore}/100 average`}
          actions={
            profile.status ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadgeClass(profile.status)}`}
              >
                {profile.status}
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Learner Profile
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {profile.email || "No email on record"}
            </p>
          </div>
          {profile.academicProfile && (
            <div className="flex flex-wrap gap-2 text-xs">
              {profile.academicProfile.studentNumber && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  ID: {profile.academicProfile.studentNumber}
                </span>
              )}
              {profile.academicProfile.course && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {profile.academicProfile.course}
                </span>
              )}
              {profile.academicProfile.yearLevel && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Year {profile.academicProfile.yearLevel}
                </span>
              )}
              {profile.academicProfile.section && (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Section {profile.academicProfile.section}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStat
            label="Completed Sessions"
            value={completedCount}
            Icon={CheckCircle2}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          />
          <AdminStat
            label="Ongoing Sessions"
            value={ongoingSessionsCount}
            Icon={Clock}
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          />
          <AdminStat
            label="Average CT Score"
            value={`${averageCTScore}/100`}
            Icon={TrendingUp}
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          />
          <AdminStat
            label="Current Streak"
            value={(() => {
              const streak = resolveStoredStreak(
                Number(progress?.currentStreak ?? 0),
                progress?.lastSessionDate,
                progress?.lastSessionAt,
              );
              return `${streak} ${streak === 1 ? "day" : "days"}`;
            })()}
            Icon={Flame}
            iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
            helperText={`Last activity: ${formatTimestamp(progress?.lastActivityAt)}`}
          />
        </div>
      </div>

      {progress?.latestScorecard && (
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              Latest scorecard: {progress.latestScorecard.total}/100
            </p>
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              {progress.latestScorecard.subject} · {progress.latestScorecard.topic}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            {progress.latestScorecard.summary}
          </p>
        </div>
      )}

      {(scorecardAverages.scoredSessions > 0 || latestDetailedScorecard) && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">
            Critical Thinking Scorecard Breakdown
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {SCORECARD_ADMIN_COMPONENTS.map((component) => (
              <ScoreProgressBar
                key={component.key}
                label={component.label}
                value={scorecardAverages[component.key]}
                max={25}
              />
            ))}
            <ScoreProgressBar
              label="Overall Critical Thinking Score"
              value={scorecardAverages.overall}
              max={100}
            />
          </div>
          {latestDetailedScorecard && <ScorecardDetails scorecard={latestDetailedScorecard} />}
        </section>
      )}

      {(subjectEntries.length > 0 ||
        topicRecommendations.length > 0 ||
        misconceptionEntries.length > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Subject & Topic Mastery
            </h2>
            {subjectEntries.length > 0 && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {subjectEntries.map(([subject, stats]) => (
                  <div
                    key={subject}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {subject}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {stats.sessionsCompleted} completed · {stats.averageCTScore}/100 avg
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      Recommended: {stats.recommendedDifficulty}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {topicRecommendations.length > 0 ? (
              <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                {topicRecommendations.map((item) => (
                  <div key={item.topicKey} className="py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {item.topicLabel}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.masteryStatus && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${masteryBadgeClass(item.masteryStatus)}`}
                          >
                            {item.masteryStatus}
                          </span>
                        )}
                        {item.decisionLabel && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${masteryBadgeClass(item.decisionLabel)}`}
                          >
                            {item.decisionLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.reason && (
                      <p className="mt-1 text-slate-600 dark:text-slate-400">{item.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                No topic-level mastery recommendations recorded yet.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Persistent Misconceptions
            </h2>
            {misconceptionEntries.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                No recurring misconceptions recorded for this learner.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {misconceptionEntries.map(([key, record]) => (
                  <div key={key} className="py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {DIAGNOSIS_CATEGORY_LABELS[record.category as DiagnosisCategory] ??
                          record.category}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold capitalize ${masteryBadgeClass(record.status)}`}
                      >
                        {record.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      {record.subject} · {resolveTopicLabel(record.topicId)} · {record.occurrences}{" "}
                      {record.occurrences === 1 ? "occurrence" : "occurrences"} ({record.confidence}{" "}
                      confidence)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="border-b border-slate-200 p-4 font-bold text-slate-950 dark:border-slate-800 dark:text-white">
          Sessions
        </div>
        {sessions.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No learning sessions found for this learner.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {sessions.map((session) => (
              <Link
                key={session.id}
                to={`/admin/review/${session.id}`}
                className="grid min-h-11 gap-2 p-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
              >
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {session.subject}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {session.topic}
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {session.scorecard?.total ?? "—"}
                </span>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(session.status)}`}
                >
                  {displaySessionStatus(session.status)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
