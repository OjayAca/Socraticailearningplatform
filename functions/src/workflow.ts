import type {
  Difficulty,
  DiagnosisCategory,
  DiagnosisResult,
  GateEvaluation,
  MathResponse,
  ReasoningPhase,
  ScorecardCategory,
  ScorecardCriterionResult,
  ScorecardResult,
  SessionDraft,
  SupportLevel,
} from "@mindguide/contracts";
import { REASONING_PHASES } from "@mindguide/contracts";
import { mathematicalEquivalent } from "./math.js";

export interface PrivateProblemReference {
  expectedConcepts: string[];
  requiredFormula?: string | null;
  requiredTheorem?: string | null;
  solutionSteps: string[];
  finalAnswer: string;
  interpretation: string;
  socraticPrompts?: Partial<Record<ReasoningPhase, string>>;
}

export interface GateState {
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

  if (combined.length < 8 || significant.length < 2) {
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
        accepted = hasReason && hasCondition && significant.length >= 6;
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
  if (!current) {
    return [
      "socratic_prompt",
      "targeted_hint",
      "stronger_hint",
      "partial_step",
      "worked_explanation",
      "full_solution",
    ];
  }
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
  const step = reference.solutionSteps[Math.min(REASONING_PHASES.indexOf(phase), Math.max(reference.solutionSteps.length - 1, 0))];
  const map: Record<SupportLevel, { title: string; content: string[] }> = {
    socratic_prompt: { title: "Socratic Prompt", content: [promptForPhase(phase, reference)] },
    targeted_hint: { title: "Targeted Hint", content: [`Focus on ${reference.expectedConcepts[0] ?? "the requested quantity"}.`] },
    stronger_hint: { title: "Stronger Hint", content: [reference.requiredFormula || reference.requiredTheorem || "Write the next operation or logical implication explicitly."] },
    partial_step: { title: "Partial Step", content: [step || "Set up the first justified step, then complete it using the given values."] },
    worked_explanation: { title: "Worked Explanation", content: reference.solutionSteps },
    full_solution: { title: "Full Solution and Interpretation", content: [...reference.solutionSteps, reference.finalAnswer, reference.interpretation] },
  };
  return map[level];
}

export function buildScorecard(options: {
  draft: SessionDraft;
  gates: GateStateMap;
  reference: PrivateProblemReference;
}): ScorecardResult {
  const gateEvidence = REASONING_PHASES.map((phase) => `${phaseLabel(phase)} was accepted.`);
  const answerText = options.draft.answer.normalizedLatex || options.draft.answer.latex || options.draft.answer.plainText;
  const accuracyPass =
    mathematicalEquivalent(answerText, options.reference.finalAnswer) ||
    normalize(answerText).includes(normalize(options.reference.finalAnswer));
  const make = (
    category: ScorecardCategory,
    score: number,
    evidence: string[],
    reason: string,
    advice: string
  ): ScorecardCriterionResult => ({
    category,
    score,
    evidence,
    reason,
    improvementAdvice: advice,
    confidence: category === "accuracy" && !accuracyPass ? "medium" : "high",
    source: "deterministic",
  });

  const criteria = {
    accuracy: make(
      "accuracy",
      accuracyPass ? 20 : 8,
      [accuracyPass ? "The final response is mathematically equivalent to the validated reference." : "The final response could not be verified as equivalent to the validated reference."],
      accuracyPass ? "The final result matches the validated answer." : "The submitted final result needs correction or clearer notation.",
      accuracyPass ? "Keep the checking step visible." : "Recheck the final calculation and submit an equivalent simplified result."
    ),
    logicalValidity: make("logicalValidity", 18, gateEvidence, "All required reasoning and verification gates were accepted.", "Keep each implication or calculation step explicit."),
    methodSelection: make("methodSelection", 18, ["Method selection was accepted by the reasoning gate.", "The saved methodology is supported by the accepted method and justification evidence."], "The selected method is relevant and connected to the accepted reasoning record.", "Name the method and continue connecting each operation to the given data."),
    justificationQuality: make("justificationQuality", 18, ["Formula/theorem justification was accepted."], "The response stated why the selected method applies.", "Continue naming the conditions that make the method valid."),
    interpretationQuality: make("interpretationQuality", 18, ["Result interpretation was accepted.", "The saved reflection is supported by the accepted interpretation and verification evidence."], "The result was interpreted in context and tied to the verified reasoning record.", "Continue explaining the implication of the result and what was verified."),
  } satisfies Record<ScorecardCategory, ScorecardCriterionResult>;
  const total = Object.values(criteria).reduce((sum, criterion) => sum + criterion.score, 0);
  return {
    criteria,
    total,
    feedback: accuracyPass
      ? "Your reasoning gates are complete and your final result matches the validated reference. Use the evidence above to strengthen future explanations."
      : "Your reasoning gates are complete, but the final result needs another verification pass before it matches the validated reference.",
    generatedAt: Date.now(),
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
}): { recommendedDifficulty: Difficulty; reason: string; confidence: "low" | "medium" | "high" } {
  const levels: Difficulty[] = ["Basic", "Intermediate", "Advanced"];
  const currentIndex = levels.indexOf(options.currentDifficulty);
  if (options.recentSessions.length < 2) {
    return {
      recommendedDifficulty: options.currentDifficulty,
      reason: "At least two completed sessions in this topic are required before changing difficulty.",
      confidence: "low",
    };
  }
  const recent = options.recentSessions.slice(0, 2);
  const major = new Set(["conceptual_error", "theorem_condition_violation", "invalid_logic", "skipped_reasoning"]);
  const majorDiagnoses = recent.flatMap((session) => session.diagnoses.filter((item) => major.has(item)));
  if (recent.every((session) => session.score >= 80 && session.supportUsage <= 1) && majorDiagnoses.length === 0) {
    return {
      recommendedDifficulty: levels[Math.min(currentIndex + 1, levels.length - 1)],
      reason: "Two strong topic sessions (80 or higher) were completed with limited support and no major conceptual or logical diagnosis.",
      confidence: "high",
    };
  }
  const repeatedMajor = majorDiagnoses.some((item, index) => majorDiagnoses.indexOf(item) !== index);
  if (recent.every((session) => session.score < 60) || repeatedMajor) {
    return {
      recommendedDifficulty: levels[Math.max(currentIndex - 1, 0)],
      reason: repeatedMajor
        ? "A major conceptual or logical diagnosis repeated across the two most recent topic sessions."
        : "The two most recent topic scorecards were below 60.",
      confidence: "high",
    };
  }
  return {
    recommendedDifficulty: options.currentDifficulty,
    reason: "Recent topic evidence does not meet the configured increase or remediation threshold.",
    confidence: "medium",
  };
}

export function promptForPhase(phase: ReasoningPhase, reference: PrivateProblemReference): string {
  return reference.socraticPrompts?.[phase] ?? {
    problem_understanding: "Restate the problem in your own words and identify what it asks you to determine.",
    relevant_information_identification: "Which values, variables, sets, propositions, or conditions are relevant, and what is unknown?",
    method_selection: "Which method, formula, theorem, or proof strategy should be used?",
    formula_theorem_justification: "Why do the formula or theorem conditions apply to this problem?",
    guided_computation_or_proof: "Show the next justified computation or proof step.",
    verification_and_checking: "How can you verify the calculation, cases, or logical conclusion?",
    result_interpretation: "What does the verified result mean in the context of the original problem?",
  }[phase];
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
