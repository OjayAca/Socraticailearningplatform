"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import {
  REASONING_PHASES,
  type AdminImportProblemDraft,
  type Difficulty,
  type ManagedContentStatus,
  type ReasoningPhase,
  type Subject,
} from "@mindguide/contracts";
import { assertCurriculumContent, VALIDATED_SUBJECTS, VALIDATED_TOPICS } from "@/data/validated-curriculum";
import { db } from "@/lib/firebase";
import { displayContentCollectionLabel, displayPhaseLabel } from "@/lib/learning/display-labels";
import { validateManagedContent } from "@/lib/learning/validation";
import {
  adminBulkImportProblems,
  adminRecordProblemValidation,
  adminSubmitProblemValidation,
  adminUpsertContent,
} from "@/lib/secure-api";
import { AnswerSpecificationEditor } from "../AnswerSpecificationEditor";
import { CONTENT_COLLECTIONS, type ContentCollection } from "../ManagedContentEditor";
import { MathText } from "../MathText";
import { Alert } from "../ui/alert";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { ListRowSkeleton } from "../ui/skeleton";
import { type QuestionType, type ResponseFormat } from "./AdminContentLibrary";
import { AdminShell } from "./AdminShell";
import { PageTitle, errorMessage as formatErrorMessage, statusBadgeClass } from "./admin-shared";

/** Props for {@link AdminContentEditor}. */
interface AdminContentEditorProps {
  /** Optional explicit collection override; defaults to `:collection` route param or `"problems"`. */
  collectionName?: ContentCollection;
  /** Optional explicit record ID override when editing; undefined/empty means creating new. */
  recordIdParam?: string;
}

interface SubjectOption {
  id: string;
  name: string;
}

interface TopicOption {
  id: string;
  subjectId: string;
  subject: string;
  name: string;
}

interface FormulaReferenceOption {
  id: string;
  kind: string;
  domain: string;
  statement: string;
  status: string;
}

interface ProblemSummaryOption {
  id: string;
  title: string;
  problemText: string;
}

interface PrivateSolutionForm {
  expectedConcepts: string[];
  requiredFormula: string;
  requiredTheorem: string;
  workedSteps: string[];
  finalAnswer: string;
  interpretation: string;
  answerSpecification?: Record<string, unknown>;
}

interface ProblemFormState {
  subjectId: string;
  topicId: string;
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  variant: number;
  title: string;
  questionType: QuestionType;
  choices: string[];
  problemText: string;
  supportedResponseFormats: ResponseFormat[];
  formulaTheoremReferenceIds: string[];
  status: ManagedContentStatus;
  privateSolution: PrivateSolutionForm;
}

interface SubjectFormState {
  name: string;
  description: string;
  status: ManagedContentStatus;
}

interface TopicFormState {
  subjectId: string;
  subject: string;
  name: string;
  status: ManagedContentStatus;
}

interface FormulaReferenceFormState {
  kind: "formula" | "theorem";
  statement: string;
  variables: string[];
  conditions: string[];
  domain: Subject;
  supportedTopics: string[];
  equivalentNotation: string[];
  status: ManagedContentStatus;
}

interface SocraticPromptFormState {
  problemId: string;
  phase: ReasoningPhase;
  prompt: string;
  status: ManagedContentStatus;
}

interface MisconceptionFormState {
  name: string;
  phases: ReasoningPhase[];
  correctivePrompt: string;
  priority: number;
  status: ManagedContentStatus;
}

interface DifficultyPolicyFormState {
  subjectId: string;
  topicId: string;
  minimumCompletedSessions: number;
  increaseScoreThreshold: number;
  decreaseScoreThreshold: number;
  maxHintsForIncrease: number;
  arithmeticErrorAloneLowersDifficulty: boolean;
  status: ManagedContentStatus;
}

interface EditorFormState {
  problems: ProblemFormState;
  subjects: SubjectFormState;
  topics: TopicFormState;
  formula_theorem_references: FormulaReferenceFormState;
  socratic_prompt_bank: SocraticPromptFormState;
  misconception_categories: MisconceptionFormState;
  difficulty_policies: DifficultyPolicyFormState;
}

interface ValidationOutcome {
  valid: boolean;
  messages: string[];
}

const MATH_PARTS = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([^\n]+?\\\)|^\\[a-zA-Z]+[^\n]*$)/gm;

function resolveCollectionName(candidate?: string): ContentCollection {
  return CONTENT_COLLECTIONS.includes(candidate as ContentCollection)
    ? (candidate as ContentCollection)
    : "problems";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function generateProblemRecordId(
  subject: string,
  topicId: string,
  difficulty: Difficulty,
  variant: number,
): string {
  const subjectPrefix =
    subject === "Quantitative Methods"
      ? "QM"
      : subject === "Discrete Mathematics"
        ? "DM"
        : "MG";
  const subjectTopics = VALIDATED_TOPICS.filter((topic) => topic.subject === subject);
  const topicIdx = subjectTopics.findIndex((topic) => topic.id === topicId);
  const topicCode =
    topicIdx >= 0
      ? String(topicIdx + 1).padStart(2, "0")
      : (slugify(topicId).slice(0, 8) || "01");
  const diffCode = difficulty === "Basic" ? "B" : difficulty === "Intermediate" ? "I" : "A";
  const variantCode = String(Math.min(3, Math.max(1, Math.round(variant)))).padStart(2, "0");
  return `${subjectPrefix}-${topicCode}-${diffCode}${variantCode}`;
}

function generateFormulaReferenceId(
  domain: string,
  kind: string,
  statement: string,
): string {
  const prefix = domain === "Discrete Mathematics" ? "dm" : "qm";
  const tail = slugify(statement).slice(0, 24) || "reference";
  return `ref-${prefix}-${kind}-${tail}`;
}

function generateDefaultRecordId(
  collectionName: ContentCollection,
  state: EditorFormState,
): string {
  switch (collectionName) {
    case "problems": {
      const p = state.problems;
      return generateProblemRecordId(p.subject, p.topicId, p.difficulty, p.variant);
    }
    case "subjects":
      return slugify(state.subjects.name) || "custom-subject";
    case "topics": {
      const match = VALIDATED_TOPICS.find(
        (t) => t.subject === state.topics.subject && t.name === state.topics.name,
      );
      return match?.id ?? (slugify(`${state.topics.subject}-${state.topics.name}`) || "custom-topic");
    }
    case "formula_theorem_references": {
      const f = state.formula_theorem_references;
      return generateFormulaReferenceId(f.domain, f.kind, f.statement);
    }
    case "socratic_prompt_bank": {
      const s = state.socratic_prompt_bank;
      return `prompt-${slugify(s.problemId) || "draft"}-${s.phase}`;
    }
    case "misconception_categories":
      return `misconception-${slugify(state.misconception_categories.name) || "draft"}`;
    case "difficulty_policies": {
      const d = state.difficulty_policies;
      if (d.topicId) return `policy-${d.topicId}`;
      if (d.subjectId) return `policy-${d.subjectId}`;
      return "policy-global";
    }
  }
}

function createInitialFormState(): EditorFormState {
  const firstSubject = VALIDATED_SUBJECTS[0];
  const firstTopic = VALIDATED_TOPICS.find((topic) => topic.subjectId === firstSubject.id) ?? VALIDATED_TOPICS[0];

  return {
    problems: {
      subjectId: firstSubject.id,
      topicId: firstTopic.id,
      subject: firstSubject.name as Subject,
      topic: firstTopic.name,
      difficulty: "Basic",
      variant: 1,
      title: "",
      questionType: "constructed_response",
      choices: [],
      problemText: "",
      supportedResponseFormats: ["text", "latex"],
      formulaTheoremReferenceIds: [],
      status: "draft",
      privateSolution: {
        expectedConcepts: [],
        requiredFormula: "",
        requiredTheorem: "",
        workedSteps: [],
        finalAnswer: "",
        interpretation: "",
        answerSpecification: undefined,
      },
    },
    subjects: {
      name: "",
      description: "",
      status: "draft",
    },
    topics: {
      subjectId: firstSubject.id,
      subject: firstSubject.name,
      name: "",
      status: "draft",
    },
    formula_theorem_references: {
      kind: "formula",
      statement: "",
      variables: [],
      conditions: [],
      domain: firstSubject.name as Subject,
      supportedTopics: [],
      equivalentNotation: [],
      status: "draft",
    },
    socratic_prompt_bank: {
      problemId: "",
      phase: REASONING_PHASES[0],
      prompt: "",
      status: "draft",
    },
    misconception_categories: {
      name: "",
      phases: [],
      correctivePrompt: "",
      priority: 0,
      status: "draft",
    },
    difficulty_policies: {
      subjectId: "",
      topicId: "",
      minimumCompletedSessions: 2,
      increaseScoreThreshold: 80,
      decreaseScoreThreshold: 60,
      maxHintsForIncrease: 1,
      arithmeticErrorAloneLowersDifficulty: false,
      status: "draft",
    },
  };
}

function hydrateCollectionState(
  collectionName: ContentCollection,
  rawData: Record<string, unknown>,
  privateData: Record<string, unknown> | undefined,
  base: EditorFormState,
): EditorFormState {
  const next: EditorFormState = structuredClone(base);
  const rawStatus = asString(rawData.status, "draft") as ManagedContentStatus;

  if (collectionName === "problems") {
    const subject = (asString(rawData.subject, base.problems.subject) as Subject) || base.problems.subject;
    const subjectId = asString(rawData.subjectId, slugify(subject));
    const topic = asString(rawData.topic, base.problems.topic);
    const topicId = asString(rawData.topicId, slugify(`${subject}-${topic}`));
    const questionType: QuestionType =
      rawData.questionType === "multiple_choice" ? "multiple_choice" : "constructed_response";
    const choices = asStringArray(rawData.choices);
    const formats = asStringArray(rawData.supportedResponseFormats).filter(
      (f): f is ResponseFormat => f === "text" || f === "latex",
    );
    const protectedStepsKey = "solutionSteps";
    const workedSteps = privateData
      ? asStringArray(privateData[protectedStepsKey] ?? privateData.workedSteps)
      : [];

    next.problems = {
      subjectId,
      topicId,
      subject,
      topic,
      difficulty: (asString(rawData.difficulty, "Basic") as Difficulty) || "Basic",
      variant: asNumber(rawData.variant, 1),
      title: asString(rawData.title),
      questionType,
      choices: questionType === "multiple_choice" && choices.length === 0 ? ["", ""] : choices,
      problemText: asString(rawData.problemText),
      supportedResponseFormats: formats.length > 0 ? formats : ["text", "latex"],
      formulaTheoremReferenceIds: asStringArray(rawData.formulaTheoremReferenceIds),
      status: rawStatus === "approved" ? "draft" : rawStatus,
      privateSolution: {
        expectedConcepts: privateData ? asStringArray(privateData.expectedConcepts) : [],
        requiredFormula: privateData ? asString(privateData.requiredFormula) : "",
        requiredTheorem: privateData ? asString(privateData.requiredTheorem) : "",
        workedSteps,
        finalAnswer: privateData ? asString(privateData.finalAnswer) : "",
        interpretation: privateData ? asString(privateData.interpretation) : "",
        answerSpecification: privateData ? asRecord(privateData.answerSpecification) : undefined,
      },
    };
  } else if (collectionName === "subjects") {
    next.subjects = {
      name: asString(rawData.name, base.subjects.name),
      description: asString(rawData.description),
      status: rawStatus,
    };
  } else if (collectionName === "topics") {
    next.topics = {
      subjectId: asString(rawData.subjectId, base.topics.subjectId),
      subject: asString(rawData.subject, base.topics.subject),
      name: asString(rawData.name),
      status: rawStatus,
    };
  } else if (collectionName === "formula_theorem_references") {
    next.formula_theorem_references = {
      kind: rawData.kind === "theorem" ? "theorem" : "formula",
      statement: asString(rawData.statement),
      variables: asStringArray(rawData.variables),
      conditions: asStringArray(rawData.conditions),
      domain: asString(rawData.domain, base.formula_theorem_references.domain) as Subject,
      supportedTopics: asStringArray(rawData.supportedTopics),
      equivalentNotation: asStringArray(rawData.equivalentNotation),
      status: rawStatus,
    };
  } else if (collectionName === "socratic_prompt_bank") {
    const rawPhase = asString(rawData.phase, REASONING_PHASES[0]);
    const phase = REASONING_PHASES.includes(rawPhase as ReasoningPhase)
      ? (rawPhase as ReasoningPhase)
      : REASONING_PHASES[0];
    next.socratic_prompt_bank = {
      problemId: asString(rawData.problemId),
      phase,
      prompt: asString(rawData.prompt),
      status: rawStatus,
    };
  } else if (collectionName === "misconception_categories") {
    next.misconception_categories = {
      name: asString(rawData.name),
      phases: asStringArray(rawData.phases).filter((p): p is ReasoningPhase =>
        REASONING_PHASES.includes(p as ReasoningPhase),
      ),
      correctivePrompt: asString(rawData.correctivePrompt),
      priority: asNumber(rawData.priority, 0),
      status: rawStatus,
    };
  } else if (collectionName === "difficulty_policies") {
    next.difficulty_policies = {
      subjectId: asString(rawData.subjectId),
      topicId: asString(rawData.topicId),
      minimumCompletedSessions: asNumber(rawData.minimumCompletedSessions, 2),
      increaseScoreThreshold: asNumber(rawData.increaseScoreThreshold, 80),
      decreaseScoreThreshold: asNumber(rawData.decreaseScoreThreshold, 60),
      maxHintsForIncrease: asNumber(rawData.maxHintsForIncrease, 1),
      arithmeticErrorAloneLowersDifficulty: asBoolean(rawData.arithmeticErrorAloneLowersDifficulty, false),
      status: rawStatus,
    };
  }
  return next;
}

function buildMutationPayload(
  collectionName: ContentCollection,
  state: EditorFormState,
): Record<string, unknown> {
  if (collectionName === "problems") {
    const p = state.problems;
    const payload: Record<string, unknown> = {
      subjectId: p.subjectId.trim(),
      topicId: p.topicId.trim(),
      subject: p.subject,
      topic: p.topic.trim(),
      difficulty: p.difficulty,
      variant: Number(p.variant),
      problemText: p.problemText,
      questionType: p.questionType,
      supportedResponseFormats: p.supportedResponseFormats,
      formulaTheoremReferenceIds: p.formulaTheoremReferenceIds,
      status: p.status === "approved" ? "draft" : p.status,
      privateSolution: {
        expectedConcepts: p.privateSolution.expectedConcepts,
        ...(p.privateSolution.requiredFormula.trim()
          ? { requiredFormula: p.privateSolution.requiredFormula.trim() }
          : {}),
        ...(p.privateSolution.requiredTheorem.trim()
          ? { requiredTheorem: p.privateSolution.requiredTheorem.trim() }
          : {}),
        workedSteps: p.privateSolution.workedSteps,
        finalAnswer: p.privateSolution.finalAnswer,
        interpretation: p.privateSolution.interpretation,
        ...(p.privateSolution.answerSpecification
          ? { answerSpecification: p.privateSolution.answerSpecification }
          : {}),
      },
    };
    if (p.title.trim()) {
      payload.title = p.title.trim();
    }
    if (p.questionType === "multiple_choice") {
      payload.choices = p.choices.map((choice) => choice.trim()).filter(Boolean);
    }
    return payload;
  }

  if (collectionName === "subjects") {
    return {
      ...state.subjects,
      name: state.subjects.name.trim(),
      description: state.subjects.description.trim(),
    };
  }
  if (collectionName === "topics") {
    const trimmedSubject = state.topics.subject.trim();
    const trimmedTopicName = state.topics.name.trim();
    const matched = VALIDATED_TOPICS.find(
      (topic) => topic.subject === trimmedSubject && topic.name === trimmedTopicName,
    );
    return {
      ...state.topics,
      subjectId: state.topics.subjectId.trim(),
      subject: trimmedSubject,
      name: trimmedTopicName,
      ...(matched ? { subtopics: matched.subtopics } : {}),
    };
  }
  if (collectionName === "formula_theorem_references") {
    return { ...state.formula_theorem_references };
  }
  if (collectionName === "socratic_prompt_bank") {
    return { ...state.socratic_prompt_bank };
  }
  if (collectionName === "misconception_categories") {
    return { ...state.misconception_categories };
  }
  return {
    ...state.difficulty_policies,
    subjectId: state.difficulty_policies.subjectId.trim() || null,
    topicId: state.difficulty_policies.topicId.trim() || null,
  };
}

function validateEditorForm(
  collectionName: ContentCollection,
  id: string,
  state: EditorFormState,
): ValidationOutcome {
  const messages: string[] = [];
  const trimmedId = id.trim();
  if (!trimmedId || !/^[A-Za-z0-9_-]+$/.test(trimmedId)) {
    messages.push(
      "Stable Record ID is required and may only contain letters, numbers, underscores, and hyphens.",
    );
  }

  if (collectionName === "problems") {
    const p = state.problems;
    if (!p.subjectId.trim() || !p.topicId.trim() || !p.topic.trim()) {
      messages.push("Select both a valid subject and topic.");
    }
    if (p.problemText.trim().length < 8) {
      messages.push("Learner-visible problem must be at least 8 characters.");
    }
    if (p.questionType === "multiple_choice") {
      const nonEmptyChoices = p.choices.map((c) => c.trim()).filter(Boolean);
      if (nonEmptyChoices.length < 2) {
        messages.push("Multiple choice questions require at least 2 non-empty answer choices.");
      }
    }
    if (p.supportedResponseFormats.length === 0) {
      messages.push("Select at least one supported response format (Plain text or LaTeX).");
    }
    if (p.formulaTheoremReferenceIds.length === 0) {
      messages.push("Select or enter at least one Formula/Theorem Reference ID.");
    }
    if (p.privateSolution.expectedConcepts.length === 0) {
      messages.push("Enter at least one expected concept.");
    }
    if (p.privateSolution.workedSteps.length === 0) {
      messages.push("Enter at least one protected worked step.");
    }
    if (!p.privateSolution.finalAnswer.trim()) {
      messages.push("Protected final answer is required.");
    }
    if (!p.privateSolution.interpretation.trim()) {
      messages.push("Protected interpretation is required.");
    }
  } else if (collectionName === "difficulty_policies") {
    const d = state.difficulty_policies;
    if (d.decreaseScoreThreshold > d.increaseScoreThreshold) {
      messages.push("Decrease score threshold must not exceed increase score threshold.");
    }
  } else if (collectionName === "formula_theorem_references") {
    if (!state.formula_theorem_references.statement.trim()) {
      messages.push("Statement is required.");
    }
  } else if (collectionName === "socratic_prompt_bank") {
    if (!state.socratic_prompt_bank.problemId.trim()) {
      messages.push("Problem ID is required.");
    }
    if (!state.socratic_prompt_bank.prompt.trim()) {
      messages.push("Socratic prompt text is required.");
    }
  } else if (collectionName === "subjects") {
    if (!state.subjects.name.trim()) {
      messages.push("Subject name is required.");
    }
    if (!state.subjects.description.trim()) {
      messages.push("Subject description is required.");
    }
  } else if (collectionName === "topics") {
    if (!state.topics.subject.trim() || !state.topics.subjectId.trim()) {
      messages.push("Subject and Subject ID are required.");
    }
    if (!state.topics.name.trim()) {
      messages.push("Topic name is required.");
    }
  } else if (collectionName === "misconception_categories") {
    if (!state.misconception_categories.name.trim()) {
      messages.push("Category name is required.");
    }
  }

  if (messages.length === 0) {
    try {
      const payload = buildMutationPayload(collectionName, state);
      const validated = validateManagedContent(collectionName, trimmedId, payload);
      assertCurriculumContent(collectionName, trimmedId, validated);
    } catch (cause) {
      messages.push(formatErrorMessage(cause, "Content failed schema validation."));
    }
  }

  return {
    valid: messages.length === 0,
    messages,
  };
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
            : part.slice(1, -1);
        return (
          <span key={index} className={isDisplay ? "block overflow-x-auto py-1.5" : undefined}>
            <MathText latex={latex} />
          </span>
        );
      })}
    </span>
  );
}

function EditorSection({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900/80">
      <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">
          {step}
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

/**
 * Structured Add/Edit content workspace supporting the 4-section problem authoring flow,
 * conditional Multiple Choice answer inputs, auto-populated subject/topic/record IDs,
 * live `MathText` preview, validation checks, and expandable Advanced Settings.
 *
 * @param props - See {@link AdminContentEditorProps}.
 * @returns The rendered Add/Edit editor workspace.
 */
function AdminContentEditor({
  collectionName: propCollection,
  recordIdParam: propRecordId,
}: AdminContentEditorProps) {
  const params = useParams();
  const collectionName = resolveCollectionName(propCollection ?? params.collection);
  const routeRecordId = propRecordId ?? params.recordId;

  return (
    <AdminContentEditorInner
      key={`${collectionName}:${routeRecordId ?? "new"}`}
      collectionName={collectionName}
      routeRecordId={routeRecordId}
    />
  );
}

function AdminContentEditorInner({
  collectionName,
  routeRecordId,
}: {
  collectionName: ContentCollection;
  routeRecordId?: string;
}) {
  const navigate = useNavigate();
  const isNew = !routeRecordId;

  const [formState, setFormState] = useState<EditorFormState>(() => createInitialFormState());
  const [manualRecordId, setManualRecordId] = useState<string>(routeRecordId ?? "");
  const [idManuallyEdited, setIdManuallyEdited] = useState(!isNew);
  const recordId =
    isNew && !idManuallyEdited
      ? generateDefaultRecordId(collectionName, formState)
      : manualRecordId;
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  const [firestoreSubjects, setFirestoreSubjects] = useState<SubjectOption[]>([]);
  const [firestoreTopics, setFirestoreTopics] = useState<TopicOption[]>([]);
  const [formulaRefs, setFormulaRefs] = useState<FormulaReferenceOption[]>([]);
  const [problemOptions, setProblemOptions] = useState<ProblemSummaryOption[]>([]);
  const [customRefInput, setCustomRefInput] = useState("");
  const [expectedConceptsText, setExpectedConceptsText] = useState("");
  const [workedStepsText, setWorkedStepsText] = useState("");

  const [validationResult, setValidationResult] = useState<ValidationOutcome | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "save" | "submit_validation" | "record_decision" | "validate_import" | "import" | null
  >(null);

  const [importProblems, setImportProblems] = useState<AdminImportProblemDraft[]>([]);
  const [validationEvidence, setValidationEvidence] = useState({
    syllabusReference: "",
    contentMatrixItem: "",
    validatorName: "",
    validatorRole: "",
    validationDate: new Date().toISOString().slice(0, 10),
    evidenceReference: "",
    evidenceHash: "",
    decision: "approved" as "approved" | "rejected",
  });

  const [pendingNavTarget, setPendingNavTarget] = useState<"back" | "reset" | null>(null);

  const isBusy = busyAction !== null;

  // Warn browser tab close/reload if unsaved edits exist.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const loadEditorData = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setErrorMsg(null);
    if (!isNew) setLoading(true);
    try {
      const [subjectsSnap, topicsSnap, refsSnap, problemsSnap] = await Promise.all([
        getDocs(collection(db, "subjects")).catch(() => null),
        getDocs(collection(db, "topics")).catch(() => null),
        getDocs(collection(db, "formula_theorem_references")).catch(() => null),
        collectionName === "socratic_prompt_bank"
          ? getDocs(collection(db, "problems")).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (subjectsSnap) {
        setFirestoreSubjects(
          subjectsSnap.docs
            .map((entry) => {
              const data = entry.data() as Record<string, unknown>;
              return {
                id: entry.id,
                name: asString(data.name, entry.id),
              };
            })
            .filter((subject) => Boolean(subject.id && subject.name)),
        );
      }

      if (topicsSnap) {
        setFirestoreTopics(
          topicsSnap.docs.map((entry) => {
            const data = entry.data() as Record<string, unknown>;
            return {
              id: entry.id,
              subjectId: asString(data.subjectId),
              subject: asString(data.subject),
              name: asString(data.name, entry.id),
            };
          }),
        );
      }

      if (refsSnap) {
        setFormulaRefs(
          refsSnap.docs.map((entry) => {
            const data = entry.data() as Record<string, unknown>;
            return {
              id: entry.id,
              kind: asString(data.kind, "formula"),
              domain: asString(data.domain),
              statement: asString(data.statement, entry.id),
              status: asString(data.status, "draft"),
            };
          }),
        );
      }

      if (problemsSnap) {
        setProblemOptions(
          problemsSnap.docs.map((entry) => {
            const data = entry.data() as Record<string, unknown>;
            return {
              id: entry.id,
              title: asString(data.title),
              problemText: asString(data.problemText),
            };
          }),
        );
      }

      if (routeRecordId) {
        const recordSnap = await getDoc(doc(db, collectionName, routeRecordId));
        if (!recordSnap.exists()) {
          setErrorMsg(`Record "${routeRecordId}" was not found in ${displayContentCollectionLabel(collectionName)}.`);
          setLoading(false);
          return;
        }
        const rawData = recordSnap.data() as Record<string, unknown>;
        let privateData: Record<string, unknown> | undefined;
        if (collectionName === "problems") {
          const privateSnap = await getDoc(doc(db, "problems", routeRecordId, "private", "solution")).catch(
            () => null,
          );
          if (privateSnap?.exists()) {
            privateData = privateSnap.data() as Record<string, unknown>;
          }
        }
        const hydrated = hydrateCollectionState(collectionName, rawData, privateData, createInitialFormState());
        setFormState(hydrated);
        setExpectedConceptsText(hydrated.problems.privateSolution.expectedConcepts.join(", "));
        setWorkedStepsText(hydrated.problems.privateSolution.workedSteps.join("\n"));
        setManualRecordId(routeRecordId);
        setIdManuallyEdited(true);
        setLoadedStatus(asString(rawData.status, "draft"));
        setIsDirty(false);
      }
    } catch (cause) {
      setErrorMsg(formatErrorMessage(cause, "Could not load record details."));
    } finally {
      setLoading(false);
    }
  }, [collectionName, isNew, routeRecordId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEditorData();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadEditorData]);

  // Merge core VALIDATED_SUBJECTS with any custom Firestore subjects.
  const allSubjects = useMemo<SubjectOption[]>(() => {
    const byId = new Map<string, SubjectOption>();
    for (const subject of VALIDATED_SUBJECTS) {
      byId.set(subject.id, { id: subject.id, name: subject.name });
    }
    for (const subject of firestoreSubjects) {
      if (!byId.has(subject.id) && subject.name) {
        byId.set(subject.id, subject);
      }
    }
    return [...byId.values()];
  }, [firestoreSubjects]);

  // Merge VALIDATED_TOPICS with any additional Firestore topics.
  const allTopics = useMemo<TopicOption[]>(() => {
    const byId = new Map<string, TopicOption>();
    for (const topic of VALIDATED_TOPICS) {
      byId.set(topic.id, {
        id: topic.id,
        subjectId: topic.subjectId,
        subject: topic.subject,
        name: topic.name,
      });
    }
    for (const topic of firestoreTopics) {
      if (!byId.has(topic.id) && topic.name) {
        byId.set(topic.id, topic);
      }
    }
    return [...byId.values()];
  }, [firestoreTopics]);

  const isCoreValidatedSubject = !isNew && VALIDATED_SUBJECTS.some((subj) => subj.id === routeRecordId);
  const isCoreValidatedTopic = !isNew && VALIDATED_TOPICS.some((topic) => topic.id === routeRecordId);

  const filteredProblemTopics = useMemo(
    () => allTopics.filter((topic) => topic.subject === formState.problems.subject),
    [allTopics, formState.problems.subject],
  );

  const filteredPolicyTopics = useMemo(
    () =>
      formState.difficulty_policies.subjectId
        ? allTopics.filter((topic) => topic.subjectId === formState.difficulty_policies.subjectId)
        : allTopics,
    [allTopics, formState.difficulty_policies.subjectId],
  );

  function updateForm(updater: (prev: EditorFormState) => EditorFormState) {
    setFormState(updater);
    setIsDirty(true);
    setValidationResult(null);
  }

  function updateProblem(updater: (prev: ProblemFormState) => ProblemFormState) {
    updateForm((prev) => ({
      ...prev,
      problems: updater(prev.problems),
    }));
  }

  function handleProblemSubjectChange(nextSubjectName: Subject) {
    const matchedSubject = VALIDATED_SUBJECTS.find((s) => s.name === nextSubjectName);
    const nextSubjectId = matchedSubject?.id ?? slugify(nextSubjectName);
    const nextTopics = allTopics.filter((t) => t.subject === nextSubjectName);
    const firstTopic = nextTopics[0];

    updateProblem((prev) => ({
      ...prev,
      subject: nextSubjectName,
      subjectId: nextSubjectId,
      topic: firstTopic?.name ?? "",
      topicId: firstTopic?.id ?? "",
    }));
  }

  function handleProblemTopicChange(nextTopicName: string) {
    const matchedTopic = filteredProblemTopics.find((t) => t.name === nextTopicName);
    updateProblem((prev) => ({
      ...prev,
      topic: nextTopicName,
      topicId: matchedTopic?.id ?? slugify(`${prev.subject}-${nextTopicName}`),
    }));
  }

  function handleQuestionTypeChange(nextType: QuestionType) {
    updateProblem((prev) => ({
      ...prev,
      questionType: nextType,
      choices:
        nextType === "multiple_choice"
          ? prev.choices.length >= 2
            ? prev.choices
            : ["", ""]
          : prev.choices,
    }));
  }

  function toggleResponseFormat(format: ResponseFormat) {
    updateProblem((prev) => {
      const exists = prev.supportedResponseFormats.includes(format);
      const nextFormats = exists
        ? prev.supportedResponseFormats.filter((item) => item !== format)
        : [...prev.supportedResponseFormats, format];
      return { ...prev, supportedResponseFormats: nextFormats };
    });
  }

  function toggleFormulaReferenceId(refId: string) {
    updateProblem((prev) => {
      const exists = prev.formulaTheoremReferenceIds.includes(refId);
      const nextIds = exists
        ? prev.formulaTheoremReferenceIds.filter((id) => id !== refId)
        : [...prev.formulaTheoremReferenceIds, refId];
      return { ...prev, formulaTheoremReferenceIds: nextIds };
    });
  }

  function addCustomReferenceId() {
    const trimmed = customRefInput.trim();
    if (!trimmed) return;
    updateProblem((prev) => ({
      ...prev,
      formulaTheoremReferenceIds: prev.formulaTheoremReferenceIds.includes(trimmed)
        ? prev.formulaTheoremReferenceIds
        : [...prev.formulaTheoremReferenceIds, trimmed],
    }));
    setCustomRefInput("");
  }

  function handleValidateContent(): ValidationOutcome {
    const outcome = validateEditorForm(collectionName, recordId, formState);
    setValidationResult(outcome);
    return outcome;
  }

  async function handleSaveChanges() {
    if (isBusy) return;
    const check = validateEditorForm(collectionName, recordId, formState);
    setValidationResult(check);
    if (!check.valid) {
      setErrorMsg(check.messages[0]);
      setStatusMessage(null);
      return;
    }

    setBusyAction("save");
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      const trimmedId = recordId.trim();
      const payload = buildMutationPayload(collectionName, formState);
      await adminUpsertContent({
        collection: collectionName,
        id: trimmedId,
        value: payload,
      });
      setIsDirty(false);
      setLoadedStatus(String(payload.status ?? "draft"));
      setStatusMessage(`Saved ${trimmedId} (${displayContentCollectionLabel(collectionName)}).`);
    } catch (cause) {
      setErrorMsg(formatErrorMessage(cause, "Failed to save content changes."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitValidation() {
    if (isBusy || !recordId.trim()) return;
    setBusyAction("submit_validation");
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      await adminSubmitProblemValidation(recordId.trim());
      setLoadedStatus("pending_validation");
      updateProblem((prev) => ({ ...prev, status: "pending_validation" }));
      setIsDirty(false);
      setStatusMessage("Problem submitted for external faculty validation.");
    } catch (cause) {
      setErrorMsg(formatErrorMessage(cause, "Could not submit problem for validation."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRecordValidationDecision() {
    if (isBusy || !recordId.trim()) return;
    setBusyAction("record_decision");
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      await adminRecordProblemValidation({
        problemId: recordId.trim(),
        ...validationEvidence,
        validationDate: new Date(`${validationEvidence.validationDate}T00:00:00Z`).getTime(),
      });
      setLoadedStatus(validationEvidence.decision);
      setStatusMessage(`Faculty-validation decision recorded: ${validationEvidence.decision}.`);
    } catch (cause) {
      setErrorMsg(formatErrorMessage(cause, "Could not record validation decision."));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleBulkImport(dryRun: boolean) {
    if (isBusy || importProblems.length === 0) return;
    setBusyAction(dryRun ? "validate_import" : "import");
    setErrorMsg(null);
    setStatusMessage(null);
    try {
      const result = await adminBulkImportProblems({ problems: importProblems, dryRun });
      setStatusMessage(
        dryRun
          ? `${String(result.checked)} problem drafts passed validation.`
          : `${String(result.imported)} problem drafts imported.`,
      );
      if (!dryRun) setImportProblems([]);
    } catch (cause) {
      setErrorMsg(formatErrorMessage(cause, "Bulk problem import failed."));
    } finally {
      setBusyAction(null);
    }
  }

  function resetFormToNew() {
    const fresh = createInitialFormState();
    setFormState(fresh);
    setExpectedConceptsText("");
    setWorkedStepsText("");
    setManualRecordId("");
    setIdManuallyEdited(false);
    setIsDirty(false);
    setValidationResult(null);
    setErrorMsg(null);
    setStatusMessage(null);
  }

  function handleBackClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isDirty) return;
    event.preventDefault();
    setPendingNavTarget("back");
  }

  const inputClass =
    "mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-normal text-slate-950 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  const problem = formState.problems;
  const availableReferenceOptions = useMemo(() => {
    const ids = new Set(formulaRefs.map((r) => r.id));
    const extras: FormulaReferenceOption[] = problem.formulaTheoremReferenceIds
      .filter((id) => !ids.has(id))
      .map((id) => ({
        id,
        kind: "reference",
        domain: problem.subject,
        statement: id,
        status: "linked",
      }));
    return [...formulaRefs, ...extras];
  }, [formulaRefs, problem.formulaTheoremReferenceIds, problem.subject]);

  const inputProblemStatus = loadedStatus ?? problem.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/admin/content/${collectionName}`}
          onClick={handleBackClick}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>Back to {displayContentCollectionLabel(collectionName)}</span>
        </Link>

        {isNew && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (isDirty) setPendingNavTarget("reset");
              else resetFormToNew();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Reset form</span>
          </button>
        )}
      </div>

      <PageTitle
        title={
          isNew
            ? `New ${displayContentCollectionLabel(collectionName).replace(/s$/, "")}`
            : `Edit ${displayContentCollectionLabel(collectionName).replace(/s$/, "")}: ${routeRecordId}`
        }
        description={
          collectionName === "problems"
            ? "Complete the four guided sections below to author, validate, preview, and save a problem record."
            : "Edit and validate this managed curriculum record before saving."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300">
                Unsaved changes
              </span>
            )}
            {loadedStatus && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(loadedStatus)}`}
              >
                {loadedStatus.replace(/_/g, " ")}
              </span>
            )}
          </div>
        }
      />

      {errorMsg && (
        <Alert tone="error" onDismiss={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {statusMessage && (
        <Alert tone="success" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <ListRowSkeleton rows={6} label="Loading record editor" />
        </div>
      ) : (
        <div className="space-y-6">
          {collectionName === "problems" ? (
            <>
              {/* SECTION 1: BASIC INFORMATION */}
              <EditorSection
                step="Section 1 of 4"
                title="Basic Information"
                description="Choose curriculum classification and delivery metadata. Subject ID, Topic ID, and Record ID populate automatically."
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Subject
                    <select
                      value={problem.subject}
                      onChange={(event) => handleProblemSubjectChange(event.target.value as Subject)}
                      className={inputClass}
                    >
                      {VALIDATED_SUBJECTS.map((subj) => (
                        <option key={subj.id} value={subj.name}>
                          {subj.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Topic
                    <select
                      value={problem.topic}
                      onChange={(event) => handleProblemTopicChange(event.target.value)}
                      className={inputClass}
                    >
                      {filteredProblemTopics.map((topic) => (
                        <option key={topic.id} value={topic.name}>
                          {topic.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Difficulty
                    <select
                      value={problem.difficulty}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          difficulty: event.target.value as Difficulty,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="Basic">Basic</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Question Type
                    <select
                      value={problem.questionType}
                      onChange={(event) =>
                        handleQuestionTypeChange(event.target.value as QuestionType)
                      }
                      className={inputClass}
                    >
                      <option value="constructed_response">Constructed Response</option>
                      <option value="multiple_choice">Multiple Choice</option>
                    </select>
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Variant (1–3)
                    <select
                      value={problem.variant}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          variant: Number(event.target.value),
                        }))
                      }
                      className={inputClass}
                    >
                      <option value={1}>Variant 1</option>
                      <option value={2}>Variant 2</option>
                      <option value={3}>Variant 3</option>
                    </select>
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Lifecycle Status
                    <select
                      value={problem.status}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          status: event.target.value as ManagedContentStatus,
                        }))
                      }
                      className={inputClass}
                    >
                      <option value="draft">Draft</option>
                      <option value="pending_validation">Pending Validation</option>
                      <option value="rejected">Rejected</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  <span>
                    Record ID: <strong className="font-mono text-slate-900 dark:text-slate-200">{recordId || "—"}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Subject ID: <strong className="font-mono text-slate-900 dark:text-slate-200">{problem.subjectId}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Topic ID: <strong className="font-mono text-slate-900 dark:text-slate-200">{problem.topicId}</strong>
                  </span>
                </div>
              </EditorSection>

              {/* SECTION 2: PROBLEM DETAILS */}
              <EditorSection
                step="Section 2 of 4"
                title="Problem Details"
                description="Author the learner-facing prompt, title, response format options, and answer choices when using Multiple Choice."
              >
                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                  Question Title
                  <input
                    type="text"
                    value={problem.title}
                    onChange={(event) =>
                      updateProblem((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="e.g., Translate an integer condition"
                    className={inputClass}
                  />
                </label>

                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                  Learner-Visible Problem
                  <textarea
                    rows={5}
                    value={problem.problemText}
                    onChange={(event) =>
                      updateProblem((prev) => ({ ...prev, problemText: event.target.value }))
                    }
                    placeholder="Enter the problem statement, givens, and response instructions. Supports LaTeX delimiters like $x^2$."
                    className={inputClass}
                  />
                </label>

                {problem.questionType === "multiple_choice" && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Answer Choices
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          Provide at least 2 answer options for this Multiple Choice question.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateProblem((prev) => ({
                            ...prev,
                            choices: [...prev.choices, ""],
                          }))
                        }
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300"
                      >
                        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        Add choice
                      </button>
                    </div>

                    <div className="mt-3 space-y-2.5">
                      {problem.choices.map((choice, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <label className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Choice {index + 1}
                            <input
                              type="text"
                              value={choice}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateProblem((prev) => ({
                                  ...prev,
                                  choices: prev.choices.map((c, idx) => (idx === index ? value : c)),
                                }));
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + index)}`}
                              className={inputClass}
                            />
                          </label>
                          {problem.choices.length > 2 && (
                            <button
                              type="button"
                              aria-label={`Remove choice ${index + 1}`}
                              onClick={() =>
                                updateProblem((prev) => ({
                                  ...prev,
                                  choices: prev.choices.filter((_, idx) => idx !== index),
                                }))
                              }
                              className="mt-6 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <legend className="px-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                    Response Formats
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(["text", "latex"] as const).map((format) => (
                      <label
                        key={format}
                        className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={problem.supportedResponseFormats.includes(format)}
                          onChange={() => toggleResponseFormat(format)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{format === "text" ? "Plain text" : "LaTeX math"}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </EditorSection>

              {/* SECTION 3: LEARNING REQUIREMENTS */}
              <EditorSection
                step="Section 3 of 4"
                title="Learning Requirements & Protected Solution"
                description="Define expected concepts, linked formulas/theorems, protected worked steps, and structured scoring answers."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                    Expected Concepts (comma-separated)
                    <input
                      type="text"
                      value={expectedConceptsText}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setExpectedConceptsText(raw);
                        updateProblem((prev) => ({
                          ...prev,
                          privateSolution: {
                            ...prev.privateSolution,
                            expectedConcepts: splitCsv(raw),
                          },
                        }));
                      }}
                      placeholder="e.g., Bayes' theorem, conditional probability, sample space"
                      className={inputClass}
                    />
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Required Formula (optional)
                    <input
                      type="text"
                      value={problem.privateSolution.requiredFormula}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          privateSolution: {
                            ...prev.privateSolution,
                            requiredFormula: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Required Theorem (optional)
                    <input
                      type="text"
                      value={problem.privateSolution.requiredTheorem}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          privateSolution: {
                            ...prev.privateSolution,
                            requiredTheorem: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </div>

                {/* Formula/Theorem Reference IDs selector */}
                <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <legend className="px-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                    Formula / Theorem Reference IDs
                  </legend>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Select one or more reference records from Formulas &amp; Theorems, or add a reference ID directly.
                  </p>

                  {availableReferenceOptions.length > 0 && (
                    <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                      {availableReferenceOptions.map((ref) => {
                        const checked = problem.formulaTheoremReferenceIds.includes(ref.id);
                        return (
                          <label
                            key={ref.id}
                            className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-xs transition ${
                              checked
                                ? "border-indigo-500 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-950/40"
                                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFormulaReferenceId(ref.id)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono font-bold text-slate-900 dark:text-slate-100">
                                {ref.id}
                              </span>
                              <span className="line-clamp-2 text-slate-600 dark:text-slate-400">
                                {ref.kind} · {ref.statement}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <label className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Add reference ID
                      <input
                        type="text"
                        value={customRefInput}
                        onChange={(event) => setCustomRefInput(event.target.value)}
                        placeholder="e.g., bank-QM-01-B01-reference"
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={addCustomReferenceId}
                      className="mt-auto inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Add ID
                    </button>
                  </div>
                </fieldset>

                <label className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                  Protected Worked Steps (one per line)
                  <textarea
                    rows={5}
                    value={workedStepsText}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setWorkedStepsText(raw);
                      updateProblem((prev) => ({
                        ...prev,
                        privateSolution: {
                          ...prev.privateSolution,
                          workedSteps: splitLines(raw),
                        },
                      }));
                    }}
                    placeholder="Step 1: Identify given conditions..."
                    className={inputClass}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Protected Final Answer
                    <textarea
                      rows={3}
                      value={problem.privateSolution.finalAnswer}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          privateSolution: {
                            ...prev.privateSolution,
                            finalAnswer: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </label>

                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Protected Interpretation
                    <textarea
                      rows={3}
                      value={problem.privateSolution.interpretation}
                      onChange={(event) =>
                        updateProblem((prev) => ({
                          ...prev,
                          privateSolution: {
                            ...prev.privateSolution,
                            interpretation: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </div>

                <AnswerSpecificationEditor
                  value={problem.privateSolution.answerSpecification}
                  onChange={(nextSpec) =>
                    updateProblem((prev) => ({
                      ...prev,
                      privateSolution: {
                        ...prev.privateSolution,
                        answerSpecification: nextSpec,
                      },
                    }))
                  }
                />
              </EditorSection>

              {/* SECTION 4: REVIEW AND SAVE */}
              <EditorSection
                step="Section 4 of 4"
                title="Review and Save"
                description="Preview the learner-facing rendering, validate required fields, and save or submit for faculty validation."
              >
                {/* Live Question Preview */}
                <div
                  aria-label="Live question preview"
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Live Question Preview
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {problem.subject}
                      </span>
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {problem.topic}
                      </span>
                      <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {problem.difficulty}
                      </span>
                    </div>
                  </div>

                  {problem.title.trim() && (
                    <h3 className="mt-3 text-base font-bold text-slate-950 dark:text-white">
                      {problem.title}
                    </h3>
                  )}

                  <div className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                    {problem.problemText.trim() ? (
                      renderFormattedMath(problem.problemText)
                    ) : (
                      <p className="italic text-slate-400">
                        Enter a learner-visible problem above to preview it here.
                      </p>
                    )}
                  </div>

                  {problem.questionType === "multiple_choice" && (
                    <ul className="mt-4 space-y-2">
                      {problem.choices.map((choice, index) => (
                        <li
                          key={index}
                          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                        >
                          <span className="mr-2 font-bold text-indigo-600 dark:text-indigo-400">
                            {String.fromCharCode(65 + index)}.
                          </span>
                          {choice.trim() ? (
                            renderFormattedMath(choice)
                          ) : (
                            <span className="italic text-slate-400">Empty choice</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {validationResult && (
                  <Alert tone={validationResult.valid ? "success" : "error"}>
                    {validationResult.valid ? (
                      <span>All validation checks passed — ready to save.</span>
                    ) : (
                      <ul className="list-disc space-y-1 pl-4">
                        {validationResult.messages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    )}
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleValidateContent}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Validate Content</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSaveChanges()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                  >
                    {busyAction === "save" ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save aria-hidden="true" className="h-4 w-4" />
                    )}
                    <span>{busyAction === "save" ? "Saving..." : "Save Changes"}</span>
                  </button>

                  {!isNew && (inputProblemStatus === "draft" || inputProblemStatus === "rejected") && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSubmitValidation()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
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
                </div>

                {!isNew && inputProblemStatus === "pending_validation" && (
                  <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
                    <h3 className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-indigo-600" />
                      Record external validation evidence
                    </h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Syllabus Reference
                        <input
                          disabled={isBusy}
                          value={validationEvidence.syllabusReference}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              syllabusReference: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Content Matrix Item
                        <input
                          disabled={isBusy}
                          value={validationEvidence.contentMatrixItem}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              contentMatrixItem: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Validator Name
                        <input
                          disabled={isBusy}
                          value={validationEvidence.validatorName}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              validatorName: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Validator Role
                        <input
                          disabled={isBusy}
                          value={validationEvidence.validatorRole}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              validatorRole: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Validation Date
                        <input
                          type="date"
                          disabled={isBusy}
                          value={validationEvidence.validationDate}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              validationDate: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Evidence Reference
                        <input
                          disabled={isBusy}
                          value={validationEvidence.evidenceReference}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              evidenceReference: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Evidence Hash (16–256 chars)
                        <input
                          disabled={isBusy}
                          value={validationEvidence.evidenceHash}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              evidenceHash: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Decision
                        <select
                          disabled={isBusy}
                          value={validationEvidence.decision}
                          onChange={(event) =>
                            setValidationEvidence((prev) => ({
                              ...prev,
                              decision: event.target.value as "approved" | "rejected",
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleRecordValidationDecision()}
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
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
              </EditorSection>
            </>
          ) : (
            /* STRUCTURED LAYOUT FOR ALL OTHER CONTENT_COLLECTIONS */
            <>
              <EditorSection
                step="Section 1 of 2"
                title={`${displayContentCollectionLabel(collectionName)} Details`}
                description="Configure the structured fields for this managed content record."
              >
                {collectionName === "subjects" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Subject Name
                      <input
                        type="text"
                        disabled={isCoreValidatedSubject || isBusy}
                        value={formState.subjects.name}
                        placeholder="e.g. Applied Linear Algebra"
                        onChange={(event) => {
                          const nextName = event.target.value;
                          updateForm((prev) => ({
                            ...prev,
                            subjects: { ...prev.subjects, name: nextName },
                          }));
                        }}
                        className={inputClass}
                      />
                      {isCoreValidatedSubject && (
                        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                          Core validated subject names and active status remain locked.
                        </span>
                      )}
                    </label>
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Lifecycle Status
                      <select
                        disabled={isCoreValidatedSubject || isBusy}
                        value={formState.subjects.status}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            subjects: {
                              ...prev.subjects,
                              status: event.target.value as ManagedContentStatus,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="approved">Approved</option>
                        <option value="draft">Draft</option>
                        <option value="rejected">Rejected</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                      Subject Description
                      <textarea
                        rows={4}
                        value={formState.subjects.description}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            subjects: { ...prev.subjects, description: event.target.value },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>
                )}

                {collectionName === "topics" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Subject
                      <select
                        disabled={isCoreValidatedTopic || isBusy}
                        value={formState.topics.subject}
                        onChange={(event) => {
                          const nextSubject = event.target.value;
                          const matchedSubject = allSubjects.find((s) => s.name === nextSubject);
                          updateForm((prev) => ({
                            ...prev,
                            topics: {
                              ...prev.topics,
                              subject: nextSubject,
                              subjectId: matchedSubject?.id ?? slugify(nextSubject),
                            },
                          }));
                        }}
                        className={inputClass}
                      >
                        {allSubjects.map((subj) => (
                          <option key={subj.id} value={subj.name}>
                            {subj.name}
                          </option>
                        ))}
                        {formState.topics.subject &&
                          !allSubjects.some((subj) => subj.name === formState.topics.subject) && (
                            <option value={formState.topics.subject}>{formState.topics.subject}</option>
                          )}
                      </select>
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Topic Name
                      <input
                        type="text"
                        disabled={isCoreValidatedTopic || isBusy}
                        value={formState.topics.name}
                        placeholder="e.g. Markov Chains"
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            topics: { ...prev.topics, name: event.target.value },
                          }))
                        }
                        className={inputClass}
                      />
                      {isCoreValidatedTopic && (
                        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                          Core validated topic hierarchy and active status remain locked.
                        </span>
                      )}
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Lifecycle Status
                      <select
                        disabled={isCoreValidatedTopic || isBusy}
                        value={formState.topics.status}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            topics: {
                              ...prev.topics,
                              status: event.target.value as ManagedContentStatus,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="approved">Approved</option>
                        <option value="draft">Draft</option>
                        <option value="rejected">Rejected</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                )}

                {collectionName === "formula_theorem_references" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Reference Kind
                      <select
                        value={formState.formula_theorem_references.kind}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              kind: event.target.value as "formula" | "theorem",
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="formula">Formula</option>
                        <option value="theorem">Theorem</option>
                      </select>
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Domain (Subject)
                      <select
                        value={formState.formula_theorem_references.domain}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              domain: event.target.value as Subject,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        {VALIDATED_SUBJECTS.map((subj) => (
                          <option key={subj.id} value={subj.name}>
                            {subj.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                      Statement
                      <textarea
                        rows={4}
                        value={formState.formula_theorem_references.statement}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              statement: event.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Variables (comma-separated)
                      <input
                        type="text"
                        value={formState.formula_theorem_references.variables.join(", ")}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              variables: splitCsv(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Supported Topics (comma-separated)
                      <input
                        type="text"
                        value={formState.formula_theorem_references.supportedTopics.join(", ")}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              supportedTopics: splitCsv(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                      Application Conditions (one per line)
                      <textarea
                        rows={4}
                        value={formState.formula_theorem_references.conditions.join("\n")}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              conditions: splitLines(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                      Equivalent Notation (one per line)
                      <textarea
                        rows={3}
                        value={formState.formula_theorem_references.equivalentNotation.join("\n")}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              equivalentNotation: splitLines(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Lifecycle Status
                      <select
                        value={formState.formula_theorem_references.status}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            formula_theorem_references: {
                              ...prev.formula_theorem_references,
                              status: event.target.value as ManagedContentStatus,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                )}

                {collectionName === "socratic_prompt_bank" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Problem ID
                      <input
                        type="text"
                        list="mg-problem-ids"
                        value={formState.socratic_prompt_bank.problemId}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            socratic_prompt_bank: {
                              ...prev.socratic_prompt_bank,
                              problemId: event.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      />
                      <datalist id="mg-problem-ids">
                        {problemOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title || item.problemText}
                          </option>
                        ))}
                      </datalist>
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Reasoning Phase
                      <select
                        value={formState.socratic_prompt_bank.phase}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            socratic_prompt_bank: {
                              ...prev.socratic_prompt_bank,
                              phase: event.target.value as ReasoningPhase,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        {REASONING_PHASES.map((phase) => (
                          <option key={phase} value={phase}>
                            {displayPhaseLabel(phase)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                      Socratic Prompt
                      <textarea
                        rows={4}
                        value={formState.socratic_prompt_bank.prompt}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            socratic_prompt_bank: {
                              ...prev.socratic_prompt_bank,
                              prompt: event.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Lifecycle Status
                      <select
                        value={formState.socratic_prompt_bank.status}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            socratic_prompt_bank: {
                              ...prev.socratic_prompt_bank,
                              status: event.target.value as ManagedContentStatus,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                )}

                {collectionName === "misconception_categories" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Category Name
                      <input
                        type="text"
                        value={formState.misconception_categories.name}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            misconception_categories: {
                              ...prev.misconception_categories,
                              name: event.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Priority (0–100)
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formState.misconception_categories.priority}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            misconception_categories: {
                              ...prev.misconception_categories,
                              priority: Number(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <fieldset className="rounded-xl border border-slate-200 p-4 sm:col-span-2 dark:border-slate-800">
                      <legend className="px-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                        Applicable Reasoning Phases
                      </legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {REASONING_PHASES.map((phase) => {
                          const checked = formState.misconception_categories.phases.includes(phase);
                          return (
                            <label
                              key={phase}
                              className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  updateForm((prev) => ({
                                    ...prev,
                                    misconception_categories: {
                                      ...prev.misconception_categories,
                                      phases: checked
                                        ? prev.misconception_categories.phases.filter((p) => p !== phase)
                                        : [...prev.misconception_categories.phases, phase],
                                    },
                                  }))
                                }
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                              />
                              <span>{displayPhaseLabel(phase)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">
                      Corrective Prompt
                      <textarea
                        rows={4}
                        value={formState.misconception_categories.correctivePrompt}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            misconception_categories: {
                              ...prev.misconception_categories,
                              correctivePrompt: event.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Lifecycle Status
                      <select
                        value={formState.misconception_categories.status}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            misconception_categories: {
                              ...prev.misconception_categories,
                              status: event.target.value as ManagedContentStatus,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                )}

                {collectionName === "difficulty_policies" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Subject Scope (optional)
                      <select
                        value={formState.difficulty_policies.subjectId}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              subjectId: event.target.value,
                              topicId: "",
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">Global (all subjects)</option>
                        {VALIDATED_SUBJECTS.map((subj) => (
                          <option key={subj.id} value={subj.id}>
                            {subj.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Topic Scope (optional)
                      <select
                        value={formState.difficulty_policies.topicId}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              topicId: event.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="">All topics in scope</option>
                        {filteredPolicyTopics.map((topic) => (
                          <option key={topic.id} value={topic.id}>
                            {topic.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Minimum Completed Sessions
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formState.difficulty_policies.minimumCompletedSessions}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              minimumCompletedSessions: Number(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Maximum Hints for Increase
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formState.difficulty_policies.maxHintsForIncrease}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              maxHintsForIncrease: Number(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Increase Score Threshold
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formState.difficulty_policies.increaseScoreThreshold}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              increaseScoreThreshold: Number(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Decrease Score Threshold
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formState.difficulty_policies.decreaseScoreThreshold}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              decreaseScoreThreshold: Number(event.target.value),
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>

                    <label className="inline-flex min-h-11 items-center gap-2.5 text-sm font-bold text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={formState.difficulty_policies.arithmeticErrorAloneLowersDifficulty}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              arithmeticErrorAloneLowersDifficulty: event.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <span>Arithmetic error alone lowers difficulty</span>
                    </label>

                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Lifecycle Status
                      <select
                        value={formState.difficulty_policies.status}
                        onChange={(event) =>
                          updateForm((prev) => ({
                            ...prev,
                            difficulty_policies: {
                              ...prev.difficulty_policies,
                              status: event.target.value as ManagedContentStatus,
                            },
                          }))
                        }
                        className={inputClass}
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                )}
              </EditorSection>

              <EditorSection
                step="Section 2 of 2"
                title="Review and Save"
                description="Validate schema compliance and save your versioned changes."
              >
                {(collectionName === "formula_theorem_references" ||
                  collectionName === "socratic_prompt_bank") && (
                  <div
                    aria-label="Live content preview"
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Live Preview
                    </p>
                    <div className="text-sm text-slate-800 dark:text-slate-200">
                      {renderFormattedMath(
                        collectionName === "formula_theorem_references"
                          ? formState.formula_theorem_references.statement
                          : formState.socratic_prompt_bank.prompt,
                      )}
                    </div>
                  </div>
                )}

                {validationResult && (
                  <Alert tone={validationResult.valid ? "success" : "error"}>
                    {validationResult.valid ? (
                      <span>All validation checks passed — ready to save.</span>
                    ) : (
                      <ul className="list-disc space-y-1 pl-4">
                        {validationResult.messages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    )}
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleValidateContent}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 text-indigo-600" />
                    <span>Validate Content</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSaveChanges()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busyAction === "save" ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save aria-hidden="true" className="h-4 w-4" />
                    )}
                    <span>{busyAction === "save" ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              </EditorSection>
            </>
          )}

          {/* EXPANDABLE ADVANCED SETTINGS */}
          <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <summary className="cursor-pointer font-bold text-slate-900 dark:text-slate-100">
              Advanced Settings
            </summary>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Technical identifiers and bulk JSON import. Most authors can rely on the automatic identifiers populated in Section 1.
            </p>

            <datalist id="mg-subject-ids">
              {allSubjects.map((subj) => (
                <option key={subj.id} value={subj.id}>
                  {subj.name}
                </option>
              ))}
            </datalist>
            <datalist id="mg-topic-ids">
              {allTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </datalist>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Stable Record ID
                <input
                  type="text"
                  disabled={!isNew || isBusy}
                  value={recordId}
                  onChange={(event) => {
                    setManualRecordId(event.target.value);
                    setIdManuallyEdited(true);
                    setIsDirty(true);
                  }}
                  className={inputClass}
                />
              </label>

              {collectionName === "problems" && (
                <>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Subject ID Override
                    <input
                      type="text"
                      list="mg-subject-ids"
                      value={problem.subjectId}
                      onChange={(event) =>
                        updateProblem((prev) => ({ ...prev, subjectId: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Topic ID Override
                    <input
                      type="text"
                      list="mg-topic-ids"
                      value={problem.topicId}
                      onChange={(event) =>
                        updateProblem((prev) => ({ ...prev, topicId: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </label>
                </>
              )}

              {collectionName === "topics" && (
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Subject ID Override
                  <input
                    type="text"
                    disabled={isCoreValidatedTopic || isBusy}
                    list="mg-subject-ids"
                    value={formState.topics.subjectId}
                    onChange={(event) =>
                      updateForm((prev) => ({
                        ...prev,
                        topics: { ...prev.topics, subjectId: event.target.value },
                      }))
                    }
                    className={inputClass}
                  />
                </label>
              )}

              {collectionName === "difficulty_policies" && (
                <>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Subject ID Override
                    <input
                      type="text"
                      list="mg-subject-ids"
                      value={formState.difficulty_policies.subjectId}
                      onChange={(event) =>
                        updateForm((prev) => ({
                          ...prev,
                          difficulty_policies: {
                            ...prev.difficulty_policies,
                            subjectId: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Topic ID Override
                    <input
                      type="text"
                      list="mg-topic-ids"
                      value={formState.difficulty_policies.topicId}
                      onChange={(event) =>
                        updateForm((prev) => ({
                          ...prev,
                          difficulty_policies: {
                            ...prev.difficulty_policies,
                            topicId: event.target.value,
                          },
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </>
              )}
            </div>

            {collectionName === "problems" && (
              <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bulk JSON Draft Import
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Select a JSON array matching the typed problem-draft contract. Every topic and reference is checked against Firestore.
                </p>
                <input
                  type="file"
                  disabled={isBusy}
                  accept="application/json,.json"
                  aria-label="Bulk JSON import file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void file
                      .text()
                      .then((text) => {
                        const parsed = JSON.parse(text) as
                          | AdminImportProblemDraft[]
                          | { problems?: AdminImportProblemDraft[] };
                        const records = Array.isArray(parsed) ? parsed : parsed.problems;
                        if (!Array.isArray(records)) {
                          throw new Error("Choose a JSON array of problem drafts.");
                        }
                        setImportProblems(records);
                      })
                      .catch((cause) =>
                        setErrorMsg(formatErrorMessage(cause, "Could not parse JSON import file.")),
                      );
                  }}
                  className="mt-3 block w-full text-sm text-slate-700 dark:text-slate-300"
                />

                {importProblems.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleBulkImport(true)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                    >
                      {busyAction === "validate_import" && (
                        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
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
                      onClick={() => void handleBulkImport(false)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                    >
                      {busyAction === "import" && (
                        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      )}
                      <span>
                        {busyAction === "import" ? "Importing drafts..." : "Import drafts"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </details>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingNavTarget)}
        onOpenChange={(open) => {
          if (!open) setPendingNavTarget(null);
        }}
        variant="destructive"
        title="Discard unsaved changes?"
        description="Leaving or resetting the editor will discard your unsaved edits."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const target = pendingNavTarget;
          setPendingNavTarget(null);
          setIsDirty(false);
          if (target === "back") {
            navigate(`/admin/content/${collectionName}`);
          } else if (target === "reset") {
            resetFormToNew();
          }
        }}
      />
    </div>
  );
}

/**
 * Routed administrator Content Add/Edit page wrapped in {@link AdminShell} (`active="content"`).
 *
 * @returns The full administrator Content Editor page.
 */
export function SecureAdminContentEditor() {
  const params = useParams();
  const collectionName = resolveCollectionName(params.collection);

  return (
    <AdminShell active="content">
      <AdminContentEditor collectionName={collectionName} recordIdParam={params.recordId} />
    </AdminShell>
  );
}
