import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Archive, CheckCircle2, FileCheck2, Save } from "lucide-react";
import type { AdminImportProblemDraft, CatalogReadinessResponse } from "@mindguide/contracts";
import { REASONING_PHASES } from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  adminArchiveContent,
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
type FieldType = "text" | "textarea" | "number" | "boolean" | "csv" | "lines" | "status" | "subject" | "difficulty" | "kind" | "phase";
interface FieldDefinition {
  path: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

const COMMON_STATUS: FieldDefinition = { path: "status", label: "Lifecycle status", type: "status", required: true };
const FIELDS: Record<ContentCollection, FieldDefinition[]> = {
  subjects: [
    { path: "name", label: "Subject name", type: "subject", required: true },
    COMMON_STATUS,
  ],
  topics: [
    { path: "subjectId", label: "Subject ID", type: "text", required: true },
    { path: "subject", label: "Subject", type: "subject", required: true },
    { path: "name", label: "Topic name", type: "text", required: true },
    COMMON_STATUS,
  ],
  problems: [
    { path: "subjectId", label: "Subject ID", type: "text", required: true },
    { path: "topicId", label: "Topic ID", type: "text", required: true },
    { path: "subject", label: "Subject", type: "subject", required: true },
    { path: "topic", label: "Topic name", type: "text", required: true },
    { path: "difficulty", label: "Difficulty", type: "difficulty", required: true },
    { path: "variant", label: "Variant (1–3)", type: "number", required: true },
    { path: "problemText", label: "Learner-visible problem", type: "textarea", required: true },
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
    { path: "subjectId", label: "Subject ID (blank for global)", type: "text" },
    { path: "topicId", label: "Topic ID (blank for inherited)", type: "text" },
    { path: "minimumCompletedSessions", label: "Minimum completed sessions", type: "number", required: true },
    { path: "increaseScoreThreshold", label: "Increase score threshold", type: "number", required: true },
    { path: "decreaseScoreThreshold", label: "Decrease score threshold", type: "number", required: true },
    { path: "maxHintsForIncrease", label: "Maximum hints for increase", type: "number", required: true },
    { path: "arithmeticErrorAloneLowersDifficulty", label: "Arithmetic error alone lowers difficulty", type: "boolean" },
    COMMON_STATUS,
  ],
};

const DEFAULTS: Record<ContentCollection, Record<string, unknown>> = {
  subjects: { name: "Quantitative Methods", status: "draft" },
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

export function ManagedContentEditor({ collectionName }: { collectionName: ContentCollection }) {
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [recordId, setRecordId] = useState("");
  const [value, setValue] = useState<Record<string, any>>({ ...DEFAULTS[collectionName] });
  const [message, setMessage] = useState<string | null>(null);
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

  const load = useCallback(async () => {
    if (!db) return;
    const [snapshot, nextReadiness] = await Promise.all([
      getDocs(collection(db, collectionName)),
      adminCatalogReadiness(),
    ]);
    setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    setReadiness(nextReadiness);
  }, [collectionName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecordId("");
      setValue(structuredClone(DEFAULTS[collectionName]));
      void load().catch(showError);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collectionName, load]);

  const current = useMemo(() => items.find((item) => item.id === recordId), [items, recordId]);

  async function save() {
    try {
      setMessage(null);
      const normalized = normalizePayload(collectionName, value);
      await adminUpsertContent({ collection: collectionName, id: recordId, value: normalized });
      setMessage("Typed content saved, versioned, and audited.");
      await load();
    } catch (cause) {
      showError(cause);
    }
  }

  async function selectItem(item: Record<string, any>) {
    setRecordId(item.id);
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
    setValue(loaded);
  }

  async function submitValidation() {
    try {
      await adminSubmitProblemValidation(recordId);
      setMessage("Problem submitted for external faculty validation.");
      await load();
    } catch (cause) {
      showError(cause);
    }
  }

  async function recordDecision() {
    try {
      await adminRecordProblemValidation({
        problemId: recordId,
        ...validation,
        validationDate: new Date(`${validation.validationDate}T00:00:00Z`).getTime(),
      });
      setMessage(`Faculty-validation decision recorded: ${validation.decision}.`);
      await load();
    } catch (cause) {
      showError(cause);
    }
  }

  async function runImport(dryRun: boolean) {
    try {
      const result = await adminBulkImportProblems({ problems: importProblems, dryRun });
      setMessage(dryRun
        ? `${String(result.checked)} problem drafts passed server validation.`
        : `${String(result.imported)} problem drafts imported.`);
      if (!dryRun) setImportProblems([]);
      await load();
    } catch (cause) {
      showError(cause);
    }
  }

  function showError(cause: unknown) {
    setMessage(cause instanceof Error ? cause.message : "Managed content operation failed.");
  }

  return (
    <div>
      {readiness && (
        <div className={`mt-5 rounded-2xl border p-4 ${readiness.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" />Formal-evaluation readiness</div>
          <p className="mt-1 text-sm">{readiness.approvedProblemCount} / {readiness.expectedProblemCount} faculty-approved problems · {readiness.cells.filter((cell) => cell.ready).length} / 33 complete cells</p>
        </div>
      )}
      {message && <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">{message}</div>}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">Typed content editor</h2>
          <label className="mt-4 block text-sm font-bold">Stable record ID
            <input value={recordId} onChange={(event) => setRecordId(event.target.value)} className="mt-2 w-full rounded-lg border p-3 font-normal" />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FIELDS[collectionName].map((field) => (
              <ManagedField key={field.path} field={field} value={getPath(value, field.path)} approvedAllowed={collectionName !== "problems"} onChange={(next) => setValue((currentValue) => setPath(currentValue, field.path, next))} />
            ))}
          </div>
          <button disabled={!recordId} onClick={() => void save()} className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">
            <Save className="h-4 w-4" />Save version
          </button>
          {collectionName === "problems" && (
            <div className="mt-6 rounded-xl border border-slate-200 p-4">
              <h3 className="font-bold">Bulk draft import</h3>
              <p className="mt-1 text-xs text-slate-500">Select a JSON array matching the typed problem-draft contract. Every topic and reference is validated by the server.</p>
              <input type="file" accept="application/json,.json" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const parsed = JSON.parse(text);
                  setImportProblems(Array.isArray(parsed) ? parsed : parsed.problems);
                }).catch(showError);
              }} className="mt-3 block w-full text-sm" />
              {importProblems.length > 0 && <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void runImport(true)} className="rounded-lg border px-3 py-2 text-sm font-bold">Validate {importProblems.length} drafts</button>
                <button type="button" onClick={() => void runImport(false)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Import drafts</button>
              </div>}
            </div>
          )}

          {collectionName === "problems" && current && ["draft", "rejected"].includes(current.status) && (
            <button onClick={() => void submitValidation()} className="mt-3 flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 font-bold text-indigo-700">
              <FileCheck2 className="h-4 w-4" />Submit for faculty validation
            </button>
          )}
          {collectionName === "problems" && current?.status === "pending_validation" && (
            <div className="mt-6 rounded-xl border border-indigo-200 p-4">
              <h3 className="font-bold">Record external validation evidence</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(validation).map(([field, fieldValue]) => field === "decision" ? (
                  <label key={field} className="text-sm font-bold">Decision
                    <select value={fieldValue} onChange={(event) => setValidation((currentValue) => ({ ...currentValue, decision: event.target.value as "approved" | "rejected" }))} className="mt-1 w-full rounded-lg border p-2 font-normal">
                      <option value="approved">Approved</option><option value="rejected">Rejected</option>
                    </select>
                  </label>
                ) : (
                  <label key={field} className="text-sm font-bold">{humanize(field)}
                    <input required type={field === "validationDate" ? "date" : "text"} value={fieldValue} onChange={(event) => setValidation((currentValue) => ({ ...currentValue, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border p-2 font-normal" />
                  </label>
                ))}
              </div>
              <button onClick={() => void recordDecision()} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">Record immutable decision</button>
            </div>
          )}
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="font-bold">Existing records ({items.length})</h2>
          <div className="mt-3 max-h-[48rem] divide-y overflow-auto">
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-3">
                <button className="min-w-0 text-left" onClick={() => void selectItem(item).catch(showError)}>
                  <p className="truncate font-semibold">{item.name ?? item.problemText ?? item.id}</p>
                  <p className="text-xs text-slate-500">{item.id} · v{item.version ?? 0} · {item.status}</p>
                </button>
                <button onClick={() => void adminArchiveContent({ collection: collectionName, id: item.id }).then(load).catch(showError)} className="rounded-lg border p-2 text-slate-500" aria-label={`Archive ${item.id}`}>
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ManagedField({ field, value, approvedAllowed, onChange }: { field: FieldDefinition; value: unknown; approvedAllowed: boolean; onChange: (value: unknown) => void }) {
  const className = "mt-1 w-full rounded-lg border p-2 font-normal";
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
    <label className={`text-sm font-bold ${field.type === "textarea" || field.type === "lines" ? "sm:col-span-2" : ""}`}>
      {field.label}
      {options[field.type] ? (
        <select required={field.required} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} className={className}>
          {options[field.type]!.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
        </select>
      ) : field.type === "boolean" ? (
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="ml-3" />
      ) : field.type === "textarea" || field.type === "lines" ? (
        <textarea required={field.required} rows={field.type === "lines" ? 5 : 4} value={Array.isArray(value) ? value.join("\n") : String(value ?? "")} onChange={(event) => onChange(field.type === "lines" ? lines(event.target.value) : event.target.value)} className={className} />
      ) : (
        <input required={field.required} type={field.type === "number" ? "number" : "text"} value={Array.isArray(value) ? value.join(", ") : String(value ?? "")} onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : field.type === "csv" ? csv(event.target.value) : event.target.value)} className={className} />
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
  for (const key of ["id", "version", "createdAt", "createdBy", "updatedAt", "updatedBy", "archivedAt", "validatedAt", "validationRecordId"]) delete copy[key];
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
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}
