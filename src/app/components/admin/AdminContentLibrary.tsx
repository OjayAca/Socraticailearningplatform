"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { collection, getDocs } from "firebase/firestore";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FilterX,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Link, useParams } from "react-router";
import type { CatalogReadinessResponse, Difficulty, ManagedContentStatus, Subject } from "@mindguide/contracts";
import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { db } from "@/lib/firebase";
import { displayContentCollectionLabel, displayPhaseLabel } from "@/lib/learning/display-labels";
import { adminArchiveContent, adminCatalogReadiness, adminDeleteContent, adminUpsertContent } from "@/lib/secure-api";
import { CONTENT_COLLECTIONS, type ContentCollection } from "../ManagedContentEditor";
import { MathText } from "../MathText";
import { Alert } from "../ui/alert";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { ListRowSkeleton } from "../ui/skeleton";
import { Tooltip } from "../ui/tooltip";
import { AdminShell } from "./AdminShell";
import {
  AdminPagination,
  AdminSearchInput,
  AdminTabs,
  PageTitle,
  type AdminTabItem,
} from "./admin-shared";
import {
  errorMessage as formatErrorMessage,
  paginateSlice,
  statusBadgeClass,
} from "./admin-utils";

/** Question delivery mode for problem records. */
export type QuestionType = "constructed_response" | "multiple_choice";

/** Allowed learner response formats for problem records. */
export type ResponseFormat = "text" | "latex";

/** Generic typed shape of a Firestore managed content document loaded into the library. */
interface ContentRecord {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  subjectId?: string;
  topicId?: string;
  subject?: Subject | string;
  topic?: string;
  difficulty?: Difficulty | string;
  variant?: number;
  problemText?: string;
  questionType?: QuestionType | string;
  choices?: string[];
  supportedResponseFormats?: ResponseFormat[];
  formulaTheoremReferenceIds?: string[];
  kind?: "formula" | "theorem" | string;
  statement?: string;
  variables?: unknown[];
  conditions?: string[];
  domain?: string;
  supportedTopics?: string[];
  equivalentNotation?: string[];
  problemId?: string;
  phase?: string;
  prompt?: string;
  phases?: string[];
  correctivePrompt?: string;
  priority?: number;
  minimumCompletedSessions?: number;
  increaseScoreThreshold?: number;
  decreaseScoreThreshold?: number;
  maxHintsForIncrease?: number;
  arithmeticErrorAloneLowersDifficulty?: boolean;
  subtopics?: Array<{ id: string; name: string; children?: Array<{ id: string; name: string }> }>;
  importSource?: string;
  status?: ManagedContentStatus | string;
  version?: number;
  [key: string]: unknown;
}

/** Props for {@link AdminContentLibrary}. */
interface AdminContentLibraryProps {
  /** Optional explicit collection override; falls back to the `:collection` route param or `"problems"`. */
  collectionName?: ContentCollection;
}

const PAGE_SIZE = 10;

const CONTENT_STATUSES: ReadonlyArray<ManagedContentStatus> = [
  "draft",
  "pending_validation",
  "approved",
  "rejected",
  "archived",
];

const DIFFICULTIES: ReadonlyArray<Difficulty> = ["Basic", "Intermediate", "Advanced"];

const QUESTION_TYPES: ReadonlyArray<QuestionType> = ["constructed_response", "multiple_choice"];

const SERVER_METADATA_KEYS = new Set([
  "id",
  "version",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "archivedAt",
  "validatedAt",
  "validationRecordId",
]);

const MATH_PARTS = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([^\n]+?\\\)|^\\[a-zA-Z]+[^\n]*$)/gm;

function resolveCollectionName(candidate?: string): ContentCollection {
  return CONTENT_COLLECTIONS.includes(candidate as ContentCollection)
    ? (candidate as ContentCollection)
    : "problems";
}

function humanizeLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatusLabel(status?: string): string {
  if (!status) return "Draft";
  if (status === "pending_validation") return "Pending Validation";
  return humanizeLabel(status);
}

function formatQuestionTypeLabel(questionType?: string): string {
  if (questionType === "multiple_choice") return "Multiple Choice";
  if (questionType === "constructed_response") return "Constructed Response";
  return "Unclassified";
}

function recordDisplayTitle(collectionName: ContentCollection, item: ContentRecord): string {
  if (collectionName === "problems") {
    const title = item.title?.trim();
    if (title) return title;
    const text = item.problemText?.trim();
    if (text) return text.length > 80 ? `${text.slice(0, 77)}...` : text;
    return item.id;
  }
  if (collectionName === "formula_theorem_references") {
    const statement = item.statement?.trim();
    if (statement) return statement.length > 80 ? `${statement.slice(0, 77)}...` : statement;
    return item.id;
  }
  if (collectionName === "socratic_prompt_bank") {
    const prompt = item.prompt?.trim();
    if (prompt) return prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;
    return item.id;
  }
  return item.name?.trim() || item.title?.trim() || item.id;
}

function isFixedCurriculumRecord(collectionName: ContentCollection, id: string): boolean {
  if (collectionName === "subjects") {
    return VALIDATED_SUBJECTS.some((subject) => subject.id === id);
  }
  if (collectionName === "topics") {
    return VALIDATED_TOPICS.some((topic) => topic.id === id);
  }
  return false;
}

function buildSearchableText(item: ContentRecord): string {
  return [
    item.id,
    item.title,
    item.name,
    item.description,
    item.problemText,
    item.statement,
    item.prompt,
    item.correctivePrompt,
    item.subject,
    item.topic,
    item.domain,
    item.problemId,
    item.phase,
    item.subjectId,
    item.topicId,
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .map((entry) => entry.toLowerCase())
    .join(" ");
}

function buildRestorePayload(collectionName: ContentCollection, item: ContentRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(item)) {
    if (!SERVER_METADATA_KEYS.has(key)) {
      payload[key] = entry;
    }
  }
  payload.status = collectionName === "subjects" || collectionName === "topics" ? "approved" : "draft";
  return payload;
}

function renderFormattedMath(text: string) {
  if (!text) return null;
  const parts = text.split(MATH_PARTS);
  if (parts.length <= 1) {
    return <MathText text={text} />;
  }
  return (
    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {parts.map((part, index) => {
        if (index % 2 === 0) {
          return part ? <MathText key={index} text={part} /> : null;
        }
        const isDisplay = part.startsWith("$$") || part.startsWith("\\[");
        const latex =
          isDisplay || part.startsWith("\\(")
            ? part.slice(2, -2)
            : part.startsWith("$")
              ? part.slice(1, -1)
              : part;
        return (
          <span key={index} className={isDisplay ? "block overflow-x-auto py-1.5" : undefined}>
            <MathText latex={latex} />
          </span>
        );
      })}
    </span>
  );
}

/**
 * Redesigned administrator Content Library view providing category tabs, secondary policy/category
 * switching, faceted filtering, catalog readiness summary, paginated records, preview modal,
 * and confirmed archive/restore/delete operations.
 *
 * @param props - See {@link AdminContentLibraryProps}.
 * @returns The rendered Content Library workspace.
 */
function AdminContentLibrary({ collectionName: propCollection }: AdminContentLibraryProps) {
  const params = useParams();
  const collectionName = resolveCollectionName(propCollection ?? params.collection);

  return <AdminContentLibraryInner key={collectionName} collectionName={collectionName} />;
}

function AdminContentLibraryInner({ collectionName }: { collectionName: ContentCollection }) {
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<CatalogReadinessResponse | null>(null);
  const [readinessExpanded, setReadinessExpanded] = useState(false);

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"archive" | "restore" | "delete" | null>(null);

  const [previewTarget, setPreviewTarget] = useState<ContentRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ContentRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ContentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentRecord | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("Remove unused draft learning content");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isBusy = busyAction !== null;

  const loadLibrary = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [snapshot, readinessResult] = await Promise.all([
        getDocs(collection(db, collectionName)),
        adminCatalogReadiness().catch(() => null),
      ]);
      const loadedItems: ContentRecord[] = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Record<string, unknown>),
      }));
      setItems(loadedItems);
      if (readinessResult) {
        setReadiness(readinessResult);
      }
    } catch (cause) {
      setErrorMsg(formatErrorMessage(cause, "Content library records could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLibrary();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadLibrary]);

  const primaryTabs: AdminTabItem[] = useMemo(
    () => [
      { id: "problems", label: "Problem Bank", href: "/admin/content/problems" },
      {
        id: "formula_theorem_references",
        label: "Formulas & Theorems",
        href: "/admin/content/formula_theorem_references",
      },
      {
        id: "socratic_prompt_bank",
        label: "Socratic Prompt Bank",
        href: "/admin/content/socratic_prompt_bank",
      },
      {
        id: "curriculum",
        label: "Subjects & Topics",
        href: "/admin/content/topics",
      },
    ],
    [],
  );

  const activePrimaryTabId =
    collectionName === "subjects" || collectionName === "topics"
      ? "curriculum"
      : collectionName === "problems" ||
          collectionName === "formula_theorem_references" ||
          collectionName === "socratic_prompt_bank"
        ? collectionName
        : "policies";

  const subjectOptions = useMemo(() => {
    const names = new Set<string>(VALIDATED_SUBJECTS.map((subject) => subject.name));
    for (const item of items) {
      const value = item.subject ?? item.domain;
      if (typeof value === "string" && value.trim()) names.add(value);
    }
    return [...names].sort();
  }, [items]);

  const topicOptions = useMemo(() => {
    const names = new Set<string>();
    for (const topic of VALIDATED_TOPICS) {
      if (!subjectFilter || topic.subject === subjectFilter) {
        names.add(topic.name);
      }
    }
    for (const item of items) {
      const itemSubject = item.subject ?? item.domain;
      if (subjectFilter && itemSubject !== subjectFilter) continue;
      if (typeof item.topic === "string" && item.topic.trim()) names.add(item.topic);
      if (collectionName === "topics" && typeof item.name === "string" && item.name.trim()) {
        names.add(item.name);
      }
    }
    return [...names].sort();
  }, [collectionName, items, subjectFilter]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      if (normalizedSearch && !buildSearchableText(item).includes(normalizedSearch)) {
        return false;
      }
      if (statusFilter && (item.status ?? "draft") !== statusFilter) {
        return false;
      }
      if (collectionName === "problems") {
        if (subjectFilter && item.subject !== subjectFilter) return false;
        if (topicFilter && item.topic !== topicFilter) return false;
        if (difficultyFilter && item.difficulty !== difficultyFilter) return false;
        if (questionTypeFilter && item.questionType !== questionTypeFilter) return false;
      } else if (collectionName === "formula_theorem_references") {
        if (subjectFilter && item.domain !== subjectFilter) return false;
        if (
          topicFilter &&
          !(Array.isArray(item.supportedTopics) && item.supportedTopics.includes(topicFilter))
        ) {
          return false;
        }
      } else if (collectionName === "topics") {
        if (subjectFilter && item.subject !== subjectFilter) return false;
        if (topicFilter && item.name !== topicFilter) return false;
      }
      return true;
    });
  }, [
    collectionName,
    difficultyFilter,
    items,
    questionTypeFilter,
    search,
    statusFilter,
    subjectFilter,
    topicFilter,
  ]);

  const pagination = useMemo(() => paginateSlice(filteredItems, page, PAGE_SIZE), [filteredItems, page]);

  const hasActiveFilters = Boolean(
    search.trim() ||
      subjectFilter ||
      topicFilter ||
      difficultyFilter ||
      questionTypeFilter ||
      statusFilter,
  );

  function clearAllFilters() {
    setSearch("");
    setSubjectFilter("");
    setTopicFilter("");
    setDifficultyFilter("");
    setQuestionTypeFilter("");
    setStatusFilter("");
    setPage(1);
  }

  async function confirmArchive() {
    if (!archiveTarget || isBusy) return;
    const target = archiveTarget;
    setBusyAction("archive");
    setStatusMessage(null);
    setErrorMsg(null);
    try {
      await adminArchiveContent({ collection: collectionName, id: target.id });
      setArchiveTarget(null);
      setStatusMessage(`Archived ${target.id}. Historical references remain intact.`);
      await loadLibrary();
    } catch (cause) {
      setArchiveTarget(null);
      setErrorMsg(formatErrorMessage(cause, "Could not archive this record."));
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget || isBusy) return;
    const target = restoreTarget;
    setBusyAction("restore");
    setStatusMessage(null);
    setErrorMsg(null);
    try {
      const payload = buildRestorePayload(collectionName, target);
      await adminUpsertContent({ collection: collectionName, id: target.id, value: payload });
      setRestoreTarget(null);
      setStatusMessage(`Restored ${target.id} to ${String(payload.status)} status.`);
      await loadLibrary();
    } catch (cause) {
      setRestoreTarget(null);
      setErrorMsg(formatErrorMessage(cause, "Could not restore this archived record."));
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || isBusy) return;
    const target = deleteTarget;
    setBusyAction("delete");
    setStatusMessage(null);
    setErrorMsg(null);
    setDeleteError(null);
    try {
      await adminDeleteContent({
        collection: collectionName,
        id: target.id,
        reason: deleteReason.trim(),
      });
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setDeleteError(null);
      setStatusMessage(`Permanently deleted ${target.id}.`);
      await loadLibrary();
    } catch (cause) {
      const message = formatErrorMessage(cause, "Could not permanently delete this record.");
      setDeleteError(message);
      setErrorMsg(message);
    } finally {
      setBusyAction(null);
    }
  }

  const readinessReadyCells = readiness ? readiness.cells.filter((cell) => cell.ready).length : 0;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Content Library"
        description="Browse, filter, preview, and manage versioned curriculum records. Approved problem scoring material is copied into new learner sessions."
        actions={
          <Link
            to={`/admin/content/${collectionName}/new`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span>Add New Content</span>
          </Link>
        }
      />

      {/* Primary category navigation + secondary Policies & Categories switcher */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <AdminTabs
            items={primaryTabs}
            activeId={activePrimaryTabId}
            ariaLabel="Primary content categories"
          />

          <div
            role="group"
            aria-label="Policies & Categories"
            className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0 dark:border-slate-800"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Policies &amp; Categories:
            </span>
            <Link
              to="/admin/content/misconception_categories"
              aria-current={collectionName === "misconception_categories" ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                collectionName === "misconception_categories"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Misconception Categories
            </Link>
            <Link
              to="/admin/content/difficulty_policies"
              aria-current={collectionName === "difficulty_policies" ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                collectionName === "difficulty_policies"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              Difficulty Policies
            </Link>
          </div>
        </div>

        {(collectionName === "subjects" || collectionName === "topics") && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Curriculum collection view">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">View:</span>
              <Link
                to="/admin/content/topics"
                aria-current={collectionName === "topics" ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-xl px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  collectionName === "topics"
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-500/20 dark:text-indigo-200"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Topics
              </Link>
              <Link
                to="/admin/content/subjects"
                aria-current={collectionName === "subjects" ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-xl px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  collectionName === "subjects"
                    ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-500/20 dark:text-indigo-200"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Subjects
              </Link>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Core validated subjects and topics remain locked; custom subjects, custom topics, and archived learning content can be managed here.
            </p>
          </div>
        )}
      </div>

      {/* Collapsible Catalog Readiness bar */}
      {readiness && (
        <section
          aria-label="Prepared-practice availability"
          className={`rounded-2xl border p-4 transition ${
            readiness.ready
              ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/60 dark:bg-emerald-950/40"
              : "border-amber-200 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/40"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
                <CheckCircle2
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 ${
                    readiness.ready
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                />
                <span>Prepared-practice availability</span>
              </div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {readiness.approvedProblemCount} questions with recorded approval and matching scoring material ·{" "}
                {readinessReadyCells} / {readiness.cells.length} topic/difficulty combinations available
              </p>
            </div>

            {readiness.issues.length > 0 && (
              <button
                type="button"
                aria-expanded={readinessExpanded}
                onClick={() => setReadinessExpanded((prev) => !prev)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
              >
                <span>{readinessExpanded ? "Hide coverage gaps" : `View coverage gaps (${readiness.issues.length})`}</span>
                {readinessExpanded ? (
                  <ChevronUp aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            )}
          </div>

          {readinessExpanded && readiness.issues.length > 0 && (
            <ul className="mt-3 grid gap-1.5 border-t border-slate-200/80 pt-3 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800 dark:text-slate-300">
              {readiness.issues.map((issue) => (
                <li key={issue} className="rounded-lg bg-white/70 px-2.5 py-1.5 dark:bg-slate-900/60">
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Validated Curriculum Hierarchy Reference when viewing Subjects & Topics */}
      {(collectionName === "subjects" || collectionName === "topics") && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <summary className="cursor-pointer font-bold text-slate-950 dark:text-white">
            Validated Curriculum Reference ({VALIDATED_SUBJECTS.length} subjects · {VALIDATED_TOPICS.length} topics)
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {VALIDATED_SUBJECTS.map((subject) => (
              <div
                key={subject.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40"
              >
                <h3 className="font-bold text-slate-900 dark:text-slate-100">{subject.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">ID: {subject.id}</p>
                <div className="mt-3 space-y-2">
                  {VALIDATED_TOPICS.filter((topic) => topic.subjectId === subject.id).map((topic) => (
                    <details key={topic.id} className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {topic.name} <span className="ml-1 text-xs font-normal text-slate-500">({topic.subtopics.length} subtopics)</span>
                      </summary>
                      <p className="mt-1 text-xs text-slate-500">{topic.id}</p>
                      <ul className="mt-2 ml-4 list-disc space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {topic.subtopics.map((subtopic) => (
                          <li key={subtopic.id}>
                            {subtopic.name}
                            {subtopic.children && (
                              <ul className="ml-4 list-disc">
                                {subtopic.children.map((child) => (
                                  <li key={child.id}>{child.name}</li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {errorMsg && (
        <Alert
          tone="error"
          onDismiss={() => setErrorMsg(null)}
          action={
            <button
              type="button"
              onClick={() => void loadLibrary()}
              className="min-h-11 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Retry
            </button>
          }
        >
          {errorMsg}
        </Alert>
      )}

      {statusMessage && (
        <Alert tone="success" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      )}

      {/* Search & Filters Bar */}
      <section
        aria-label="Filter content records"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <AdminSearchInput
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            placeholder={`Search ${displayContentCollectionLabel(collectionName).toLowerCase()} by title, ID, or text...`}
            ariaLabel="Search content records"
            className="flex-1"
          />

          <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>
              Showing {filteredItems.length} of {items.length} {displayContentCollectionLabel(collectionName).toLowerCase()}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FilterX aria-hidden="true" className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(collectionName === "problems" ||
            collectionName === "formula_theorem_references" ||
            collectionName === "topics") && (
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Subject filter
              <select
                value={subjectFilter}
                onChange={(event) => {
                  setSubjectFilter(event.target.value);
                  setTopicFilter("");
                  setPage(1);
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(collectionName === "problems" ||
            collectionName === "formula_theorem_references" ||
            collectionName === "topics") && (
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Topic filter
              <select
                value={topicFilter}
                onChange={(event) => {
                  setTopicFilter(event.target.value);
                  setPage(1);
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All topics</option>
                {topicOptions.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </label>
          )}

          {collectionName === "problems" && (
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Difficulty filter
              <select
                value={difficultyFilter}
                onChange={(event) => {
                  setDifficultyFilter(event.target.value);
                  setPage(1);
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All difficulties</option>
                {DIFFICULTIES.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
            </label>
          )}

          {collectionName === "problems" && (
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Question Type filter
              <select
                value={questionTypeFilter}
                onChange={(event) => {
                  setQuestionTypeFilter(event.target.value);
                  setPage(1);
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All question types</option>
                {QUESTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {formatQuestionTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Status filter
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All statuses</option>
              {CONTENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Content Records Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        {loading && items.length === 0 ? (
          <div className="p-5">
            <ListRowSkeleton rows={5} label={`Loading ${displayContentCollectionLabel(collectionName)}`} />
          </div>
        ) : pagination.items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <BookOpen aria-hidden="true" className="h-6 w-6" />
            </span>
            <p className="mt-4 font-bold text-slate-800 dark:text-slate-200">
              {hasActiveFilters
                ? "No matching records found"
                : `No ${displayContentCollectionLabel(collectionName).toLowerCase()} records yet`}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {hasActiveFilters
                ? "Adjust your search query or clear active filters to see more records."
                : "Create your first record to populate this collection."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Reset filters
                </button>
              )}
              <Link
                to={`/admin/content/${collectionName}/new`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add New Content
              </Link>
            </div>
          </div>
        ) : (
          <div
            role="region"
            aria-label={`${displayContentCollectionLabel(collectionName)} records table`}
            tabIndex={0}
            className="table-scroll max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-indigo-500"
          >
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                {collectionName === "problems" ? (
                  <tr>
                    <th className="px-4 py-3.5">Question Title</th>
                    <th className="px-4 py-3.5">Subject</th>
                    <th className="px-4 py-3.5">Topic</th>
                    <th className="px-4 py-3.5">Difficulty</th>
                    <th className="px-4 py-3.5">Question Type</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                ) : collectionName === "formula_theorem_references" ? (
                  <tr>
                    <th className="px-4 py-3.5">Statement / Reference</th>
                    <th className="px-4 py-3.5">Kind</th>
                    <th className="px-4 py-3.5">Domain</th>
                    <th className="px-4 py-3.5">Supported Topics</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                ) : collectionName === "socratic_prompt_bank" ? (
                  <tr>
                    <th className="px-4 py-3.5">Socratic Prompt</th>
                    <th className="px-4 py-3.5">Problem ID</th>
                    <th className="px-4 py-3.5">Reasoning Phase</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                ) : collectionName === "subjects" ? (
                  <tr>
                    <th className="px-4 py-3.5">Subject Name</th>
                    <th className="px-4 py-3.5">Description</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                ) : collectionName === "topics" ? (
                  <tr>
                    <th className="px-4 py-3.5">Topic Name</th>
                    <th className="px-4 py-3.5">Subject</th>
                    <th className="px-4 py-3.5">Subtopics</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                ) : collectionName === "misconception_categories" ? (
                  <tr>
                    <th className="px-4 py-3.5">Category Name</th>
                    <th className="px-4 py-3.5">Priority</th>
                    <th className="px-4 py-3.5">Phases</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-3.5">Policy Scope</th>
                    <th className="px-4 py-3.5">Min Sessions</th>
                    <th className="px-4 py-3.5">Thresholds (Inc / Dec)</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pagination.items.map((item) => {
                  const title = recordDisplayTitle(collectionName, item);
                  const isArchived = item.status === "archived";
                  const canDelete = item.status === "draft" || item.status === "rejected";
                  const fixedCurriculum = isFixedCurriculumRecord(collectionName, item.id);

                  return (
                    <tr
                      key={item.id}
                      className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      {collectionName === "problems" ? (
                        <>
                          <td className="max-w-xs px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {item.id} · v{item.version ?? 0}
                              {item.variant ? ` · Variant ${item.variant}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.subject ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.topic ?? "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {item.difficulty ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {formatQuestionTypeLabel(item.questionType)}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      ) : collectionName === "formula_theorem_references" ? (
                        <>
                          <td className="max-w-xs px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {item.id} · v{item.version ?? 0}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 capitalize text-slate-700 dark:text-slate-300">
                            {item.kind ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.domain ?? "—"}
                          </td>
                          <td className="max-w-xs px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                            {Array.isArray(item.supportedTopics) && item.supportedTopics.length > 0
                              ? item.supportedTopics.join(", ")
                              : "All"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      ) : collectionName === "socratic_prompt_bank" ? (
                        <>
                          <td className="max-w-sm px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {item.id} · v{item.version ?? 0}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                            {item.problemId ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.phase ? displayPhaseLabel(item.phase) : "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      ) : collectionName === "subjects" ? (
                        <>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.id}</p>
                          </td>
                          <td className="max-w-md px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.description ?? "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      ) : collectionName === "topics" ? (
                        <>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.id}</p>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.subject ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {Array.isArray(item.subtopics) ? `${item.subtopics.length} subtopics` : "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      ) : collectionName === "misconception_categories" ? (
                        <>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.id}</p>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.priority ?? 0}
                          </td>
                          <td className="max-w-xs px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                            {Array.isArray(item.phases) && item.phases.length > 0
                              ? item.phases.map((p) => displayPhaseLabel(p)).join(", ")
                              : "All phases"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.topicId || item.subjectId || "Global Default Policy"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.id}</p>
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.minimumCompletedSessions ?? "—"}
                          </td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300">
                            {item.increaseScoreThreshold ?? "—"} / {item.decreaseScoreThreshold ?? "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                            >
                              {formatStatusLabel(item.status)}
                            </span>
                          </td>
                        </>
                      )}

                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Tooltip label={`Preview ${item.id}`}>
                            <button
                              type="button"
                              aria-label={`Preview ${item.id}`}
                              onClick={() => setPreviewTarget(item)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                              <Eye aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </Tooltip>

                          <Tooltip label={`Edit ${item.id}`}>
                            <Link
                              to={`/admin/content/${collectionName}/edit/${item.id}`}
                              aria-label={`Edit ${item.id}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
                            >
                              <Pencil aria-hidden="true" className="h-4 w-4" />
                            </Link>
                          </Tooltip>

                          {!fixedCurriculum && (
                            isArchived ? (
                              <Tooltip label={`Restore ${item.id}`}>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  aria-label={`Restore ${item.id}`}
                                  onClick={() => setRestoreTarget(item)}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                                >
                                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                                </button>
                              </Tooltip>
                            ) : (
                              <Tooltip label={`Archive ${item.id}`}>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  aria-label={`Archive ${item.id}`}
                                  onClick={() => setArchiveTarget(item)}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Archive aria-hidden="true" className="h-4 w-4" />
                                </button>
                              </Tooltip>
                            )
                          )}

                          {!fixedCurriculum && canDelete && (
                            <Tooltip label={`Permanently delete ${item.id}`}>
                              <button
                                type="button"
                                disabled={isBusy}
                                aria-label={`Permanently delete ${item.id}`}
                                onClick={() => {
                                  setDeleteTarget(item);
                                  setDeleteConfirmation("");
                                  setDeleteError(null);
                                }}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminPagination
        page={pagination.page}
        pageSize={PAGE_SIZE}
        totalItems={filteredItems.length}
        onPageChange={setPage}
        itemLabel={displayContentCollectionLabel(collectionName).toLowerCase()}
      />

      {/* Preview Modal */}
      <DialogPrimitive.Root
        open={Boolean(previewTarget)}
        onOpenChange={(open) => {
          if (!open) setPreviewTarget(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
          <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
            {previewTarget && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogPrimitive.Title className="text-lg font-bold">
                      {recordDisplayTitle(collectionName, previewTarget)}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {previewTarget.id} · v{previewTarget.version ?? 0} · {formatStatusLabel(previewTarget.status)}
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Close preview"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                <div className="mt-5 space-y-4 text-sm">
                  {collectionName === "problems" ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {previewTarget.subject && (
                          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                            {previewTarget.subject}
                          </span>
                        )}
                        {previewTarget.topic && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {previewTarget.topic}
                          </span>
                        )}
                        {previewTarget.difficulty && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {previewTarget.difficulty}
                          </span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {formatQuestionTypeLabel(previewTarget.questionType)}
                        </span>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Learner-visible problem
                        </p>
                        <div className="text-slate-900 dark:text-slate-100">
                          {renderFormattedMath(previewTarget.problemText ?? "")}
                        </div>
                      </div>

                      {previewTarget.questionType === "multiple_choice" &&
                        Array.isArray(previewTarget.choices) &&
                        previewTarget.choices.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Answer choices
                            </p>
                            <ul className="space-y-1.5">
                              {previewTarget.choices.map((choice, idx) => (
                                <li
                                  key={`${idx}-${choice}`}
                                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/40"
                                >
                                  <span className="mr-2 font-bold text-indigo-600 dark:text-indigo-400">
                                    {String.fromCharCode(65 + idx)}.
                                  </span>
                                  {renderFormattedMath(choice)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                      {previewTarget.statement && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Statement</p>
                          <div className="mt-1">{renderFormattedMath(previewTarget.statement)}</div>
                        </div>
                      )}
                      {previewTarget.prompt && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Prompt</p>
                          <div className="mt-1">{renderFormattedMath(previewTarget.prompt)}</div>
                        </div>
                      )}
                      {previewTarget.description && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</p>
                          <p className="mt-1">{previewTarget.description}</p>
                        </div>
                      )}
                      {previewTarget.correctivePrompt && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Corrective prompt</p>
                          <p className="mt-1">{previewTarget.correctivePrompt}</p>
                        </div>
                      )}
                      {Array.isArray(previewTarget.conditions) && previewTarget.conditions.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Conditions</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {previewTarget.conditions.map((cond, idx) => (
                              <li key={idx}>{cond}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Close
                    </button>
                  </DialogPrimitive.Close>
                  <Link
                    to={`/admin/content/${collectionName}/edit/${previewTarget.id}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                    Edit record
                  </Link>
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Archive ConfirmDialog */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Archive this record?"
        description={
          archiveTarget
            ? `Archiving ${archiveTarget.id} keeps historical learning references intact while removing it from active selection.`
            : ""
        }
        confirmLabel="Archive record"
        cancelLabel="Cancel"
        isLoading={busyAction === "archive"}
        onConfirm={() => void confirmArchive()}
      />

      {/* Restore ConfirmDialog */}
      <ConfirmDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title="Restore this archived record?"
        description={
          restoreTarget
            ? `Restoring ${restoreTarget.id} sets its lifecycle status back to draft for editing and review.`
            : ""
        }
        confirmLabel="Restore record"
        cancelLabel="Cancel"
        isLoading={busyAction === "restore"}
        onConfirm={() => void confirmRestore()}
      />

      {/* Permanent Delete ConfirmDialog with typed ID + 8-char audit reason */}
      <DialogPrimitive.Root
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (busyAction === "delete" && !open) return;
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmation("");
            setDeleteError(null);
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
          <DialogPrimitive.Content
            role="alertdialog"
            className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-red-200 bg-white p-6 text-slate-950 shadow-xl dark:border-red-900 dark:bg-slate-900 dark:text-slate-100"
          >
            {deleteTarget && (
              <>
                <DialogPrimitive.Title className="text-lg font-bold text-red-950 dark:text-red-200">
                  Permanently delete {deleteTarget.id}?
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Deletion succeeds only when no managed record or historical session references this draft or rejected record.
                </DialogPrimitive.Description>

                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Type {deleteTarget.id} to confirm
                    <input
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      placeholder={`Type ${deleteTarget.id}`}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Audit reason (minimum 8 characters · {deleteReason.trim().length}/8)
                    <input
                      value={deleteReason}
                      minLength={8}
                      onChange={(event) => setDeleteReason(event.target.value)}
                      placeholder="Required audit reason"
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                </div>

                {deleteError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                  >
                    {deleteError}
                  </div>
                )}

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      disabled={busyAction === "delete"}
                      className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </DialogPrimitive.Close>
                  <button
                    type="button"
                    disabled={
                      busyAction === "delete" ||
                      deleteConfirmation !== deleteTarget.id ||
                      deleteReason.trim().length < 8
                    }
                    onClick={() => void confirmDelete()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                  >
                    {busyAction === "delete" && (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    )}
                    <span>{busyAction === "delete" ? "Deleting..." : "Permanently delete"}</span>
                  </button>
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

/**
 * Routed administrator Content Library page wrapped in {@link AdminShell} (`active="content"`).
 *
 * @returns The full administrator Content Library page.
 */
export function SecureAdminContent() {
  const params = useParams();
  const collectionName = resolveCollectionName(params.collection);

  return (
    <AdminShell active="content">
      <AdminContentLibrary collectionName={collectionName} />
    </AdminShell>
  );
}
