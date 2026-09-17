import type { RubricAssessment } from "./ai.js";
import type {
  Difficulty,
  DiagnosisCategory,
  DiagnosisResult,
  GateEvaluation,
  MathResponse,
  ReasoningPhase,
  ReleasedSolution,
  ScorecardCategory,
  ScorecardCriterionResult,
  ScorecardResult,
  SessionDraft,
  SupportLevel,
} from "@mindguide/contracts";
import { REASONING_PHASES } from "@mindguide/contracts";
import { checkAnswer, hasMathematicalStructure, type AnswerSpecification } from "./answers.js";

export interface PrivateProblemReference {
  answerSpecification?: AnswerSpecification;
  safeHints?: Partial<Record<ReasoningPhase, Partial<Record<SupportLevel, string[]>>>>;
  rubricVersion?: string;
  rubricCalibrationStatus?: "pending" | "calibrated";
  expectedConcepts: string[];
  requiredFormula?: string | null;
  requiredTheorem?: string | null;
  solutionSteps: string[];
  finalAnswer: string;
  interpretation: string;
  formulaTheoremConditions?: string[];
  socraticPrompts?: Partial<Record<ReasoningPhase, string>>;
  misconceptionPrompts?: Partial<Record<DiagnosisCategory, string>>;
}

interface GateState {
  status: "locked" | "pending" | "needs_revision" | "accepted";
  attemptCount: number;
  correctiveCycleCount: number;
  requiredResponseType: "text" | "math_or_text";
  acceptedAt: FirebaseFirestore.Timestamp | null;
}

export type GateStateMap = Record<ReasoningPhase, GateState>;

const REASON_WORDS = [
  "because",
  "since",
  "therefore",
  "applies",
  "given",
  "condition",
  "means",
  "shows",
  "so that",
];
const VERIFY_WORDS = [
  "check",
  "verify",
  "substitute",
  "recalculate",
  "truth table",
  "case",
  "consistent",
  "reasonable",
];
const INTERPRET_WORDS = [
  "means",
  "therefore",
  "in context",
  "represents",
  "indicates",
  "conclude",
  "result",
];

export function initialGateStates(): GateStateMap {
  return Object.fromEntries(
    REASONING_PHASES.map((phase, index) => [
      phase,
      {
        status: index === 0 ? "pending" : "locked",
        attemptCount: 0,
        correctiveCycleCount: 0,
        requiredResponseType:
          phase === "guided_computation_or_proof" || phase === "verification_and_checking"
            ? "math_or_text"
            : "text",
        acceptedAt: null,
      },
    ])
  ) as GateStateMap;
}

export function evaluateDeterministically(options: {
  phase: ReasoningPhase;
  response: MathResponse;
  problemText: string;
  reference: PrivateProblemReference;
  attemptCount: number;
  correctiveCycleCount: number;
}): {
  evaluation: GateEvaluation;
  diagnosis: DiagnosisResult;
  learnerMessage: string;
  requiresAI: boolean;
} {
  const { phase, response, problemText, reference } = options;
  const combined = `${response.plainText} ${response.normalizedLatex ?? response.latex ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const significant = combined.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const concepts = reference.expectedConcepts.map(normalize);
  const problemWords = problemText.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 4);
  let accepted = false;
  let confidence: "low" | "medium" | "high" = "high";
  let category: DiagnosisCategory = "none";
  let evidence = "The response provides phase-appropriate reasoning.";
  let correctivePrompt = promptForPhase(phase, reference);

  const symbolicWork = ["guided_computation_or_proof", "verification_and_checking"].includes(phase)
    && hasMathematicalStructure(response.normalizedLatex || response.latex || response.plainText);
  if (!symbolicWork && (combined.length < 8 || significant.length < 2)) {
    confidence = "low";
    category = "unsupported_response";
    evidence = "The response is too short to show assessable reasoning.";
    correctivePrompt = `Add the specific reasoning requested for ${phaseLabel(phase)}.`;
  } else {
    switch (phase) {
      case "problem_understanding": {
        const related = [...concepts, ...problemWords].some((word) => combined.includes(word));
        accepted = combined.length >= 24 && related;
        confidence = accepted ? "high" : combined.length >= 24 ? "medium" : "low";
        category = accepted ? "none" : "conceptual_error";
        evidence = accepted
          ? "The response restates the problem using relevant quantities or concepts."
          : "The response does not yet connect its explanation to the problem's quantities or goal.";
        break;
      }
      case "relevant_information_identification": {
        const hasVariableOrQuantity = /\d|variable|given|unknown|value|set|event|proposition|data/.test(combined);
        accepted = significant.length >= 4 && hasVariableOrQuantity;
        confidence = accepted ? "high" : "medium";
        category = accepted ? "none" : "misinterpreted_variable";
        evidence = accepted
          ? "The response identifies given information and a target quantity or object."
          : "The response does not clearly separate the given information from what must be found or proved.";
        break;
      }
      case "method_selection": {
        const methodTerms = [
          ...concepts,
          normalize(reference.requiredFormula ?? ""),
          normalize(reference.requiredTheorem ?? ""),
          "formula",
          "theorem",
          "method",
          "proof",
        ].filter(Boolean);
        accepted = methodTerms.some((word) => combined.includes(word));
        confidence = accepted ? "high" : significant.length >= 5 ? "medium" : "low";
        category = accepted ? "none" : "wrong_formula";
        evidence = accepted
          ? "The response names a method, formula, theorem, or proof strategy relevant to the reference."
          : "A relevant method, formula, theorem, or proof strategy has not been identified.";
        break;
      }
      case "formula_theorem_justification": {
        const hasReason = REASON_WORDS.some((word) => combined.includes(word));
        const hasCondition = /condition|assum|given|requires|valid|appl/.test(combined);
        const managedConditionTerms = (reference.formulaTheoremConditions ?? [])
          .flatMap((condition) => normalize(condition).split(" "))
          .filter((word) => word.length > 4);
        const referencesManagedCondition = managedConditionTerms.length === 0
          || managedConditionTerms.some((word) => combined.includes(word));
        accepted = hasReason && hasCondition && referencesManagedCondition && significant.length >= 6;
        confidence = accepted ? "high" : hasReason ? "medium" : "low";
        category = accepted ? "none" : "weak_justification";
        evidence = accepted
          ? "The response links the selected method to a stated condition or given fact."
          : "The response needs to explain why the method's conditions hold for this problem.";
        break;
      }
      case "guided_computation_or_proof": {
        const hasOperation = Boolean(response.latex) || /[=+\-*/<>]|therefore|suppose|case|implies|proof/.test(combined);
        accepted = hasOperation && significant.length >= 3;
        confidence = accepted ? "high" : "medium";
        category = accepted ? "none" : "skipped_reasoning";
        evidence = accepted
          ? "The response contains a computation or explicit proof-reasoning step."
          : "The response does not yet show the computation or proof step used to reach the result.";
        break;
      }
      case "verification_and_checking": {
        const hasVerification = VERIFY_WORDS.some((word) => combined.includes(word));
        accepted = hasVerification && significant.length >= 4;
        confidence = accepted ? "high" : "medium";
        category = accepted ? "none" : "procedural_error";
        evidence = accepted
          ? "The response describes a concrete check of the computation, cases, or logical result."
          : "The response needs a concrete verification method rather than only asserting that the answer is correct.";
        break;
      }
      case "result_interpretation": {
        const hasInterpretation = INTERPRET_WORDS.some((word) => combined.includes(word));
        accepted = hasInterpretation && significant.length >= 6;
        confidence = accepted ? "high" : "medium";
        category = accepted ? "none" : "incorrect_interpretation";
        evidence = accepted
          ? "The response explains what the result means in the problem context."
          : "The response needs to explain the result's meaning or implication in context.";
        break;
      }
    }
  }

  // Semantic phase acceptance must never be granted by keyword heuristics alone.
  // The deterministic pass cheaply rejects clearly inadequate input and sends
  // every otherwise plausible response to the reference-aware AI evaluator.
  const requiresAI = accepted || confidence === "medium";
  if (!accepted && reference.misconceptionPrompts?.[category]) {
    correctivePrompt = reference.misconceptionPrompts[category]!;
  }
  const status = "needs_revision" as const;
  const now = Date.now();
  return {
    evaluation: {
      phase,
      status,
      attemptCount: options.attemptCount,
      correctiveCycleCount: accepted ? options.correctiveCycleCount : options.correctiveCycleCount + 1,
      evidenceSummary: evidence,
      confidence,
      source: "deterministic",
      evaluatedAt: now,
      acceptedAt: null,
    },
    diagnosis: {
      category: accepted ? "none" : category,
      evidence: [evidence],
      confidence,
      severity: category === "none" ? "minor" : severityFor(category),
      targetPhase: phase,
      correctivePrompt: accepted ? "" : correctivePrompt,
      resolutionStatus: accepted ? "resolved" : "open",
      source: "deterministic",
    },
    learnerMessage: requiresAI
      ? "MINDGUIDE is verifying this reasoning against the problem reference."
      : correctivePrompt,
    requiresAI,
  };
}

export function supportLevelsFor(gates: GateStateMap): SupportLevel[] {
  const current = REASONING_PHASES.find((phase) => gates[phase].status !== "accepted");
  // Worked explanations and final answers are released only after the learner's
  // draft has been scored. Finishing the gates alone must not expose them.
  if (!current) return [];
  const gate = gates[current];
  const levels: SupportLevel[] = ["socratic_prompt"];
  if (gate.attemptCount >= 1) levels.push("targeted_hint");
  if (gate.correctiveCycleCount >= 2) levels.push("stronger_hint");
  if (gate.correctiveCycleCount >= 3) levels.push("partial_step");
  return levels;
}

export function supportContent(
  level: SupportLevel,
  phase: ReasoningPhase,
  reference: PrivateProblemReference
): { title: string; content: string[] } {
  const reviewed = reference.safeHints?.[phase]?.[level];
  if (reviewed?.length && !["worked_explanation", "full_solution"].includes(level)) return { title: "Reasoning support", content: reviewed };
  const map: Record<SupportLevel, { title: string; content: string[] }> = {
    socratic_prompt: { title: "Socratic Prompt", content: [promptForPhase(phase, reference)] },
    targeted_hint: { title: "Targeted Hint", content: [`Focus on ${reference.expectedConcepts[0] ?? "the requested quantity"}.`] },
    stronger_hint: { title: "Stronger Hint", content: [reference.requiredFormula || reference.requiredTheorem || "Write the next operation or logical implication explicitly."] },
    partial_step: { title: "Partial Step", content: ["Set up the next operation using the givens, leaving the result for you to calculate. Explain why this operation applies."] },
    worked_explanation: { title: "Worked Explanation", content: reference.solutionSteps },
    full_solution: { title: "Full Solution and Interpretation", content: [...reference.solutionSteps, reference.finalAnswer, reference.interpretation] },
  };
  return map[level];
}

export function buildScorecard(options: {
  draft: SessionDraft;
  gates: GateStateMap;
  reference: PrivateProblemReference;
  responses?: Array<{ id: string; phase: ReasoningPhase; text: string; accepted: boolean }>;
  assistanceCount?: number;
  assessment?: RubricAssessment;
}): ScorecardResult {
  const accuracyPass = checkAnswer(options.draft.answer, options.reference.answerSpecification);
  const responses = options.responses ?? [];
  const accepted = (phases: ReasoningPhase[]) => responses.filter(item => phases.includes(item.phase) && item.accepted);
  const make = (category: ScorecardCategory, score: number, evidence: string[]): ScorecardCriterionResult => ({
    category, score, evidence,
    reason: evidence.length ? "Draft formative indicators grounded in recorded learner work; faculty calibration is pending." : "Insufficient assessed evidence; no credit inferred from gate completion.",
    improvementAdvice: "Explain the selected method, its conditions, each operation, and how the result was checked.",
    confidence: "low", source: "deterministic",
  });
  const evidence = (items: typeof responses) => items.map(item => `Response ${item.id}: ${item.text.slice(0, 300)}`);
  const logic = accepted(["guided_computation_or_proof", "verification_and_checking"]);
  const method = accepted(["method_selection", "formula_theorem_justification"]);
  const explanation = accepted(["problem_understanding", "result_interpretation"]);
  const relevant = (text: string) => text.trim().length >= 30 && options.reference.expectedConcepts.some(concept => text.toLowerCase().includes(concept.toLowerCase()));
  const methodologySupported = relevant(options.draft.methodology);
  const reflectionSupported = relevant(options.draft.reflection);
  const criteria = {
    accuracy: make("accuracy", accuracyPass ? 25 : 0, [accuracyPass ? "Final draft answer matches the typed canonical reference." : "Final draft answer could not be verified against the canonical reference."]),
    logicalValidity: make("logicalValidity", new Set(logic.map(item => item.phase)).size * 6, evidence(logic)),
    methodSelection: make("methodSelection", methodologySupported ? Math.min(12, method.length * 6) : 0, [...evidence(method), `Final methodology: ${options.draft.methodology.slice(0, 300)}`]),
    explanationQuality: make("explanationQuality", reflectionSupported && methodologySupported ? Math.min(12, explanation.length * 6) : 0, [...evidence(explanation), `Final reflection: ${options.draft.reflection.slice(0, 300)}`]),
  };
  if (options.assessment) {
    for (const category of ["logicalValidity", "methodSelection", "explanationQuality"] as const) {
      const assessed = options.assessment[category];
      criteria[category] = { ...make(category, assessed.score, assessed.evidenceIds.map(id => `Assessed evidence: ${id}`)), reason: "Assessment of the referenced learner work using the versioned formative rubric.", source: "ai", confidence: "medium" };
    }
  }
  return { criteria, total: Object.values(criteria).reduce((sum, item) => sum + item.score, 0),
    rubricVersion: options.reference.rubricVersion ?? "pilot-v5-draft",
    calibrationStatus: options.reference.rubricCalibrationStatus ?? "pending", assistanceCount: options.assistanceCount ?? 0,
    feedback: options.reference.rubricCalibrationStatus === "calibrated" ? "Formative assessment using the reviewed rubric. Assistance is recorded separately." : "Formative indicators only; faculty calibration is pending. Assistance is recorded separately.", generatedAt: Date.now() };
}

export function buildReleasedSolution(reference: PrivateProblemReference): ReleasedSolution {
  const method = reference.requiredFormula || reference.requiredTheorem || reference.expectedConcepts[0] || "A problem-appropriate method";
  return {
    method,
    justification: `Use ${method} because the accepted justification established that its required conditions match the problem.`,
    steps: reference.solutionSteps,
    answer: reference.finalAnswer,
    verification: "Verify the computation or proof against the original givens and the conditions of the selected method.",
    interpretation: reference.interpretation,
    releasedAt: Date.now(),
  };
}

export function nextReasoningPhase(phase: ReasoningPhase): ReasoningPhase | null {
  const index = REASONING_PHASES.indexOf(phase);
  return REASONING_PHASES[index + 1] ?? null;
}

export function recommendDifficulty(options: {
  currentDifficulty: Difficulty;
  recentSessions: Array<{
    score: number;
    supportUsage: number;
    diagnoses: string[];
  }>;
  policy?: {
    minimumCompletedSessions: number;
    increaseScoreThreshold: number;
    decreaseScoreThreshold: number;
    maxHintsForIncrease: number;
    arithmeticErrorAloneLowersDifficulty: boolean;
  };
}): { recommendedDifficulty: Difficulty; reason: string; confidence: "low" | "medium" | "high" } {
  const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
  const currentIndex = levels.indexOf(options.currentDifficulty);
  const policy = options.policy ?? {
    minimumCompletedSessions: 2,
    increaseScoreThreshold: 80,
    decreaseScoreThreshold: 60,
    maxHintsForIncrease: 1,
    arithmeticErrorAloneLowersDifficulty: false,
  };
  if (!Number.isInteger(policy.minimumCompletedSessions) || policy.minimumCompletedSessions < 1 || policy.minimumCompletedSessions > 100 || policy.decreaseScoreThreshold >= policy.increaseScoreThreshold || policy.increaseScoreThreshold > 100 || policy.decreaseScoreThreshold < 0) throw new Error("Invalid adaptive-difficulty policy thresholds");
  if (options.recentSessions.length < policy.minimumCompletedSessions) {
    return {
      recommendedDifficulty: options.currentDifficulty,
      reason: `At least ${policy.minimumCompletedSessions} completed sessions in this topic are required before changing difficulty.`,
      confidence: "low",
    };
  }
  const recent = options.recentSessions.slice(0, policy.minimumCompletedSessions);
  const major = new Set(["conceptual_error", "theorem_condition_violation", "invalid_logic", "skipped_reasoning"]);
  if (policy.arithmeticErrorAloneLowersDifficulty) major.add("computational_error");
  const majorDiagnoses = recent.flatMap((session) => [...new Set(session.diagnoses.filter((item) => major.has(item)))]);
  if (recent.every((session) =>
    session.score >= policy.increaseScoreThreshold
    && session.supportUsage <= policy.maxHintsForIncrease
  ) && majorDiagnoses.length === 0) {
    return {
      recommendedDifficulty: levels[Math.min(currentIndex + 1, levels.length - 1)],
      reason: `${policy.minimumCompletedSessions} strong topic sessions met the configured score and support thresholds with no major conceptual or logical diagnosis.`,
      confidence: "high",
    };
  }
  const repeatedMajor = majorDiagnoses.some((item, index) => majorDiagnoses.indexOf(item) !== index);
  if (recent.every((session) => session.score < policy.decreaseScoreThreshold) || repeatedMajor) {
    return {
      recommendedDifficulty: levels[Math.max(currentIndex - 1, 0)],
      reason: repeatedMajor
        ? `A major diagnosis repeated across distinct sessions in the latest ${policy.minimumCompletedSessions} topic submissions.`
        : `The recent topic scorecards were below the configured threshold of ${policy.decreaseScoreThreshold}.`,
      confidence: "high",
    };
  }
  return {
    recommendedDifficulty: options.currentDifficulty,
    reason: "Recent topic evidence does not meet the configured increase or remediation threshold.",
    confidence: "medium",
  };
}

export function promptForPhase(
  phase: ReasoningPhase,
  reference: PrivateProblemReference,
  adjustment: "simplify" | "maintain" | "deepen" = "maintain"
): string {
  const base = reference.socraticPrompts?.[phase] ?? {
    problem_understanding: "Restate the problem in your own words and identify what it asks you to determine.",
    relevant_information_identification: "Which values, variables, sets, propositions, or conditions are relevant, and what is unknown?",
    method_selection: "Which method, formula, theorem, or proof strategy should be used?",
    formula_theorem_justification: "Why do the formula or theorem conditions apply to this problem?",
    guided_computation_or_proof: "Show the next justified computation or proof step.",
    verification_and_checking: "How can you verify the calculation, cases, or logical conclusion?",
    result_interpretation: "What does the verified result mean in the context of the original problem?",
  }[phase];
  if (adjustment === "simplify") {
    const scaffold: Record<ReasoningPhase, string> = {
      problem_understanding: "Focus on one thing first: what is the problem asking you to find or prove?",
      relevant_information_identification: "Separate the givens from the unknown. Which single value, variable, set, or condition belongs in each group?",
      method_selection: "Name one formula, theorem, or proof strategy that connects the givens to the goal.",
      formula_theorem_justification: "State one required condition for that method, then point to where the problem satisfies it.",
      guided_computation_or_proof: "Write only the next justified calculation or logical step.",
      verification_and_checking: "Choose one concrete check: substitution, recomputation, a case check, or validation of a proof condition.",
      result_interpretation: "Complete this sentence in the problem's context: ‘This result means …’",
    };
    return `${base} ${scaffold[phase]}`;
  }
  if (adjustment === "deepen") {
    return `${base} Also explain why your response would still be valid under the problem's stated conditions.`;
  }
  return base;
}

function severityFor(category: DiagnosisCategory): "minor" | "moderate" | "major" {
  if (["conceptual_error", "theorem_condition_violation", "invalid_logic", "skipped_reasoning"].includes(category)) return "major";
  if (["wrong_formula", "procedural_error", "misinterpreted_variable", "incorrect_interpretation"].includes(category)) return "moderate";
  return "minor";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function phaseLabel(phase: ReasoningPhase): string {
  return phase.replaceAll("_", " ");
}
