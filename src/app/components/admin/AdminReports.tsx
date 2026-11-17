"use client";

import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { adminExportReport, adminQueryReport } from "@/lib/secure-api";
import type { ReportExportResponse, ReportKind, Subject } from "@mindguide/contracts";
import {
  Activity,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Download,
  Loader2,
  Printer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Alert } from "../ui/alert";
import { Tooltip } from "../ui/tooltip";
import { AdminShell } from "./AdminShell";
import {
  AdminFilterPill,
  AdminSearchInput,
  JsonTable,
  PageTitle,
  errorMessage,
} from "./admin-shared";

type ReportCategoryId = "learner_performance" | "subject_topic" | "scorecards" | "system_usage";

interface ReportCategoryConfig {
  readonly id: ReportCategoryId;
  readonly title: string;
  readonly description: string;
  readonly defaultKind: ReportKind;
  readonly kinds: ReadonlyArray<ReportKind>;
  readonly Icon: LucideIcon;
}

const REPORT_CATEGORIES: ReadonlyArray<ReportCategoryConfig> = [
  {
    id: "learner_performance",
    title: "Learner Performance Report",
    description: "Completed sessions, calibrated CT averages, and practice progress per learner.",
    defaultKind: "learning_progress",
    kinds: ["learning_progress"],
    Icon: Users,
  },
  {
    id: "subject_topic",
    title: "Subject and Topic Performance Report",
    description: "Misconception and topic-level error frequencies filtered by subject and topic.",
    defaultKind: "misconceptions",
    kinds: ["misconceptions"],
    Icon: BookOpen,
  },
  {
    id: "scorecards",
    title: "Critical Thinking Scorecard Report",
    description: "Per-session accuracy, logical validity, method selection, and reflection scores.",
    defaultKind: "scorecards",
    kinds: ["scorecards"],
    Icon: BrainCircuit,
  },
  {
    id: "system_usage",
    title: "System Usage Report",
    description: "Response volume, support requests, AI fallbacks, and session activity events.",
    defaultKind: "usage",
    kinds: ["usage", "activity"],
    Icon: BarChart3,
  },
];

function categoryForKind(kind: ReportKind): ReportCategoryId {
  return (
    REPORT_CATEGORIES.find((category) => category.kinds.includes(kind))?.id ??
    "learner_performance"
  );
}

/**
 * Administrator report builder organized into four report categories,
 * supporting Manila date bounds, subject/topic/learner filtering, preview, CSV download, and print export.
 */
export function SecureAdminReports() {
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [learnerFilter, setLearnerFilter] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [kind, setKind] = useState<ReportKind>("learning_progress");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [includeIdentity, setIncludeIdentity] = useState(false);
  const [reason, setReason] = useState("Authorized capstone evaluation report");
  const [error, setError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"preview" | "csv" | "print" | null>(null);
  const reportPending = useRef(false);

  const activeCategory = categoryForKind(kind);

  const filters = {
    ...(from ? { from: Date.parse(`${from}T00:00:00+08:00`) } : {}),
    ...(to ? { to: Date.parse(`${to}T23:59:59.999+08:00`) } : {}),
    ...(subject ? { subject: subject as Subject } : {}),
    ...(topic.trim() ? { topic: topic.trim() } : {}),
  };

  const topicSuggestions = useMemo(() => {
    if (!subject) return VALIDATED_TOPICS;
    return VALIDATED_TOPICS.filter((item) => item.subject === subject);
  }, [subject]);

  const visibleRows = useMemo(() => {
    const queryText = learnerFilter.trim().toLowerCase();
    if (!queryText) return rows;
    return rows.filter((row) => {
      const candidates = [row.learner, row.studentName, row.studentId, row.sessionId];
      return candidates.some(
        (value) =>
          value !== undefined &&
          value !== null &&
          String(value).toLowerCase().includes(queryText),
      );
    });
  }, [rows, learnerFilter]);

  function clearReport() {
    setRows([]);
    setTotal(null);
    setError(null);
  }

  function selectKind(nextKind: ReportKind) {
    clearReport();
    setKind(nextKind);
  }

  async function run() {
    if (reportPending.current) return;
    reportPending.current = true;
    setReportBusy(true);
    setBusyAction("preview");
    setError(null);
    try {
      if (from && to && from > to) {
        throw new Error("The report start date must not follow its end date.");
      }
      const combined: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      do {
        const result = await adminQueryReport({
          kind,
          ...filters,
          includeIdentity,
          limit: 250,
          ...(cursor ? { cursor } : {}),
        });
        combined.push(...result.rows);
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      setRows(combined);
      setTotal(combined.length);
    } catch (cause) {
      setRows([]);
      setTotal(null);
      setError(errorMessage(cause, "Report failed."));
    } finally {
      reportPending.current = false;
      setReportBusy(false);
      setBusyAction(null);
    }
  }

  async function output(format: "csv" | "print") {
    if (reportPending.current) return;
    reportPending.current = true;
    setReportBusy(true);
    setBusyAction(format);
    setError(null);
    try {
      if (from && to && from > to) {
        throw new Error("The report start date must not follow its end date.");
      }
      const result = await adminExportReport({
        kind,
        ...filters,
        includeIdentity,
        exportReason: reason,
        limit: 1000,
        output: format,
      });
      if (result.output === "csv") {
        const url = URL.createObjectURL(
          new Blob([result.csv], { type: "text/csv;charset=utf-8" }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        document.body.append(anchor);
        try {
          anchor.click();
        } finally {
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      } else {
        navigate("/admin/reports/print", { state: { report: result } });
      }
    } catch (cause) {
      setError(errorMessage(cause, "Export failed."));
    } finally {
      reportPending.current = false;
      setReportBusy(false);
      setBusyAction(null);
    }
  }

  return (
    <AdminShell active="reports">
      <PageTitle
        title="Reports and Exports"
        description="Reports are pseudonymized by default. CSV and print/PDF output are audited."
      />

      {error && (
        <Alert tone="error" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <section aria-label="Report categories" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {REPORT_CATEGORIES.map(({ id, title, description, defaultKind, Icon }) => {
          const isSelected = activeCategory === id;
          return (
            <button
              key={id}
              type="button"
              disabled={reportBusy}
              aria-pressed={isSelected}
              onClick={() => {
                if (!isSelected) selectKind(defaultKind);
              }}
              className={`flex flex-col items-start rounded-2xl border p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 ${
                isSelected
                  ? "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600/20 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-400/20"
                  : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  isSelected
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                }`}
              >
                <Icon aria-hidden="true" className="h-4.5 w-4.5" />
              </span>
              <span className="mt-3 text-sm font-bold text-slate-950 dark:text-white">
                {title}
              </span>
              <span className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
                {description}
              </span>
            </button>
          );
        })}
      </section>

      {activeCategory === "system_usage" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Activity aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Usage mode:
          </span>
          <AdminFilterPill
            active={kind === "usage"}
            onClick={() => selectKind("usage")}
            variant="muted"
          >
            Usage metrics
          </AdminFilterPill>
          <AdminFilterPill
            active={kind === "activity"}
            onClick={() => selectKind("activity")}
            variant="muted"
          >
            Activity audit events
          </AdminFilterPill>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>From (Manila):</span>
            <input
              disabled={reportBusy}
              type="date"
              max={to || undefined}
              value={from}
              onChange={(event) => {
                clearReport();
                setFrom(event.target.value);
              }}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Through (Manila):</span>
            <input
              disabled={reportBusy}
              type="date"
              min={from || undefined}
              value={to}
              onChange={(event) => {
                clearReport();
                setTo(event.target.value);
              }}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Subject:</span>
            <select
              disabled={reportBusy}
              aria-label="Subject filter"
              value={subject}
              onChange={(event) => {
                clearReport();
                setSubject(event.target.value);
              }}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All subjects</option>
              {VALIDATED_SUBJECTS.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Exact topic:</span>
            <input
              disabled={reportBusy}
              list="admin-report-topics"
              value={topic}
              onChange={(event) => {
                clearReport();
                setTopic(event.target.value);
              }}
              placeholder="Filter by topic"
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        <datalist id="admin-report-topics">
          {topicSuggestions.map((item) => (
            <option key={item.id} value={item.name} />
          ))}
        </datalist>

        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-start dark:border-slate-800">
          <AdminSearchInput
            value={learnerFilter}
            onChange={setLearnerFilter}
            placeholder="Filter previewed rows by learner or pseudonym"
            ariaLabel="Filter previewed rows by learner"
            clearAriaLabel="Clear learner filter"
          />

          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <input
              disabled={reportBusy}
              type="checkbox"
              checked={includeIdentity}
              onChange={(event) => {
                clearReport();
                setIncludeIdentity(event.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
            />
            Include identity
          </label>

          <div>
            <input
              disabled={reportBusy}
              value={reason}
              aria-label="Export audit reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Audit reason"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Required for CSV/print exports (8+ chars audited). Optional for Preview.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reportBusy}
              onClick={() => void run()}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
            >
              {busyAction === "preview" && (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              )}
              <span>{busyAction === "preview" ? "Loading..." : "Preview"}</span>
            </button>
            <Tooltip label="Export CSV">
              <button
                type="button"
                disabled={reportBusy}
                onClick={() => void output("csv")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-label="Export CSV"
              >
                {busyAction === "csv" ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Download aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </Tooltip>
            <Tooltip label="Open print report">
              <button
                type="button"
                disabled={reportBusy}
                onClick={() => void output("print")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-label="Open print report"
              >
                {busyAction === "print" ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {total !== null && (
        <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Preview: showing {visibleRows.length} of {total} rows
          {learnerFilter.trim() ? ` matching "${learnerFilter.trim()}"` : ""}. Exports include all
          matching records.
        </p>
      )}

      <JsonTable
        rows={visibleRows}
        emptyMessage={
          total !== null && rows.length > 0
            ? "No previewed rows match the learner filter."
            : "Generate a report to view results."
        }
      />
    </AdminShell>
  );
}

/**
 * Audited print-ready view for generated administrator reports.
 */
export function SecureAdminReportPrint() {
  const location = useLocation();
  const report = (location.state as { report?: ReportExportResponse } | null)?.report;

  if (!report || report.output !== "print") {
    return (
      <AdminShell active="reports">
        <Alert tone="error">
          This protected print view has no prepared report. Return to Reports and generate one.
        </Alert>
        <Link
          to="/admin/reports"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Return to reports
        </Link>
      </AdminShell>
    );
  }

  return (
    <AdminShell active="reports">
      <div className="print-report">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row print:hidden">
          <Link
            to="/admin/reports"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Back
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Printer aria-hidden="true" className="h-4 w-4" />
            Print / Save as PDF
          </button>
        </div>
        <header className="mt-8 border-b border-slate-200 pb-5 dark:border-slate-800">
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl dark:text-white">
            MINDGUIDE {report.kind.replace(/_/g, " ")} report
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Generated {new Date(report.generatedAt).toLocaleString()} ·{" "}
            {report.pseudonymized ? "Pseudonymized" : "Identity included"} · {report.rows.length}{" "}
            {report.rows.length === 1 ? "row" : "rows"}
          </p>
        </header>
        <JsonTable rows={report.rows} />
      </div>
    </AdminShell>
  );
}
