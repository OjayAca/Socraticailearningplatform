import {
  REASONING_PHASES,
  type ReasoningPhase,
  type SolverStage,
  type SolverStageProgress,
} from "@mindguide/contracts";

/**
 * Standardized student-facing definition for one of the four Socratic learning stages.
 */
export interface StandardSolverStage {
  readonly id: SolverStage;
  readonly number: string;
  readonly label: string;
  readonly description: string;
  readonly phases: readonly ReasoningPhase[];
  readonly completionPhases?: readonly string[];
}

/**
 * Computed student-facing stage progress item used by session progress indicators.
 */
export interface DisplayStageProgressItem {
  readonly stage: SolverStage;
  readonly number: string;
  readonly label: string;
  readonly description: string;
  readonly status: "completed" | "active" | "locked";
  readonly acceptedGates: number;
  readonly totalGates: number;
}

/**
 * Optional gate status shape read from `SessionProjection.gates` or Firestore `gateStates`.
 */
interface GateStatusRecord {
  readonly status?: string | null;
}

/**
 * Inputs for computing the four standardized UI stage progress indicators without altering backend contracts.
 */
export interface ComputeDisplayStageProgressInput {
  readonly currentPhase?: string | null;
  readonly gates?: Readonly<Record<string, GateStatusRecord | undefined>> | null;
  readonly stageProgress?: Readonly<Partial<Record<SolverStage, Partial<SolverStageProgress>>>> | null;
}

/**
 * Canonical student-facing definitions for the four Socratic learning stages.
 * Groups `verification_and_checking` together with `result_interpretation` in Stage 4
 * for student-facing UI clarity without mutating backend workflow contracts.
 */
export const STANDARD_SOLVER_STAGES: readonly StandardSolverStage[] = [
  {
    id: "problem_understanding",
    number: "01",
    label: "Understand the Problem",
    description:
      "Identify the given information and determine what needs to be solved.",
    phases: ["problem_understanding", "relevant_information_identification"],
  },
  {
    id: "method_selection",
    number: "02",
    label: "Choose and Justify",
    description:
      "Select the appropriate formula, theorem, principle, or mathematical method and explain why it applies.",
    phases: ["method_selection", "formula_theorem_justification"],
  },
  {
    id: "computation",
    number: "03",
    label: "Develop the Solution",
    description:
      "Perform the necessary computations, logical operations, or mathematical proofs.",
    phases: ["guided_computation_or_proof"],
  },
  {
    id: "interpretation",
    number: "04",
    label: "Check and Interpret",
    description:
      "Validate the result and explain its meaning in the context of the problem.",
    phases: ["verification_and_checking", "result_interpretation"],
    completionPhases: [
      "controlled_solution_release",
      "critical_thinking_scorecard",
    ],
  },
] as const;

const PHASE_TO_DISPLAY_STAGE: Record<string, SolverStage> = {
  problem_understanding: "problem_understanding",
  relevant_information_identification: "problem_understanding",
  method_selection: "method_selection",
  formula_theorem_justification: "method_selection",
  guided_computation_or_proof: "computation",
  computation: "computation",
  verification_and_checking: "interpretation",
  result_interpretation: "interpretation",
  interpretation: "interpretation",
  controlled_solution_release: "interpretation",
  critical_thinking_scorecard: "interpretation",
};

const COMPLETION_PHASES = new Set<string>([
  "controlled_solution_release",
  "critical_thinking_scorecard",
]);

const STANDARD_PHASE_LABELS: Record<string, string> = {
  problem_understanding: "Understand the Problem",
  relevant_information_identification: "Identify Given Information & Goal",
  method_selection: "Choose a Method",
  formula_theorem_justification: "Justify Formula or Theorem",
  guided_computation_or_proof: "Develop the Solution",
  verification_and_checking: "Verify and Check",
  result_interpretation: "Interpret the Result",
  controlled_solution_release: "Worked Solution",
  critical_thinking_scorecard: "Critical Thinking Scorecard",
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  ready_for_submission: "Ready to finish",
  submitted: "Submitted for review",
  reviewed: "Reviewed",
  returned: "Returned for follow-up",
  abandoned: "Ended early",
  expired: "Expired",
  completed: "Completed",
};

const CONTENT_COLLECTION_LABELS: Record<string, string> = {
  subjects: "Subjects",
  topics: "Topics",
  problems: "Problems",
  formula_theorem_references: "Formulas & Theorems",
  socratic_prompt_bank: "Socratic Prompts",
  misconception_categories: "Misconception Categories",
  difficulty_policies: "Difficulty Policies",
};

const COHORT_STATE_LABELS: Record<string, string> = {
  closed: "Closed (new sessions paused)",
  open: "Open for admitted students",
  drain: "Finishing active sessions only",
  "write-freeze": "All learning writes paused",
};

function humanizeToken(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Maps an internal workflow phase, completion phase, or stage identifier to its
 * standardized student-facing `SolverStage`, falling back to `"problem_understanding"`.
 *
 * @param phaseOrStage - Internal reasoning phase, completion phase, or stage ID.
 * @returns The standardized `SolverStage` identifier for UI display.
 */
export function displayStageForPhase(
  phaseOrStage: string | null | undefined,
): SolverStage {
  if (!phaseOrStage) return "problem_understanding";
  return PHASE_TO_DISPLAY_STAGE[phaseOrStage.trim()] ?? "problem_understanding";
}

/**
 * Returns the full standardized stage metadata for any phase or stage identifier.
 *
 * @param phaseOrStage - Internal reasoning phase, completion phase, or stage ID.
 * @returns Standardized stage metadata record.
 */
function displayStageInfo(
  phaseOrStage: string | null | undefined,
): StandardSolverStage {
  const stageId = displayStageForPhase(phaseOrStage);
  return (
    STANDARD_SOLVER_STAGES.find((stage) => stage.id === stageId) ??
    STANDARD_SOLVER_STAGES[0]
  );
}

/**
 * Returns the standardized student-facing stage title for a phase or stage ID.
 *
 * @param phaseOrStage - Internal reasoning phase, completion phase, or stage ID.
 * @returns Student-facing stage label.
 */
export function displayStageLabel(
  phaseOrStage: string | null | undefined,
): string {
  return displayStageInfo(phaseOrStage).label;
}

/**
 * Returns the standardized student-facing stage description for a phase or stage ID.
 *
 * @param phaseOrStage - Internal reasoning phase, completion phase, or stage ID.
 * @returns Student-facing stage description.
 */
export function displayStageDescription(
  phaseOrStage: string | null | undefined,
): string {
  return displayStageInfo(phaseOrStage).description;
}

/**
 * Maps an internal reasoning or completion phase token to a readable student-facing label.
 *
 * @param phase - Internal phase identifier.
 * @returns Plain-language label with safe fallback for unknown/legacy values.
 */
export function displayPhaseLabel(phase: string | null | undefined): string {
  const trimmed = phase?.trim();
  if (!trimmed) return "Reasoning checkpoint";
  return STANDARD_PHASE_LABELS[trimmed] ?? humanizeToken(trimmed);
}

/**
 * Computes the four standardized UI stage progress indicators while keeping backend contracts unchanged.
 * `verification_and_checking` is grouped with `result_interpretation` under Stage 4 ("Check and Interpret").
 *
 * @param input - Current phase, optional gate records, and optional backend stageProgress fallback.
 * @returns Ordered 4-element array of `DisplayStageProgressItem` records.
 */
export function computeDisplayStageProgress(
  input: ComputeDisplayStageProgressInput,
): DisplayStageProgressItem[] {
  const currentPhase = input.currentPhase?.trim() ?? "";
  const gates = input.gates ?? {};
  const fallbackProgress = input.stageProgress ?? {};

  const isCompletionPhase = COMPLETION_PHASES.has(currentPhase);
  const currentPhaseIndex = REASONING_PHASES.indexOf(
    currentPhase as ReasoningPhase,
  );
  const hasKnownReasoningPhase = currentPhaseIndex >= 0;
  const activeStage = displayStageForPhase(currentPhase);

  return STANDARD_SOLVER_STAGES.map((stage) => {
    const totalGates = stage.phases.length;

    if (isCompletionPhase) {
      return {
        stage: stage.id,
        number: stage.number,
        label: stage.label,
        description: stage.description,
        status: "completed",
        acceptedGates: totalGates,
        totalGates,
      };
    }

    if (hasKnownReasoningPhase) {
      let acceptedGates = 0;
      for (const phase of stage.phases) {
        const phaseIndex = REASONING_PHASES.indexOf(phase);
        const explicitStatus = gates[phase]?.status;
        const isAccepted =
          explicitStatus !== undefined && explicitStatus !== null
            ? explicitStatus === "accepted"
            : phaseIndex < currentPhaseIndex;
        if (isAccepted) {
          acceptedGates += 1;
        }
      }

      const isCompleted =
        acceptedGates === totalGates && stage.id !== activeStage;
      const status: DisplayStageProgressItem["status"] = isCompleted
        ? "completed"
        : stage.id === activeStage
          ? "active"
          : "locked";

      return {
        stage: stage.id,
        number: stage.number,
        label: stage.label,
        description: stage.description,
        status,
        acceptedGates,
        totalGates,
      };
    }

    // Fallback when currentPhase is missing or unrecognized: inspect backend stageProgress safely.
    const rawStage = fallbackProgress[stage.id];
    const fallbackStatus: DisplayStageProgressItem["status"] =
      rawStage?.status === "completed"
        ? "completed"
        : rawStage?.status === "active" || stage.id === activeStage
          ? "active"
          : "locked";
    const fallbackAccepted =
      typeof rawStage?.acceptedGates === "number"
        ? Math.min(totalGates, Math.max(0, rawStage.acceptedGates))
        : fallbackStatus === "completed"
          ? totalGates
          : 0;

    return {
      stage: stage.id,
      number: stage.number,
      label: stage.label,
      description: stage.description,
      status: fallbackStatus,
      acceptedGates: fallbackAccepted,
      totalGates,
    };
  });
}

/**
 * Computes the overall 0–100 completion percentage from the four standardized UI stages.
 *
 * @param items - Computed `DisplayStageProgressItem` list.
 * @returns Integer percentage between 0 and 100.
 */
export function computeDisplayProgressPercent(
  items: readonly DisplayStageProgressItem[],
): number {
  if (items.length === 0) return 0;
  const completedCount = items.filter(
    (item) => item.status === "completed",
  ).length;
  return Math.round((completedCount / items.length) * 100);
}

/**
 * Formats an internal session status value into plain, learner-friendly wording.
 *
 * @param status - Internal session status string.
 * @returns Human-readable session status label.
 */
export function displaySessionStatus(
  status: string | null | undefined,
): string {
  const trimmed = status?.trim();
  if (!trimmed) return "Unknown status";
  return SESSION_STATUS_LABELS[trimmed] ?? humanizeToken(trimmed);
}

/**
 * Formats an administrator managed-content collection identifier into a readable label.
 *
 * @param collection - Managed content collection name.
 * @returns Human-readable collection title.
 */
export function displayContentCollectionLabel(collection: string): string {
  return CONTENT_COLLECTION_LABELS[collection] ?? humanizeToken(collection);
}

/**
 * Formats a pilot cohort state identifier into a clear administrator-facing label.
 *
 * @param state - Cohort state token.
 * @returns Human-readable cohort state label.
 */
export function displayCohortStateLabel(state: string): string {
  return COHORT_STATE_LABELS[state] ?? humanizeToken(state);
}
