import { VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { Tooltip } from "./ui/tooltip";
import { AnswerSpecificationEditor } from "./AnswerSpecificationEditor";
import { Alert } from "./ui/alert";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { ListRowSkeleton } from "./ui/skeleton";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Archive, CheckCircle2, FileCheck2, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import type { AdminImportProblemDraft, CatalogReadinessResponse } from "@mindguide/contracts";
import { REASONING_PHASES } from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  adminArchiveContent,
  adminDeleteContent,
  adminBulkImportProblems,
  adminCatalogReadiness,
  adminRecordProblemValidation,
  adminSubmitProblemValidation,
  adminUpsertContent,
} from "@/lib/secure-api";

// Shared with the route shell so the navigation and typed editor use one allowlist.
// eslint-disable-next-line react-refresh/only-export-components
export const CONTENT_COLLECTIONS = [
  "subjects",
  "topics",
  "problems",
  "formula_theorem_references",
  "socratic_prompt_bank",
  "misconception_categories",
  "difficulty_policies",
] as const;

export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];
type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "csv"
  | "lines"
  | "status"
  | "subject"
  | "difficulty"
  | "kind"
  | "phase";
type BusyAction =
  | "save"
  | "validate_import"
  | "import"
  | "submit_validation"
  | "record_decision"
  | "archive"
  | "delete"
  | null;
type PendingDiscardAction =
  | { type: "clear" }
  | { type: "select"; item: Record<string, any> }
  | null;

interface FieldDefinition {
  path: string;
  label: string;
  type: FieldType;
  required?: boolean;
  datalistId?: string;
}

const COMMON_STATUS: FieldDefinition = { path: "status", label: "Lifecycle status", type: "status", required: true };
const FIELDS: Record<ContentCollection, FieldDefinition[]> = {
  subjects: [
    { path: "name", label: "Subject name", type: "subject", required: true },
    { path: "description", label: "Subject description", type: "textarea", required: true },
    COMMON_STATUS,
  ],
  topics: [
    { path: "subjectId", label: "Subject ID", type: "text", required: true, datalistId: "mg-subject-ids" },
    { path: "subject", label: "Subject", type: "subject", required: true },
    { path: "name", label: "Topic name", type: "text", required: true, datalistId: "mg-topic-names" },
    COMMON_STATUS,
  ],
  problems: [
    { path: "subjectId", label: "Subject ID", type: "text", required: true, datalistId: "mg-subject-ids" },
    { path: "topicId", label: "Topic ID", type: "text", required: true, datalistId: "mg-topic-ids" },
    { path: "subject", label: "Subject", type: "subject", required: true },
    { path: "topic", label: "Topic name", type: "text", required: true, datalistId: "mg-topic-names" },
    { path: "difficulty", label: "Difficulty", type: "difficulty", required: true },
    { path: "variant", label: "Variant (1–3)", type: "number", required: true },
    { path: "problemText", label: "Learner-visible problem", type: "textarea", required: true },
    { path: "title", label: "Question title", type: "text" },
    { path: "questionType", label: "Question type (constructed_response or multiple_choice)", type: "text" },
    { path: "choices", label: "Answer choices (when supplied)", type: "lines" },
    { path: "supportedResponseFormats", label: "Response formats", type: "csv", required: true },
    { path: "formulaTheoremReferenceIds", label: "Formula/theorem reference IDs", type: "csv", required: true },
    { path: "privateSolution.expectedConcepts", label: "Expected concepts", type: "csv", required: true },
    { path: "privateSolution.requiredFormula", label: "Required formula", type: "text" },
    { path: "privateSolution.requiredTheorem", label: "Required theorem", type: "text" },
    { path: "privateSolution.workedSteps", label: "Protected worked steps", type: "lines", required: true },
    { path: "privateSolution.finalAnswer", label: "Protected final answer", type: "textarea", required: true },
    { path: "privateSolution.interpretation", label: "Protected interpretation", type: "textarea", required: true },
    COMMON_STATUS,
  ],
  formula_theorem_references: [
    { path: "kind", label: "Reference kind", type: "kind", required: true },
    { path: "statement", label: "Statement", type: "textarea", required: true },
    { path: "variables", label: "Variables", type: "csv" },
    { path: "conditions", label: "Application conditions", type: "lines", required: true },
    { path: "domain", label: "Domain", type: "subject", required: true },
    { path: "supportedTopics", label: "Supported topic names", type: "csv" },
    { path: "equivalentNotation", label: "Equivalent notation", type: "lines" },
    COMMON_STATUS,
  ],
  socratic_prompt_bank: [
    { path: "problemId", label: "Problem ID", type: "text", required: true },
    { path: "phase", label: "Reasoning phase", type: "phase", required: true },
    { path: "prompt", label: "Socratic prompt", type: "textarea", required: true },
    COMMON_STATUS,
  ],
  misconception_categories: [
    { path: "name", label: "Category name", type: "text", required: true },
    { path: "phases", label: "Applicable phase IDs", type: "csv" },
    { path: "correctivePrompt", label: "Corrective prompt", type: "textarea", required: true },
    { path: "priority", label: "Priority", type: "number", required: true },
    COMMON_STATUS,
  ],
  difficulty_policies: [
    { path: "subjectId", label: "Subject ID (blank for global)", type: "text", datalistId: "mg-subject-ids" },
    { path: "topicId", label: "Topic ID (blank for inherited)", type: "text", datalistId: "mg-topic-ids" },
    { path: "minimumCompletedSessions", label: "Minimum completed sessions", type: "number", required: true },
    { path: "increaseScoreThreshold", label: "Increase score threshold", type: "number", required: true },
    { path: "decreaseScoreThreshold", label: "Decrease score threshold", type: "number", required: true },
    { path: "maxHintsForIncrease", label: "Maximum hints for increase", type: "number", required: true },
    { path: "arithmeticErrorAloneLowersDifficulty", label: "Arithmetic error alone lowers difficulty", type: "boolean" },
    COMMON_STATUS,
  ],
};

const DEFAULTS: Record<ContentCollection, Record<string, unknown>> = {
  subjects: { name: "Quantitative Methods", description: "", status: "draft" },
  topics: { subjectId: "quantitative-methods", subject: "Quantitative Methods", name: "", status: "draft" },
  problems: {
    subjectId: "quantitative-methods",
    topicId: "",
    subject: "Quantitative Methods",
    topic: "",
    difficulty: "Basic",
    variant: 1,
    problemText: "",
    supportedResponseFormats: ["text", "latex"],
    formulaTheoremReferenceIds: [],
    privateSolution: {
      expectedConcepts: [],
      requiredFormula: "",
      requiredTheorem: "",
      workedSteps: [],
      finalAnswer: "",
      interpretation: "",
    },
    status: "draft",
  },
  formula_theorem_references: {
    kind: "formula", statement: "", variables: [], conditions: [], domain: "Quantitative Methods",
    supportedTopics: [], equivalentNotation: [], status: "draft",
  },
  socratic_prompt_bank: {
    problemId: "", phase: REASONING_PHASES[0], prompt: "", status: "draft",
  },
  misconception_categories: {
    name: "", phases: [], correctivePrompt: "", priority: 0, status: "draft",
  },
  difficulty_policies: {
    subjectId: null, topicId: null, minimumCompletedSessions: 2, increaseScoreThreshold: 80,
    decreaseScoreThreshold: 60, maxHintsForIncrease: 1,
    arithmeticErrorAloneLowersDifficulty: false, status: "draft",
  },
};

/**
 * Typed administrator editor and catalog manager for curriculum, problems, formulas, prompts,
 * misconceptions, and difficulty policies.
 *
 * @param props.collectionName - Target Firestore collection within {@link CONTENT_COLLECTIONS}.
 */
export function ManagedContentEditor({ collectionName }: { collectionName: ContentCollection }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ subject: "", topic: "", difficulty: "", questionType: "" });
  const [quality, setQuality] = useState<Record<string, string[]>>({});
  const [recordId, setRecordId] = useState("");
  const [value, setValue] = useState<Record<string, any>>({ ...DEFAULTS[collectionName] });
  const [isDirty, setIsDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [archiveTarget, setArchiveTarget] = useState<Record<string, any> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, any> | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("Remove unused draft learning content");
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscardAction>(null);
  const [readiness, setReadiness] = useState<CatalogReadinessResponse | null>(null);
  const [importProblems, setImportProblems] = useState<AdminImportProblemDraft[]>([]);
  const [validation, setValidation] = useState({
    syllabusReference: "",
    contentMatrixItem: "",
    validatorName: "",
    validatorRole: "",
    validationDate: new Date().toISOString().slice(0, 10),
    evidenceReference: "",
    evidenceHash: "",
    decision: "approved" as "approved" | "rejected",
  });

  const isBusy = busyAction !== null;

  const showError = useCallback((cause: unknown) => {
    setStatusMessage(null);
    setErrorMessage(
      cause instanceof Error ? cause.message : "Managed content operation failed.",
    );
  }, []);

  const load = useCallback(async () => {
    if (!db) return;
    setLoadingItems(true);
    setErrorMessage(null);
    try {
      const [snapshot, nextReadiness] = await Promise.all([
        getDocs(collection(db, collectionName)),
        adminCatalogReadiness(),
      ]);
      setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      if (collectionName === "problems") {
        const checks = await Promise.all(
          snapshot.docs.map(async (item) => {
            const solution = await getDoc(doc(db!, "problems", item.id, "private", "solution"));
            const solutionData = solution.data?.() ?? {};
            const itemData = item.data();
            const issues = [];
            if (!solutionData.finalAnswer) issues.push("missing answer");
            if (!solutionData.solutionSteps?.length || !solutionData.interpretation) {
              issues.push("missing explanation");
            }
            if (
              !itemData.subject ||
              !itemData.topic ||
              !itemData.difficulty ||
              !itemData.questionType
            ) {
              issues.push("missing classification");
            }
            return [item.id, issues] as const;
          }),
        );
        setQuality(Object.fromEntries(checks));
      }
      setReadiness(nextReadiness);
    } finally {
      setLoadingItems(false);
    }
  }, [collectionName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecordId("");
      setValue(structuredClone(DEFAULTS[collectionName]));
      setIsDirty(false);
      setStatusMessage(null);
      setErrorMessage(null);
      void load().catch(showError);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collectionName, load, showError]);

  const current = useMemo(() => items.find((item) => item.id === recordId), [items, recordId]);
  const visibleItems = items.filter(
    (item) =>
      [item.id, item.title, item.name, item.problemText].some((text) =>
        String(text ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) &&
      (collectionName !== "problems" ||
        Object.entries(filters).every(([key, selected]) => !selected || item[key] === selected)),
  );

  function resetEditorToNew() {
    setRecordId("");
    setValue(structuredClone(DEFAULTS[collectionName]));
    setIsDirty(false);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function requestClearForm() {
    if (isDirty) {
      setPendingDiscard({ type: "clear" });
      return;
    }
    resetEditorToNew();
  }

  function requestSelectItem(item: Record<string, any>) {
    if (isDirty && item.id !== recordId) {
      setPendingDiscard({ type: "select", item });
      return;
    }
    void selectItem(item).catch(showError);
  }

  async function save() {
    if (isBusy || !recordId) return;
    setBusyAction("save");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const normalized = normalizePayload(collectionName, value);
      await adminUpsertContent({ collection: collectionName, id: recordId, value: normalized });
      setIsDirty(false);
      setStatusMessage("Typed content saved, versioned, and audited.");
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusyAction(null);
    }
  }

  async function selectItem(item: Record<string, any>) {
    const loaded = sanitizeLoadedValue(collectionName, item);
    if (collectionName === "problems" && db) {
      const privateSnapshot = await getDoc(doc(db, "problems", item.id, "private", "solution"));
      if (privateSnapshot.exists()) {
        const protectedValue = privateSnapshot.data();
        const protectedStepsKey = ["solution", "Steps"].join("");
        loaded.privateSolution = {
          ...protectedValue,
          workedSteps: protectedValue[protectedStepsKey],
        };
        delete loaded.privateSolution[protectedStepsKey];
      }
    }
    setRecordId(item.id);
    setValue(loaded);
    setIsDirty(false);
    setErrorMessage(null);
  }

  async function submitValidation() {
    if (isBusy) return;
    setBusyAction("submit_validation");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await adminSubmitProblemValidation(recordId);
      setStatusMessage("Problem submitted for external faculty validation.");
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusyAction(null);
    }
  }

  async function recordDecision() {
    if (isBusy) return;
    setBusyAction("record_decision");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await adminRecordProblemValidation({
        problemId: recordId,
        ...validation,
        validationDate: new Date(`${validation.validationDate}T00:00:00Z`).getTime(),
      });
      setStatusMessage(`Faculty-validation decision recorded: ${validation.decision}.`);
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusyAction(null);
    }
  }

  async function runImport(dryRun: boolean) {
    if (isBusy) return;
    setBusyAction(dryRun ? "validate_import" : "import");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await adminBulkImportProblems({ problems: importProblems, dryRun });
      setStatusMessage(
        dryRun
          ? `${String(result.checked)} problem drafts passed validation.`
          : `${String(result.imported)} problem drafts imported.`,
      );
      if (!dryRun) setImportProblems([]);
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget || isBusy) return;
    const target = archiveTarget;
    setBusyAction("archive");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await adminArchiveContent({ collection: collectionName, id: target.id });
      setArchiveTarget(null);
      setStatusMessage(`Archived ${target.id}. Historical references remain intact.`);
      await load();
    } catch (cause) {
      setArchiveTarget(null);
      showError(cause);
    } finally {
      setBusyAction(null);
    }
  }

  async function permanentlyDelete() {
    if (!deleteTarget || isBusy) return;
    const target = deleteTarget;
    setBusyAction("delete");
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await adminDeleteContent({ collection: collectionName, id: target.id, reason: deleteReason });
      setStatusMessage(`Permanently deleted ${target.id}.`);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      if (recordId === target.id) resetEditorToNew();
      await load();
    } catch (cause) {
      showError(cause);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div>
      <datalist id="mg-subject-ids">
        {VALIDATED_SUBJECTS.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </datalist>
      <datalist id="mg-topic-ids">
        {VALIDATED_TOPICS.map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.name}
          </option>
        ))}
      </datalist>
      <datalist id="mg-topic-names">
        {VALIDATED_TOPICS.map((topic) => (
          <option key={topic.id} value={topic.name} />
        ))}
      </datalist>

      {(collectionName === "subjects" || collectionName === "topics") && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-bold text-slate-950 dark:text-white">Validated curriculum</h2>
          {VALIDATED_SUBJECTS.map((subject) => (
            <details key={subject.id} open>
              <summary className="mt-3 cursor-pointer font-bold text-slate-900 dark:text-slate-100">
                {subject.name}
              </summary>
              {VALIDATED_TOPICS.filter((topic) => topic.subjectId === subject.id).map((topic) => (
                <details key={topic.id} className="ml-4 mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                    {topic.name}
                  </summary>
                  <p className="text-xs text-slate-500">{topic.id}</p>
                  <ul className="ml-5 list-disc text-sm text-slate-600 dark:text-slate-400">
                    {topic.subtopics.map((subtopic) => (
                      <li key={subtopic.id}>
                        {subtopic.name}
                        {subtopic.children && (
                          <ul className="ml-5 list-disc">
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
            </details>
          ))}
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Curriculum structure is fixed. Archived records below remain available for historical
            references. Learning content requires separate validation.
          </p>
        </section>
      )}

      {readiness && (
        <div
          className={`mt-5 rounded-2xl border p-4 ${
            readiness.ready
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950"
              : "border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            Prepared-practice availability
          </div>
          <p className="mt-1 text-sm dark:text-slate-300">
            {readiness.approvedProblemCount} questions with recorded approval and matching scoring
            material · {readiness.cells.filter((cell) => cell.ready).length} /{" "}
            {readiness.cells.length} topic/difficulty combinations available
          </p>
        </div>
      )}

      {errorMessage && (
        <Alert
          tone="error"
          className="mt-4"
          onDismiss={() => setErrorMessage(null)}
          action={
            <button
              type="button"
              onClick={() => void load().catch(showError)}
              className="min-h-11 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Retry
            </button>
          }
        >
          {errorMessage}
        </Alert>
      )}
      {statusMessage && (
        <Alert tone="success" className="mt-4" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      )}

      {deleteTarget && (
        <div
          role="region"
          aria-label={`Confirm deletion of ${deleteTarget.id}`}
          className="mt-4 space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950/30"
        >
          <h2 className="font-bold text-red-950 dark:text-red-200">
            Permanently delete {deleteTarget.id}
          </h2>
          <p className="text-sm text-red-800 dark:text-red-300">
            Deletion succeeds only when no managed record or historical session references this
            draft or rejected record.
          </p>
          <label className="block text-xs font-semibold text-red-900 dark:text-red-200">
            Type {deleteTarget.id} to confirm
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={`Type ${deleteTarget.id}`}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-red-300 bg-white p-3 text-sm text-slate-950 dark:border-red-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="block text-xs font-semibold text-red-900 dark:text-red-200">
            Audit reason (minimum 8 characters · {deleteReason.trim().length}/8)
            <input
              value={deleteReason}
              minLength={8}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Required audit reason"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-red-300 bg-white p-3 text-sm text-slate-950 dark:border-red-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmation("");
              }}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                isBusy ||
                deleteConfirmation !== deleteTarget.id ||
                deleteReason.trim().length < 8
              }
              onClick={() => void permanentlyDelete()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 py-2 font-bold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
            >
              {busyAction === "delete" && (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              )}
              <span>{busyAction === "delete" ? "Deleting..." : "Permanently delete"}</span>
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold dark:text-slate-100">Typed content editor</h2>
              {isDirty && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Unsaved changes in editor
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={requestClearForm}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              New / Clear form
            </button>
          </div>

          <label className="mt-4 block text-sm font-bold dark:text-slate-200">
            Stable record ID
            <input
              disabled={isBusy}
              value={recordId}
              onChange={(event) => {
                setRecordId(event.target.value);
                setIsDirty(true);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border p-3 font-normal dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FIELDS[collectionName].map((field) => (
              <ManagedField
                key={field.path}
                field={field}
                value={getPath(value, field.path)}
                approvedAllowed={collectionName !== "problems"}
                onChange={(next) => {
                  setValue((currentValue) => setPath(currentValue, field.path, next));
                  setIsDirty(true);
                }}
              />
            ))}
          </div>
          {collectionName === "problems" && (
            <AnswerSpecificationEditor
              value={value.privateSolution?.answerSpecification}
              onChange={(next) => {
                setValue((previous) =>
                  setPath(previous, "privateSolution.answerSpecification", next),
                );
                setIsDirty(true);
              }}
            />
          )}
          <button
            type="button"
            disabled={!recordId || isBusy}
            onClick={() => void save()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
          >
            {busyAction === "save" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="h-4 w-4" />
            )}
            <span>{busyAction === "save" ? "Saving..." : "Save version"}</span>
          </button>

          {collectionName === "problems" && (
            <div className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-600">
              <h3 className="font-bold dark:text-slate-100">Bulk draft import</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select a JSON array matching the typed problem-draft contract. Every topic and
                reference is checked against Firestore.
              </p>
              <input
                type="file"
                disabled={isBusy}
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file
                    .text()
                    .then((text) => {
                      const parsed = JSON.parse(text);
                      const records = Array.isArray(parsed) ? parsed : parsed.problems;
                      if (!Array.isArray(records)) {
                        throw new Error("Choose a JSON array of problem drafts.");
                      }
                      setImportProblems(records);
                    })
                    .catch(showError);
                }}
                className="mt-3 block w-full text-sm"
              />
              {importProblems.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void runImport(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    {busyAction === "validate_import" && (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    )}
                    <span>
                      {busyAction === "validate_import"
                        ? "Validating drafts..."
                        : `Validate ${importProblems.length} drafts`}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void runImport(false)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                  >
                    {busyAction === "import" && (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    )}
                    <span>{busyAction === "import" ? "Importing drafts..." : "Import drafts"}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {collectionName === "problems" &&
            current &&
            ["draft", "rejected"].includes(current.status) && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void submitValidation()}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-300 px-4 py-2 font-bold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300"
              >
                {busyAction === "submit_validation" ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck2 aria-hidden="true" className="h-4 w-4" />
                )}
                <span>
                  {busyAction === "submit_validation"
                    ? "Submitting..."
                    : "Submit for faculty validation"}
                </span>
              </button>
            )}
          {collectionName === "problems" && current?.status === "pending_validation" && (
            <div className="mt-6 rounded-xl border border-indigo-200 p-4 dark:border-indigo-700">
              <h3 className="font-bold dark:text-slate-100">Record external validation evidence</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(validation).map(([field, fieldValue]) =>
                  field === "decision" ? (
                    <label key={field} className="text-sm font-bold">
                      Decision
                      <select
                        disabled={isBusy}
                        value={fieldValue}
                        onChange={(event) =>
                          setValidation((currentValue) => ({
                            ...currentValue,
                            decision: event.target.value as "approved" | "rejected",
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded-lg border p-2 font-normal dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                  ) : (
                    <label key={field} className="text-sm font-bold">
                      {humanize(field)}
                      <input
                        disabled={isBusy}
                        required
                        type={field === "validationDate" ? "date" : "text"}
                        value={fieldValue}
                        onChange={(event) =>
                          setValidation((currentValue) => ({
                            ...currentValue,
                            [field]: event.target.value,
                          }))
                        }
                        className="mt-1 min-h-11 w-full rounded-lg border p-2 font-normal dark:border-slate-700 dark:bg-slate-800"
                      />
                    </label>
                  ),
                )}
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void recordDecision()}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
              >
                {busyAction === "record_decision" && (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                )}
                <span>
                  {busyAction === "record_decision"
                    ? "Recording decision..."
                    : "Record immutable decision"}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="font-bold dark:text-slate-100">Existing records ({items.length})</h2>
          <label className="mt-3 block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Search records
            <input
              className="mt-1 min-h-11 w-full rounded-lg border bg-transparent p-2 font-normal dark:border-slate-700"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {collectionName === "problems" && (
            <>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {items.filter((item) => item.importSource).length} imported questions ·{" "}
                {Object.values(quality).filter((issues) => issues.length).length} records need
                content review
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(["subject", "topic", "difficulty", "questionType"] as const).map((key) => (
                  <label key={key} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {humanize(key)} filter
                    <select
                      className="mt-1 min-h-11 w-full rounded-lg border bg-transparent p-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900"
                      value={filters[key]}
                      onChange={(event) =>
                        setFilters((previous) => ({ ...previous, [key]: event.target.value }))
                      }
                    >
                      <option value="">All</option>
                      {[...new Set(items.map((item) => item[key]).filter(Boolean))]
                        .sort()
                        .map((option) => (
                          <option key={option} value={option}>
                            {humanize(option)}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Showing {visibleItems.length} of {items.length}
              </p>
            </>
          )}
          <div className="mt-3 max-h-[48rem] divide-y overflow-auto dark:divide-slate-700">
            {loadingItems && items.length === 0 ? (
              <ListRowSkeleton rows={4} label="Loading content records" />
            ) : (
              visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col items-start justify-between gap-3 py-3 sm:flex-row sm:items-center"
                >
                  <button
                    type="button"
                    className="min-h-11 min-w-0 max-w-full rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:flex-1"
                    onClick={() => requestSelectItem(item)}
                  >
                    <p className="truncate font-semibold dark:text-slate-100">
                      {item.name ?? item.problemText ?? item.id}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.id} · v{item.version ?? 0} · {item.status}
                    </p>
                    {collectionName === "problems" && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.subject} · {item.topic} · {item.difficulty} ·{" "}
                        {item.questionType ?? "Unclassified"}
                        {quality[item.id]?.length ? ` · Review: ${quality[item.id].join(", ")}` : ""}
                      </p>
                    )}
                  </button>
                  <div className="flex gap-1.5">
                    <Tooltip label={`Archive ${item.id}`}>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setArchiveTarget(item)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        aria-label={`Archive ${item.id}`}
                      >
                        <Archive aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    {["draft", "rejected"].includes(item.status) && (
                      <Tooltip label={`Permanently delete ${item.id}`}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setDeleteTarget(item);
                            setDeleteConfirmation("");
                          }}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 p-2 text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                          aria-label={`Permanently delete ${item.id}`}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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

      <ConfirmDialog
        open={Boolean(pendingDiscard)}
        onOpenChange={(open) => {
          if (!open) setPendingDiscard(null);
        }}
        variant="destructive"
        title="Discard unsaved edits?"
        description="Loading another record or clearing the form will discard your unsaved changes in the editor."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          if (!action) return;
          if (action.type === "clear") {
            resetEditorToNew();
          } else {
            void selectItem(action.item).catch(showError);
          }
        }}
      />
    </div>
  );
}

function ManagedField({
  field,
  value,
  approvedAllowed,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  approvedAllowed: boolean;
  onChange: (value: unknown) => void;
}) {
  const className =
    "mt-1 min-h-11 w-full rounded-lg border p-2 font-normal dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-400";
  const options: Partial<Record<FieldType, string[]>> = {
    status: approvedAllowed
      ? ["draft", "approved", "archived"]
      : ["draft", "pending_validation", "rejected", "archived"],
    subject: ["Quantitative Methods", "Discrete Mathematics"],
    difficulty: ["Basic", "Intermediate", "Advanced"],
    kind: ["formula", "theorem"],
    phase: [...REASONING_PHASES],
  };
  return (
    <label
      className={`text-sm font-bold dark:text-slate-200 ${
        field.type === "textarea" || field.type === "lines"
          ? "sm:col-span-2"
          : field.type === "boolean"
            ? "flex min-h-11 items-center gap-3"
            : ""
      }`}
    >
      {field.label}
      {options[field.type] ? (
        <select
          required={field.required}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        >
          {options[field.type]!.map((option) => (
            <option key={option} value={option}>
              {humanize(option)}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="ml-3 h-4 w-4"
        />
      ) : field.type === "textarea" || field.type === "lines" ? (
        <textarea
          required={field.required}
          rows={field.type === "lines" ? 5 : 4}
          value={Array.isArray(value) ? value.join("\n") : String(value ?? "")}
          onChange={(event) =>
            onChange(field.type === "lines" ? lines(event.target.value) : event.target.value)
          }
          className={className}
        />
      ) : (
        <input
          required={field.required}
          list={field.datalistId}
          type={field.type === "number" ? "number" : "text"}
          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
          onChange={(event) =>
            onChange(
              field.type === "number"
                ? Number(event.target.value)
                : field.type === "csv"
                  ? csv(event.target.value)
                  : event.target.value,
            )
          }
          className={className}
        />
      )}
    </label>
  );
}

function normalizePayload(collectionName: ContentCollection, value: Record<string, any>) {
  const copy = structuredClone(value);
  if (collectionName === "difficulty_policies") {
    copy.subjectId = copy.subjectId || null;
    copy.topicId = copy.topicId || null;
  }
  if (collectionName === "problems" && copy.status === "approved") copy.status = "draft";
  return copy;
}

function sanitizeLoadedValue(collectionName: ContentCollection, item: Record<string, any>) {
  const copy = structuredClone(item);
  for (const key of [
    "id",
    "version",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "archivedAt",
    "validatedAt",
    "validationRecordId",
  ]) {
    delete copy[key];
  }
  if (collectionName === "problems") {
    copy.status = copy.status === "approved" ? "draft" : copy.status;
    copy.privateSolution = structuredClone(DEFAULTS.problems.privateSolution);
  }
  return copy;
}

function getPath(value: Record<string, any>, path: string): unknown {
  return path.split(".").reduce((current, part) => current?.[part], value);
}

function setPath(value: Record<string, any>, path: string, next: unknown): Record<string, any> {
  const copy = structuredClone(value);
  const parts = path.split(".");
  let cursor = copy;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
  cursor[parts.at(-1)!] = next;
  return copy;
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}
