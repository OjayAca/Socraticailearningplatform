"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  ClipboardList,
  FileWarning,
  Loader2,
  RefreshCw,
  Stethoscope,
} from "lucide-react";
import {
  DIAGNOSIS_CATEGORY_LABELS,
  type DiagnosisCategory,
} from "@mindguide/contracts";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Link } from "react-router";
import { db } from "@/lib/firebase";
import { displayPhaseLabel, displaySessionStatus } from "@/lib/learning/display-labels";
import { Alert } from "../ui/alert";
import { ListRowSkeleton } from "../ui/skeleton";
import { AdminShell } from "./AdminShell";
import {
  AdminFilterPill,
  AdminPagination,
  AdminSearchInput,
  AdminStat,
  AdminTabs,
  PageTitle,
  type AdminTabItem,
  type LogEntry,
} from "./admin-shared";
import {
  errorMessage,
  formatTimestamp,
  paginateSlice,
  statusBadgeClass,
  type TimestampLike,
} from "./admin-utils";

type LogsTabId = "activity" | "ai" | "diagnosis";
type AuditCategoryFilter = "all" | "account" | "content" | "cohort" | "reviews";
type AiInteractionFilter =
  | "all"
  | "ai_formative"
  | "client_practice"
  | "fallbacks"
  | "legacy_failures";

interface SessionDiagnosisPayload {
  readonly category?: unknown;
  readonly severity?: unknown;
  readonly confidence?: unknown;
  readonly targetPhase?: unknown;
  readonly evidence?: unknown;
  readonly explanation?: unknown;
  readonly incorrectStep?: unknown;
  readonly recommendedAction?: unknown;
  readonly correctivePrompt?: unknown;
  readonly resolutionStatus?: unknown;
  readonly source?: unknown;
}

interface SessionScorecardPayload {
  readonly total?: unknown;
  readonly feedback?: unknown;
  readonly rubricVersion?: unknown;
  readonly calibrationStatus?: unknown;
}

interface SessionMisconceptionItem {
  readonly category?: unknown;
  readonly status?: unknown;
  readonly confidence?: unknown;
  readonly occurrences?: unknown;
}

interface SessionFallbackEvent {
  readonly phase?: unknown;
  readonly reason?: unknown;
  readonly code?: unknown;
  readonly status?: unknown;
  readonly latencyMs?: unknown;
  readonly responseTimeMs?: unknown;
  readonly durationMs?: unknown;
  readonly createdAt?: TimestampLike;
}

interface SessionSupportEntry {
  readonly phase?: unknown;
  readonly level?: unknown;
  readonly hintLevel?: unknown;
  readonly requestedAt?: TimestampLike;
}

interface SessionMonitorRecord {
  readonly id: string;
  readonly studentId: string;
  readonly studentName: string;
  readonly subject: string;
  readonly topic: string;
  readonly difficulty: string | null;
  readonly status: string;
  readonly scoringSource: string;
  readonly currentPhase: string;
  readonly currentStage: string;
  readonly workflowVersion: number | null;
  readonly promptAdjustment: string | null;
  readonly responseCount: number;
  readonly supportUsage: number;
  readonly aiFallbackEvents: ReadonlyArray<SessionFallbackEvent>;
  readonly supportHistory: ReadonlyArray<SessionSupportEntry>;
  readonly diagnosisSummary: ReadonlyArray<string>;
  readonly selfCorrectedCategories: ReadonlyArray<string>;
  readonly resolvedMisconceptions: ReadonlyArray<string>;
  readonly activeTopicMisconceptions: ReadonlyArray<SessionMisconceptionItem>;
  readonly misconceptions: ReadonlyArray<unknown>;
  readonly diagnosis: unknown;
  readonly diagnosisCategory: string | null;
  readonly lastDiagnosis: SessionDiagnosisPayload | null;
  readonly scorecard: SessionScorecardPayload | null;
  readonly responseTimeMs: number | null;
  readonly createdAt: TimestampLike;
  readonly updatedAt: TimestampLike;
}

interface NormalizedDiagnosisEntry {
  readonly sessionId: string;
  readonly studentName: string;
  readonly studentId: string;
  readonly subject: string;
  readonly topic: string;
  readonly status: string;
  readonly scoreTotal: number | null;
  readonly scorecardFeedback: string | null;
  readonly categories: ReadonlyArray<string>;
  readonly primaryCategory: string;
  readonly severity: string | null;
  readonly confidence: string | null;
  readonly resolutionStatus: string | null;
  readonly targetPhase: string | null;
  readonly explanation: string | null;
  readonly incorrectStep: string | null;
  readonly recommendedAction: string | null;
  readonly correctivePrompt: string | null;
  readonly evidence: ReadonlyArray<string>;
  readonly resolvedCategories: ReadonlyArray<string>;
  readonly updatedAt: TimestampLike;
  readonly searchText: string;
}

const LOG_PAGE_SIZE = 100;
const SESSIONS_QUERY_LIMIT = 100;
const INTERACTION_PAGE_SIZE = 15;
const DIAGNOSIS_PAGE_SIZE = 12;

const SENSITIVE_PAYLOAD_KEYS = new Set([
  "apikey",
  "authorization",
  "password",
  "privatesolution",
  "secret",
  "solution",
  "token",
]);

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asNonEmptyString(item))
    .filter((item): item is string => item !== null);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizePayloadValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizePayloadValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
      return formatTimestamp(value as TimestampLike);
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_PAYLOAD_KEYS.has(key.toLowerCase())) {
        sanitized[key] = "[redacted]";
      } else {
        sanitized[key] = sanitizePayloadValue(entry, depth + 1);
      }
    }
    return sanitized;
  }
  return String(value);
}

function classifyAuditEntry(row: LogEntry): Exclude<AuditCategoryFilter, "all"> {
  const action = String(row.action ?? row.operation ?? "").toLowerCase();
  const target = String(row.target ?? "").toLowerCase();

  if (
    action.includes("pilot") ||
    target.includes("system_settings/pilot") ||
    target.includes("pilot_roster")
  ) {
    return "cohort";
  }
  if (
    action.includes("user") ||
    action.includes("academicprofile") ||
    action.includes("academic_profile") ||
    action.includes("profile")
  ) {
    return "account";
  }
  if (
    action.includes("content") ||
    action.includes("problem") ||
    action.includes("validation")
  ) {
    return "content";
  }
  if (
    action.includes("review") ||
    action.includes("override") ||
    action.includes("export") ||
    action.includes("announcement")
  ) {
    return "reviews";
  }
  return "reviews";
}

function auditCategoryLabel(category: Exclude<AuditCategoryFilter, "all">): string {
  switch (category) {
    case "account":
      return "Account changes";
    case "content":
      return "Content modifications";
    case "cohort":
      return "Cohort configuration";
    case "reviews":
      return "Administrative reviews/exports";
  }
}

function auditCategoryBadgeClass(
  category: Exclude<AuditCategoryFilter, "all">,
): string {
  switch (category) {
    case "account":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30";
    case "content":
      return "bg-violet-50 text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30";
    case "cohort":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
    case "reviews":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
}

function displayDiagnosisCategory(category: string): string {
  if (category in DIAGNOSIS_CATEGORY_LABELS) {
    return DIAGNOSIS_CATEGORY_LABELS[category as DiagnosisCategory];
  }
  return category
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function interactionSourceLabel(source: string): string {
  if (source === "ai_formative") return "Live AI Formative";
  if (source === "client_practice") return "Client Practice";
  return "Legacy / Standard";
}

function extractResponseTimeMs(
  raw: Record<string, unknown>,
  fallbacks: ReadonlyArray<SessionFallbackEvent>,
): number | null {
  const direct =
    typeof raw.aiLatencyMs === "number"
      ? raw.aiLatencyMs
      : typeof raw.responseTimeMs === "number"
        ? raw.responseTimeMs
        : typeof raw.latencyMs === "number"
          ? raw.latencyMs
          : null;
  if (direct !== null && Number.isFinite(direct)) return direct;

  for (const event of fallbacks) {
    const candidate =
      typeof event.latencyMs === "number"
        ? event.latencyMs
        : typeof event.responseTimeMs === "number"
          ? event.responseTimeMs
          : typeof event.durationMs === "number"
            ? event.durationMs
            : null;
    if (candidate !== null && Number.isFinite(candidate)) return candidate;
  }
  return null;
}

function normalizeSessionDoc(id: string, raw: DocumentData): SessionMonitorRecord {
  const fallbacks = Array.isArray(raw.aiFallbackEvents)
    ? (raw.aiFallbackEvents
        .map((item) => asRecord(item) as SessionFallbackEvent | null)
        .filter((item): item is SessionFallbackEvent => item !== null))
    : [];
  const supportHistory = Array.isArray(raw.supportHistory)
    ? (raw.supportHistory
        .map((item) => asRecord(item) as SessionSupportEntry | null)
        .filter((item): item is SessionSupportEntry => item !== null))
    : [];
  const activeTopicMisconceptions = Array.isArray(raw.activeTopicMisconceptions)
    ? (raw.activeTopicMisconceptions
        .map((item) => asRecord(item) as SessionMisconceptionItem | null)
        .filter((item): item is SessionMisconceptionItem => item !== null))
    : [];

  return {
    id,
    studentId: asNonEmptyString(raw.studentId) ?? "unknown",
    studentName: asNonEmptyString(raw.studentName) ?? "Learner",
    subject: asNonEmptyString(raw.subject) ?? "Unknown subject",
    topic: asNonEmptyString(raw.topic) ?? "Unknown topic",
    difficulty: asNonEmptyString(raw.difficulty),
    status: asNonEmptyString(raw.status) ?? "in_progress",
    scoringSource: asNonEmptyString(raw.scoringSource) ?? "legacy",
    currentPhase: asNonEmptyString(raw.currentPhase) ?? "",
    currentStage: asNonEmptyString(raw.currentStage) ?? "",
    workflowVersion: typeof raw.workflowVersion === "number" ? raw.workflowVersion : null,
    promptAdjustment: asNonEmptyString(raw.promptAdjustment),
    responseCount: typeof raw.responseCount === "number" ? raw.responseCount : 0,
    supportUsage: typeof raw.supportUsage === "number" ? raw.supportUsage : 0,
    aiFallbackEvents: fallbacks,
    supportHistory,
    diagnosisSummary: asStringArray(raw.diagnosisSummary),
    selfCorrectedCategories: asStringArray(raw.selfCorrectedCategories),
    resolvedMisconceptions: asStringArray(raw.resolvedMisconceptions),
    activeTopicMisconceptions,
    misconceptions: Array.isArray(raw.misconceptions) ? raw.misconceptions : [],
    diagnosis: raw.diagnosis ?? null,
    diagnosisCategory: asNonEmptyString(raw.diagnosisCategory),
    lastDiagnosis: (asRecord(raw.lastDiagnosis) as SessionDiagnosisPayload | null) ?? null,
    scorecard: (asRecord(raw.scorecard) as SessionScorecardPayload | null) ?? null,
    responseTimeMs: extractResponseTimeMs(raw, fallbacks),
    createdAt: raw.createdAt as TimestampLike,
    updatedAt: raw.updatedAt as TimestampLike,
  };
}

function buildDiagnosisEntry(session: SessionMonitorRecord): NormalizedDiagnosisEntry | null {
  const categorySet = new Set<string>();
  for (const cat of session.diagnosisSummary) {
    if (cat !== "none") categorySet.add(cat);
  }

  const lastCategory = asNonEmptyString(session.lastDiagnosis?.category);
  if (lastCategory && lastCategory !== "none") {
    categorySet.add(lastCategory);
  }

  if (session.diagnosisCategory && session.diagnosisCategory !== "none") {
    categorySet.add(session.diagnosisCategory);
  }

  for (const item of session.activeTopicMisconceptions) {
    const cat = asNonEmptyString(item.category);
    if (cat && cat !== "none") categorySet.add(cat);
  }

  const misconceptionNotes: string[] = [];
  for (const item of session.misconceptions) {
    const text = asNonEmptyString(item);
    if (text) {
      if (text in DIAGNOSIS_CATEGORY_LABELS) categorySet.add(text);
      else misconceptionNotes.push(text);
      continue;
    }
    const obj = asRecord(item);
    if (obj) {
      const cat = asNonEmptyString(obj.category);
      if (cat && cat !== "none") categorySet.add(cat);
      const note =
        asNonEmptyString(obj.label) ??
        asNonEmptyString(obj.description) ??
        asNonEmptyString(obj.explanation);
      if (note) misconceptionNotes.push(note);
    }
  }

  const diagnosisObj = asRecord(session.diagnosis);
  const diagnosisText =
    asNonEmptyString(session.diagnosis) ??
    asNonEmptyString(diagnosisObj?.explanation) ??
    asNonEmptyString(diagnosisObj?.summary) ??
    null;
  const diagnosisObjCategory = asNonEmptyString(diagnosisObj?.category);
  if (diagnosisObjCategory && diagnosisObjCategory !== "none") {
    categorySet.add(diagnosisObjCategory);
  }

  const explanation =
    asNonEmptyString(session.lastDiagnosis?.explanation) ??
    diagnosisText ??
    (misconceptionNotes.length > 0 ? misconceptionNotes.join(" · ") : null);
  const incorrectStep = asNonEmptyString(session.lastDiagnosis?.incorrectStep);
  const recommendedAction = asNonEmptyString(session.lastDiagnosis?.recommendedAction);
  const correctivePrompt = asNonEmptyString(session.lastDiagnosis?.correctivePrompt);
  const evidence = asStringArray(session.lastDiagnosis?.evidence);
  const scorecardFeedback = asNonEmptyString(session.scorecard?.feedback);
  const scoreTotal =
    typeof session.scorecard?.total === "number" && Number.isFinite(session.scorecard.total)
      ? session.scorecard.total
      : null;

  const hasDiagnosticSignal =
    categorySet.size > 0 ||
    explanation !== null ||
    incorrectStep !== null ||
    recommendedAction !== null ||
    correctivePrompt !== null ||
    evidence.length > 0 ||
    scorecardFeedback !== null;

  if (!hasDiagnosticSignal) return null;

  const categories =
    categorySet.size > 0
      ? Array.from(categorySet)
      : lastCategory
        ? [lastCategory]
        : ["none"];
  const primaryCategory = categories[0];
  const resolvedCategories = Array.from(
    new Set([...session.selfCorrectedCategories, ...session.resolvedMisconceptions]),
  );

  const searchParts = [
    session.id,
    session.studentName,
    session.studentId,
    session.subject,
    session.topic,
    ...categories,
    ...categories.map(displayDiagnosisCategory),
    explanation ?? "",
    incorrectStep ?? "",
    recommendedAction ?? "",
    correctivePrompt ?? "",
    scorecardFeedback ?? "",
    ...evidence,
  ];

  return {
    sessionId: session.id,
    studentName: session.studentName,
    studentId: session.studentId,
    subject: session.subject,
    topic: session.topic,
    status: session.status,
    scoreTotal,
    scorecardFeedback,
    categories,
    primaryCategory,
    severity: asNonEmptyString(session.lastDiagnosis?.severity),
    confidence: asNonEmptyString(session.lastDiagnosis?.confidence),
    resolutionStatus: asNonEmptyString(session.lastDiagnosis?.resolutionStatus),
    targetPhase: asNonEmptyString(session.lastDiagnosis?.targetPhase),
    explanation,
    incorrectStep,
    recommendedAction,
    correctivePrompt,
    evidence,
    resolvedCategories,
    updatedAt: session.updatedAt ?? session.createdAt,
    searchText: searchParts.join(" ").toLowerCase(),
  };
}

/**
 * Redesigned administrator Activity & AI Logs console providing three tabbed views:
 * Admin Activity (`audit_logs`), AI Interaction Logs (`ai_failure_logs` + `sessions`),
 * and Error Diagnosis derived from session diagnostic metadata and `DIAGNOSIS_CATEGORY_LABELS`.
 *
 * @returns The Activity & AI Logs monitoring page wrapped in {@link AdminShell}.
 */
export function SecureAdminLogs() {
  const [activeTab, setActiveTab] = useState<LogsTabId>("activity");

  // Tab 1 & Legacy AI failure logs
  const [audits, setAudits] = useState<LogEntry[]>([]);
  const [failures, setFailures] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const cursors = useRef<Array<QueryDocumentSnapshot<DocumentData> | undefined>>([]);
  const exhausted = useRef([false, false]);
  const loadingLogsRef = useRef(false);

  const [auditSearch, setAuditSearch] = useState("");
  const [auditCategory, setAuditCategory] = useState<AuditCategoryFilter>("all");

  // Lazy-loaded sessions for Tab 2 (AI Interaction Logs) & Tab 3 (Error Diagnosis)
  const [sessions, setSessions] = useState<SessionMonitorRecord[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const loadingSessionsRef = useRef(false);

  // Tab 2 search/filter/pagination
  const [aiSearch, setAiSearch] = useState("");
  const [aiFilter, setAiFilter] = useState<AiInteractionFilter>("all");
  const [aiPage, setAiPage] = useState(1);

  // Tab 3 search/filter/pagination
  const [diagnosisSearch, setDiagnosisSearch] = useState("");
  const [diagnosisCategoryFilter, setDiagnosisCategoryFilter] = useState<string>("all");
  const [diagnosisPage, setDiagnosisPage] = useState(1);

  const loadLogs = useCallback(async (reset = false) => {
    if (!db || loadingLogsRef.current) return;
    loadingLogsRef.current = true;
    setBusy(true);
    setError(null);
    if (reset) {
      cursors.current = [];
      exhausted.current = [false, false];
    }
    try {
      const pages = await Promise.all(
        ["audit_logs", "ai_failure_logs"].map((name, index) => {
          if (!reset && exhausted.current[index]) return null;
          const cursor = reset ? undefined : cursors.current[index];
          return getDocs(
            query(
              collection(db!, name),
              orderBy("createdAt", "desc"),
              ...(cursor ? [startAfter(cursor)] : []),
              limit(LOG_PAGE_SIZE),
            ),
          );
        }),
      );
      pages.forEach((page, index) => {
        if (!page) return;
        cursors.current[index] = page.docs.at(-1);
        exhausted.current[index] = page.docs.length < LOG_PAGE_SIZE;
        const rows: LogEntry[] = page.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        (index === 0 ? setAudits : setFailures)((previous) =>
          reset ? rows : [...previous, ...rows],
        );
      });
      setMore(exhausted.current.some((value) => !value));
    } catch (cause) {
      setError(errorMessage(cause, "Administrator logs could not be loaded."));
    } finally {
      setBusy(false);
      loadingLogsRef.current = false;
    }
  }, []);

  const loadSessions = useCallback(async () => {
    if (!db || loadingSessionsRef.current) return;
    loadingSessionsRef.current = true;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "sessions"),
          orderBy("updatedAt", "desc"),
          limit(SESSIONS_QUERY_LIMIT),
        ),
      );
      const rows = (snapshot?.docs ?? []).map((item) =>
        normalizeSessionDoc(item.id, item.data()),
      );
      setSessions(rows);
      setSessionsLoaded(true);
    } catch (cause) {
      setSessionsError(
        errorMessage(cause, "Session interaction and diagnosis logs could not be loaded."),
      );
    } finally {
      setSessionsLoading(false);
      loadingSessionsRef.current = false;
    }
  }, []);

  // Load initial audit_logs + ai_failure_logs page; subsequent pages are user-requested.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLogs(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  // Load recent sessions lazily when AI Interaction Logs or Error Diagnosis tab is opened.
  useEffect(() => {
    if (activeTab === "activity" || sessionsLoaded) return;
    const timer = window.setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadSessions, sessionsLoaded]);

  const filteredAudits = useMemo(() => {
    const term = auditSearch.trim().toLowerCase();
    return audits.filter((row) => {
      const category = classifyAuditEntry(row);
      if (auditCategory !== "all" && category !== auditCategory) return false;
      if (!term) return true;
      const haystack = [
        row.id,
        row.action,
        row.operation,
        row.target,
        row.reason,
        row.actorId,
        row.sessionId,
        row.correlationId,
        row.details ? JSON.stringify(row.details) : "",
      ]
        .filter((value) => value !== undefined && value !== null)
        .map(String)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [auditCategory, auditSearch, audits]);

  const filteredSessionInteractions = useMemo(() => {
    if (aiFilter === "legacy_failures") return [];
    const term = aiSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      if (aiFilter === "ai_formative" && session.scoringSource !== "ai_formative") {
        return false;
      }
      if (aiFilter === "client_practice" && session.scoringSource !== "client_practice") {
        return false;
      }
      if (aiFilter === "fallbacks" && session.aiFallbackEvents.length === 0) {
        return false;
      }
      if (!term) return true;
      const haystack = [
        session.id,
        session.studentName,
        session.studentId,
        session.subject,
        session.topic,
        session.scoringSource,
        session.status,
        session.currentPhase,
        session.aiFallbackEvents.length > 0
          ? JSON.stringify(session.aiFallbackEvents)
          : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [aiFilter, aiSearch, sessions]);

  const paginatedInteractions = useMemo(
    () => paginateSlice(filteredSessionInteractions, aiPage, INTERACTION_PAGE_SIZE),
    [aiPage, filteredSessionInteractions],
  );

  const filteredLegacyFailures = useMemo(() => {
    if (aiFilter !== "all" && aiFilter !== "legacy_failures") return [];
    const term = aiSearch.trim().toLowerCase();
    if (!term) return failures;
    return failures.filter((row) =>
      JSON.stringify(sanitizePayloadValue(row)).toLowerCase().includes(term),
    );
  }, [aiFilter, aiSearch, failures]);

  const diagnosisEntries = useMemo<NormalizedDiagnosisEntry[]>(() => {
    const entries: NormalizedDiagnosisEntry[] = [];
    for (const session of sessions) {
      const entry = buildDiagnosisEntry(session);
      if (entry) entries.push(entry);
    }
    return entries;
  }, [sessions]);

  const diagnosisCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of diagnosisEntries) {
      for (const cat of entry.categories) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [diagnosisEntries]);

  const filteredDiagnosisEntries = useMemo(() => {
    const term = diagnosisSearch.trim().toLowerCase();
    return diagnosisEntries.filter((entry) => {
      if (
        diagnosisCategoryFilter !== "all" &&
        !entry.categories.includes(diagnosisCategoryFilter)
      ) {
        return false;
      }
      if (term && !entry.searchText.includes(term)) return false;
      return true;
    });
  }, [diagnosisCategoryFilter, diagnosisEntries, diagnosisSearch]);

  const paginatedDiagnosisEntries = useMemo(
    () => paginateSlice(filteredDiagnosisEntries, diagnosisPage, DIAGNOSIS_PAGE_SIZE),
    [diagnosisPage, filteredDiagnosisEntries],
  );

  const tabs: ReadonlyArray<AdminTabItem> = [
    {
      id: "activity",
      label: "Admin Activity",
      badge: (
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">
          {audits.length}
        </span>
      ),
    },
    {
      id: "ai",
      label: "AI Interaction Logs",
      badge: (
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">
          {sessionsLoaded ? sessions.length + failures.length : failures.length}
        </span>
      ),
    },
    {
      id: "diagnosis",
      label: "Error Diagnosis",
      ...(sessionsLoaded
        ? {
            badge: (
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">
                {diagnosisEntries.length}
              </span>
            ),
          }
        : {}),
    },
  ];

  return (
    <AdminShell active="logs">
      <div className="space-y-6">
        <PageTitle
          title="Activity and AI Logs"
          description="Practice uses live Gemini requests through the learning API. Monitor administrative audit events, AI interaction metadata, legacy failures, and learner error diagnoses."
        />

        <details className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
          <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
            About system logging &amp; monitoring scope
          </summary>
          <p className="mt-2 leading-5">
            Configuration alone does not confirm provider availability. Current request
            failures, quota rejections, and concurrency conflicts are recorded as sanitized
            status/code metadata in server logs; request timing is also logged. These feeds
            are historical administrative events, session interaction metadata, and legacy AI
            failures, not a live provider health monitor, and do not cover external Firebase
            Console actions.
          </p>
        </details>

        <section
          aria-label="Log monitoring overview"
          className="grid gap-4 sm:grid-cols-3"
        >
          <AdminStat
            label="Admin audit events"
            value={audits.length}
            loading={busy && audits.length === 0}
            Icon={ClipboardList}
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          />
          <AdminStat
            label="Legacy AI failures"
            value={failures.length}
            loading={busy && failures.length === 0}
            Icon={FileWarning}
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          />
          <AdminStat
            label="Sessions monitored"
            value={sessionsLoaded ? sessions.length : "—"}
            loading={sessionsLoading}
            Icon={BrainCircuit}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
            helperText={
              sessionsLoaded
                ? `${diagnosisEntries.length} with diagnostic records`
                : "Open AI Interaction or Error Diagnosis to load"
            }
          />
        </section>

        {error && (
          <Alert
            tone="error"
            action={
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadLogs(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                Retry
              </button>
            }
          >
            {error}
          </Alert>
        )}

        <AdminTabs
          items={tabs}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as LogsTabId)}
          ariaLabel="Log monitoring sections"
        />

        {activeTab === "activity" && (
          <section aria-label="Administrative audit activity" className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <AdminSearchInput
                value={auditSearch}
                onChange={setAuditSearch}
                placeholder="Search action, target, actor, reason, or details"
                ariaLabel="Search administrative audit logs"
                clearAriaLabel="Clear audit log search"
              />
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All"],
                    ["account", "Account changes"],
                    ["content", "Content modifications"],
                    ["cohort", "Cohort configuration"],
                    ["reviews", "Administrative reviews/exports"],
                  ] as const
                ).map(([value, label]) => (
                  <AdminFilterPill
                    key={value}
                    active={auditCategory === value}
                    onClick={() => setAuditCategory(value)}
                  >
                    {label}
                  </AdminFilterPill>
                ))}
                {(auditSearch.trim() || auditCategory !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditSearch("");
                      setAuditCategory("all");
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {busy && audits.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <ListRowSkeleton rows={4} label="Loading administrator logs" />
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
                    <Activity
                      aria-hidden="true"
                      className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
                    />
                    <span>Audit events</span>
                  </h2>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {filteredAudits.length} matching entries
                  </span>
                </div>

                {busy && (
                  <p
                    role="status"
                    className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    Loading logs…
                  </p>
                )}

                {filteredAudits.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No administrative audit entries match your current filter.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[42rem] divide-y divide-slate-200 overflow-auto dark:divide-slate-800">
                    {filteredAudits.map((row) => {
                      const category = classifyAuditEntry(row);
                      const actorId = asNonEmptyString(row.actorId);
                      const details = row.details ? sanitizePayloadValue(row.details) : null;
                      return (
                        <div key={row.id} className="py-3.5 text-xs">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-950 dark:text-white">
                                {row.action ?? row.operation ?? row.reason ?? "event"}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${auditCategoryBadgeClass(category)}`}
                              >
                                {auditCategoryLabel(category)}
                              </span>
                            </div>
                            {row.createdAt !== undefined && row.createdAt !== null && (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                {formatTimestamp(row.createdAt)}
                              </span>
                            )}
                          </div>

                          <p className="mt-1 break-all text-slate-600 dark:text-slate-300">
                            Target: {row.target ?? row.sessionId ?? row.correlationId ?? row.id}
                            {actorId ? ` · Actor: ${actorId}` : ""}
                          </p>

                          {row.reason && row.action && (
                            <p className="mt-1 text-slate-500 dark:text-slate-400">
                              Reason: {row.reason}
                            </p>
                          )}

                          {details !== null && (
                            <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/50">
                              <summary className="cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                Event details
                              </summary>
                              <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {JSON.stringify(details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadLogs(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                <span>Refresh logs</span>
              </button>
              {more && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadLogs(false)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Load older logs
                </button>
              )}
            </div>
          </section>
        )}

        {activeTab === "ai" && (
          <section aria-label="AI interaction and legacy failure logs" className="space-y-5">
            {sessionsError && (
              <Alert
                tone="error"
                action={
                  <button
                    type="button"
                    onClick={() => void loadSessions()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    Retry
                  </button>
                }
              >
                {sessionsError}
              </Alert>
            )}

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <AdminSearchInput
                  value={aiSearch}
                  onChange={(value) => {
                    setAiSearch(value);
                    setAiPage(1);
                  }}
                  placeholder="Search learner, topic, session ID, scoring source, or error metadata"
                  ariaLabel="Search AI interaction logs"
                  clearAriaLabel="Clear AI interaction search"
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={busy || sessionsLoading}
                  onClick={() => {
                    void loadLogs(true);
                    void loadSessions();
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {(busy || sessionsLoading) && (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>Refresh logs</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ["all", "All"],
                    ["ai_formative", "Live AI Formative"],
                    ["client_practice", "Client Practice"],
                    ["fallbacks", "Fallback Events"],
                    ["legacy_failures", "Legacy Failure Feed"],
                  ] as const
                ).map(([value, label]) => (
                  <AdminFilterPill
                    key={value}
                    active={aiFilter === value}
                    onClick={() => {
                      setAiFilter(value);
                      setAiPage(1);
                    }}
                  >
                    {label}
                  </AdminFilterPill>
                ))}
              </div>
            </div>

            {aiFilter !== "legacy_failures" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
                    <BrainCircuit
                      aria-hidden="true"
                      className="h-5 w-5 text-indigo-600 dark:text-indigo-400"
                    />
                    <span>Recent AI &amp; practice session interactions</span>
                  </h2>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {filteredSessionInteractions.length} sessions
                  </span>
                </div>

                {sessionsLoading ? (
                  <div className="mt-3">
                    <ListRowSkeleton rows={4} label="Loading AI interaction metadata" />
                  </div>
                ) : filteredSessionInteractions.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No session interactions match your current filter.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                      {paginatedInteractions.items.map((session) => {
                        const sanitizedPayload = sanitizePayloadValue({
                          sessionId: session.id,
                          scoringSource: session.scoringSource,
                          workflowVersion: session.workflowVersion,
                          currentStage: session.currentStage,
                          currentPhase: session.currentPhase,
                          promptAdjustment: session.promptAdjustment,
                          responseCount: session.responseCount,
                          supportUsage: session.supportUsage,
                          responseTimeMs: session.responseTimeMs,
                          aiFallbackEvents: session.aiFallbackEvents,
                          supportHistory: session.supportHistory,
                        });
                        return (
                          <div key={session.id} className="space-y-2 py-4 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-950 dark:text-white">
                                  {session.studentName}
                                </span>
                                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30">
                                  {interactionSourceLabel(session.scoringSource)}
                                </span>
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(session.status)}`}
                                >
                                  {displaySessionStatus(session.status)}
                                </span>
                                {session.aiFallbackEvents.length > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                                    <AlertTriangle
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                    />
                                    {session.aiFallbackEvents.length} fallback
                                    {session.aiFallbackEvents.length === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>
                              <Link
                                to={`/admin/review/${session.id}`}
                                className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                              >
                                Inspect session
                              </Link>
                            </div>

                            <p className="text-slate-600 dark:text-slate-300">
                              {session.subject} · {session.topic}
                              {session.currentPhase
                                ? ` · Phase: ${displayPhaseLabel(session.currentPhase)}`
                                : ""}
                            </p>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>Responses: {session.responseCount}</span>
                              <span>Support requests: {session.supportUsage}</span>
                              {session.responseTimeMs !== null && (
                                <span>Response time: {session.responseTimeMs} ms</span>
                              )}
                              <span>Updated: {formatTimestamp(session.updatedAt)}</span>
                            </div>

                            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/50">
                              <summary className="cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                Sanitized payload metadata
                              </summary>
                              <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                {JSON.stringify(sanitizedPayload, null, 2)}
                              </pre>
                            </details>
                          </div>
                        );
                      })}
                    </div>

                    <AdminPagination
                      page={paginatedInteractions.page}
                      pageSize={INTERACTION_PAGE_SIZE}
                      totalItems={paginatedInteractions.totalItems}
                      onPageChange={setAiPage}
                      itemLabel="interactions"
                    />
                  </>
                )}
              </div>
            )}

            {(aiFilter === "all" || aiFilter === "legacy_failures") && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
                    <FileWarning
                      aria-hidden="true"
                      className="h-5 w-5 text-amber-600 dark:text-amber-400"
                    />
                    <span>Recorded legacy AI failure events</span>
                  </h2>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {filteredLegacyFailures.length} records
                  </span>
                </div>

                {filteredLegacyFailures.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No legacy AI failure records found.
                  </p>
                ) : (
                  <div className="mt-3 max-h-[32rem] divide-y divide-slate-200 overflow-auto dark:divide-slate-800">
                    {filteredLegacyFailures.map((row) => {
                      const sessionId = asNonEmptyString(row.sessionId);
                      return (
                        <div key={row.id} className="space-y-1.5 py-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-950 dark:text-white">
                              {row.operation ?? row.action ?? row.reason ?? "Legacy AI failure"}
                            </span>
                            {sessionId && (
                              <Link
                                to={`/admin/review/${sessionId}`}
                                className="font-semibold text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
                              >
                                View session
                              </Link>
                            )}
                          </div>
                          <p className="break-all text-slate-500 dark:text-slate-400">
                            {row.target ?? sessionId ?? row.correlationId ?? row.id}
                          </p>
                          {row.createdAt !== undefined && row.createdAt !== null && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              {formatTimestamp(row.createdAt)}
                            </p>
                          )}
                          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/50">
                            <summary className="cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              Sanitized failure payload
                            </summary>
                            <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                              {JSON.stringify(sanitizePayloadValue(row), null, 2)}
                            </pre>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "diagnosis" && (
          <section aria-label="Learner error diagnosis and misconceptions" className="space-y-5">
            {sessionsError && (
              <Alert
                tone="error"
                action={
                  <button
                    type="button"
                    onClick={() => void loadSessions()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    Retry
                  </button>
                }
              >
                {sessionsError}
              </Alert>
            )}

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <AdminSearchInput
                  value={diagnosisSearch}
                  onChange={(value) => {
                    setDiagnosisSearch(value);
                    setDiagnosisPage(1);
                  }}
                  placeholder="Search learner, topic, misconception category, or diagnostic note"
                  ariaLabel="Search error diagnosis records"
                  clearAriaLabel="Clear diagnosis search"
                  className="flex-1"
                />
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="sr-only">Filter by diagnosis category</span>
                  <select
                    aria-label="Filter by diagnosis category"
                    value={diagnosisCategoryFilter}
                    onChange={(event) => {
                      setDiagnosisCategoryFilter(event.target.value);
                      setDiagnosisPage(1);
                    }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All diagnosis categories</option>
                    {Object.entries(DIAGNOSIS_CATEGORY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {diagnosisCategoryCounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <AdminFilterPill
                    active={diagnosisCategoryFilter === "all"}
                    onClick={() => {
                      setDiagnosisCategoryFilter("all");
                      setDiagnosisPage(1);
                    }}
                  >
                    All ({diagnosisEntries.length})
                  </AdminFilterPill>
                  {diagnosisCategoryCounts.map(([category, count]) => (
                    <AdminFilterPill
                      key={category}
                      variant="muted"
                      active={diagnosisCategoryFilter === category}
                      onClick={() => {
                        setDiagnosisCategoryFilter(category);
                        setDiagnosisPage(1);
                      }}
                    >
                      {displayDiagnosisCategory(category)} ({count})
                    </AdminFilterPill>
                  ))}
                </div>
              )}
            </div>

            {sessionsLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <ListRowSkeleton rows={4} label="Loading error diagnosis records" />
              </div>
            ) : filteredDiagnosisEntries.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                No session error diagnosis or misconception records match your current filter.
              </div>
            ) : (
              <div>
                <div className="space-y-3">
                  {paginatedDiagnosisEntries.items.map((entry) => (
                    <article
                      key={entry.sessionId}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Stethoscope
                              aria-hidden="true"
                              className="h-4 w-4 text-indigo-600 dark:text-indigo-400"
                            />
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                              {entry.studentName}
                            </h3>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClass(entry.status)}`}
                            >
                              {displaySessionStatus(entry.status)}
                            </span>
                            {entry.scoreTotal !== null && (
                              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                                Scorecard: {entry.scoreTotal}/100
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {entry.subject} · {entry.topic}
                            {entry.targetPhase
                              ? ` · Target phase: ${displayPhaseLabel(entry.targetPhase)}`
                              : ""}
                            {entry.updatedAt
                              ? ` · Updated: ${formatTimestamp(entry.updatedAt)}`
                              : ""}
                          </p>
                        </div>

                        <Link
                          to={`/admin/review/${entry.sessionId}`}
                          className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-indigo-600 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                        >
                          Open session review
                        </Link>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.categories.map((category) => {
                          const isResolved =
                            entry.resolvedCategories.includes(category) ||
                            entry.resolutionStatus === "resolved";
                          return (
                            <span
                              key={category}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isResolved
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                                  : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
                              }`}
                            >
                              <span>{displayDiagnosisCategory(category)}</span>
                              {isResolved && (
                                <span className="text-[10px] opacity-80">(Resolved)</span>
                              )}
                            </span>
                          );
                        })}
                        {entry.severity && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30">
                            Severity: {entry.severity}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs leading-5 text-slate-700 dark:text-slate-300">
                        {entry.explanation && (
                          <p>
                            <strong className="text-slate-900 dark:text-slate-100">
                              Diagnosis:
                            </strong>{" "}
                            {entry.explanation}
                          </p>
                        )}
                        {entry.incorrectStep && (
                          <p>
                            <strong className="text-slate-900 dark:text-slate-100">
                              Incorrect step:
                            </strong>{" "}
                            {entry.incorrectStep}
                          </p>
                        )}
                        {entry.recommendedAction && (
                          <p>
                            <strong className="text-slate-900 dark:text-slate-100">
                              Recommended action:
                            </strong>{" "}
                            {entry.recommendedAction}
                          </p>
                        )}
                        {entry.correctivePrompt && (
                          <p className="text-slate-600 dark:text-slate-400">
                            <strong className="text-slate-800 dark:text-slate-200">
                              Corrective prompt:
                            </strong>{" "}
                            {entry.correctivePrompt}
                          </p>
                        )}
                        {entry.scorecardFeedback && (
                          <p className="text-slate-600 dark:text-slate-400">
                            <strong className="text-slate-800 dark:text-slate-200">
                              Scorecard feedback:
                            </strong>{" "}
                            {entry.scorecardFeedback}
                          </p>
                        )}
                      </div>

                      {entry.evidence.length > 0 && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.evidence.map((item, index) => (
                            <li key={`${entry.sessionId}-ev-${index}`}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>

                <AdminPagination
                  page={paginatedDiagnosisEntries.page}
                  pageSize={DIAGNOSIS_PAGE_SIZE}
                  totalItems={paginatedDiagnosisEntries.totalItems}
                  onPageChange={setDiagnosisPage}
                  itemLabel="diagnostic sessions"
                />
              </div>
            )}
          </section>
        )}
      </div>
    </AdminShell>
  );
}
