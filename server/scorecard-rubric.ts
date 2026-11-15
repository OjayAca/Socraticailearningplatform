import type {
  HintLevelNumber,
  ReasoningPhase,
  ScorecardCategory,
  Subject,
  SupportSummary,
} from "../packages/contracts/src/index";

/** Four equal criteria; score demonstrated learner mastery against observable evidence depth, verification, and independence. */
export const SCORECARD_RUBRIC = {
  accuracy: {
    phases:["guided_computation_or_proof","verification_and_checking"],
    strong:"21–25: Complete, correct computations or proof conclusion matching the mathematical reference.",
    adequate:"16–20: Substantially correct mathematical work with a minor notation or rounding omission.",
    weak:"6–15: Partial credit for valid intermediate calculation or proof steps despite an incorrect or incomplete final result.",
    incorrect:"0–5: Incorrect result with no valid intermediate steps, or no usable mathematical evidence.",
  },
  logicalValidity: {
    phases:["guided_computation_or_proof","verification_and_checking"],
    strong:"21–25: Every material implication is supported; assumptions and independent verification are explicit.",
    adequate:"16–20: Sound argument or calculation with a minor unstated link or verification omission.",
    weak:"6–15: Some valid steps but substantial gaps, bare symbolic steps without reasoning, or unsupported implications.",
    incorrect:"0–5: Circular, contradictory or invalid argument; no usable chain of reasoning.",
  },
  methodSelection: {
    phases:["method_selection","formula_theorem_justification"],
    strong:"21–25: Appropriate method with conditions explicitly linked to the actual givens; valid alternatives receive equal credit.",
    adequate:"16–20: Appropriate method with a concise justification or minor omission in applicability reasoning.",
    weak:"6–15: Relevant method named but conditions are weakly justified or partially mismatched.",
    incorrect:"0–5: Inapplicable method or no usable method evidence. Arithmetic mistakes alone do not lower this criterion.",
  },
  explanationQuality: {
    phases:["result_interpretation"],
    strong:"21–25: Thorough learner explanation of the result in context, including relevant units, scope and limitations.",
    adequate:"16–20: Understandable contextual explanation with a minor omission in scope or limitations.",
    weak:"6–15: Brief, surface-level, or partial explanation with an unsupported or unclear contextual interpretation.",
    incorrect:"0–5: No contextual interpretation or interpretation contradicts the problem.",
  },
} as const;

export interface CalibrationInput {
  assessedResponses: Array<{
    messageId: string;
    phase: ReasoningPhase;
    response?: { plainText?: string; latex?: string };
    evaluation?: { status?: string; attemptCount?: number; correctiveCycleCount?: number; selfCorrected?: boolean };
    diagnosis?: { category?: string };
  }>;
  gateEvaluations?: Partial<Record<ReasoningPhase, { attemptCount?: number; correctiveCycleCount?: number; outcome?: string; selfCorrected?: boolean }>>;
  supportHistory?: Array<{ phase?: ReasoningPhase; level?: string }>;
  math: "correct" | "incorrect" | "unsupported";
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * Maps an internal support level to its numerical hint tier (0..3).
 * Complete solution release is tracked separately via `solutionUnlocked`.
 *
 * @param level - Support level string.
 * @returns Numerical hint tier from 0 to 3.
 */
export function hintLevelNumberFor(level?: string): HintLevelNumber {
  if (level === "partial_step") return 3;
  if (level === "stronger_hint") return 2;
  if (level === "targeted_hint") return 1;
  return 0;
}

/**
 * Builds a structured support summary separating hint tiers (0..3) from solution unlock status,
 * counting corrective attempts, self-corrections, and whether the learner finished independently afterward.
 *
 * @param supportHistory - Recorded session support events.
 * @param gateEvaluations - Recorded gate evaluations for the session.
 * @param solutionUnlocked - Whether the complete solution has been unlocked.
 * @returns Structured `SupportSummary` object.
 */
export function buildSupportSummary(
  supportHistory: Array<{ phase?: ReasoningPhase; level?: string }> = [],
  gateEvaluations: Partial<Record<ReasoningPhase, { attemptCount?: number; correctiveCycleCount?: number; status?: string; selfCorrected?: boolean }>> = {},
  solutionUnlocked = false,
): SupportSummary {
  const hintsRequested = supportHistory.length;
  let highestHintLevel: HintLevelNumber = 0;
  for (const item of supportHistory) {
    const levelNum = hintLevelNumberFor(item.level);
    if (levelNum > highestHintLevel) highestHintLevel = levelNum;
  }
  const evaluations = Object.values(gateEvaluations);
  const correctiveAttempts = evaluations.reduce((sum, g) => sum + Number(g?.correctiveCycleCount ?? 0), 0);
  const selfCorrections = evaluations.filter(g => Boolean(g?.selfCorrected)).length;
  const allAccepted = evaluations.length > 0 && evaluations.every(g => g?.status === "accepted");
  // Completed independently after support if all stages were accepted and the final stage (result_interpretation)
  // did not require Level 2 or Level 3 hints.
  const finalStageHeavyHint = supportHistory.some(
    h => h.phase === "result_interpretation" && (h.level === "stronger_hint" || h.level === "partial_step"),
  );
  const completedIndependentlyAfterSupport = allAccepted && !finalStageHeavyHint;

  return {
    hintsRequested,
    highestHintLevel,
    solutionUnlocked,
    correctiveAttempts,
    selfCorrections,
    completedIndependentlyAfterSupport,
  };
}

/**
 * Deterministically selects the learner's strongest criterion and primary growth area
 * to synthesize an actionable next-practice recommendation.
 *
 * @param criteria - Calibrated criterion scores and feedback.
 * @param subject - Learner's current subject.
 * @param topic - Learner's current topic.
 * @param aiSuggestion - Optional AI-phrased recommendation to validate or refine.
 * @returns Actionable next-practice recommendation string.
 */
export function buildNextPracticeRecommendation(
  criteria: Record<ScorecardCategory, { score: number; reason: string; improvementAdvice: string }>,
  subject?: Subject | string,
  topic?: string,
  aiSuggestion?: string,
): string {
  const order: ScorecardCategory[] = ["accuracy", "logicalValidity", "methodSelection", "explanationQuality"];
  const labels: Record<ScorecardCategory, string> = {
    accuracy: "mathematical accuracy",
    logicalValidity: "logical validity and step verification",
    methodSelection: "formula and theorem selection",
    explanationQuality: "contextual explanation",
  };
  const practiceTargets: Record<ScorecardCategory, string> = {
    accuracy: `Try another ${topic || "practice"} problem focusing on step-by-step arithmetic and intermediate value checks.`,
    logicalValidity: `Try another ${topic || "practice"} problem where you justify each intermediate implication and write an explicit verification check.`,
    methodSelection: subject === "Discrete Mathematics"
      ? `Try another ${topic || "Discrete Mathematics"} problem that requires verifying theorem preconditions before starting the proof.`
      : `Try another ${topic || "Quantitative Methods"} problem that requires matching dataset assumptions to the governing formula.`,
    explanationQuality: subject === "Discrete Mathematics"
      ? `Try another ${topic || "Discrete Mathematics"} problem that requires explaining what your logical conclusion or set result means in context.`
      : `Try another ${topic || "Quantitative Methods"} problem that requires interpreting the meaning, units, and scope of a statistical result.`,
  };

  const sortedBest = [...order].sort((a, b) => criteria[b].score - criteria[a].score || order.indexOf(a) - order.indexOf(b));
  const sortedWeak = [...order].sort((a, b) => criteria[a].score - criteria[b].score || order.indexOf(a) - order.indexOf(b));
  const best = sortedBest[0];
  const weakest = sortedWeak[0];

  if (criteria[weakest].score >= 23) {
    return aiSuggestion?.trim()
      || `Your performance across ${labels[best]} and all reasoning criteria is strong. Advance to a more challenging ${topic || subject || "mathematics"} problem to deepen mastery.`;
  }

  const strengthClause = criteria[best].score >= 20 && best !== weakest
    ? `Your ${labels[best]} is strong (${criteria[best].score}/25). However, your ${labels[weakest]} (${criteria[weakest].score}/25) needs further development.`
    : `Focus next on strengthening your ${labels[weakest]} (${criteria[weakest].score}/25).`;

  return `${strengthClause} ${practiceTargets[weakest]}`;
}

/**
 * Deterministically bounds AI-generated criterion scores against observable learner evidence
 * so gate completion alone never inflates scores to 25/25 when explanations or verifications are shallow,
 * while preserving full accuracy credit when calculations are mathematically correct.
 *
 * @param score - Raw criterion scores and feedback generated by the scoring tutor.
 * @param input - Assessed learner responses, gate diagnostics, support usage, and math verification outcome.
 * @returns The calibrated scorecard object with bounded scores and actionable improvement advice.
 */
export function calibrateScorecard<T extends {
  accuracy: { score: number; reason: string; improvementAdvice: string };
  logicalValidity: { score: number; reason: string; improvementAdvice: string };
  methodSelection: { score: number; reason: string; improvementAdvice: string };
  explanationQuality: { score: number; reason: string; improvementAdvice: string };
}>(score: T, input: CalibrationInput): T {
  const acceptedText = (phases: readonly ReasoningPhase[]) =>
    input.assessedResponses
      .filter(r => r.evaluation?.status === "accepted" && phases.includes(r.phase))
      .map(r => [r.response?.plainText ?? "", r.response?.latex ?? ""].filter(Boolean).join(" ").trim())
      .join(" ")
      .trim();

  const effectiveCorrections = (phases: readonly ReasoningPhase[]) =>
    Math.max(
      0,
      ...phases.map(p => {
        const g = input.gateEvaluations?.[p];
        const raw = Number(g?.correctiveCycleCount ?? 0);
        // Independent self-correction of a single mistake is positive reasoning evidence
        return g?.selfCorrected && raw <= 2 ? Math.max(0, raw - 1) : raw;
      }),
    );

  const stageSupport = (phases: readonly ReasoningPhase[]) =>
    (input.supportHistory ?? []).filter(h => h.phase && phases.includes(h.phase));

  // Neutral socratic_prompt (Level 0) and a single targeted_hint (Level 1) do not trigger heavy support caps
  const hasHeavySupport = (phases: readonly ReasoningPhase[]) => {
    const substantive = stageSupport(phases).filter(h => h.level && h.level !== "socratic_prompt");
    return substantive.some(h => h.level === "stronger_hint" || h.level === "partial_step") || substantive.length >= 2;
  };

  const capCriterion = (
    criterion: { score: number; reason: string; improvementAdvice: string },
    ceiling: number,
    adviceIfCapped: string,
    reasonNoteIfAssisted?: string,
  ) => {
    if (criterion.score > ceiling) {
      criterion.score = ceiling;
      if (!criterion.improvementAdvice.trim() || /^(none|n\/?a|no improvement)/i.test(criterion.improvementAdvice.trim())) {
        criterion.improvementAdvice = adviceIfCapped;
      }
      if (reasonNoteIfAssisted && !/assist|hint|guidance/i.test(criterion.reason)) {
        criterion.reason = `${criterion.reason.replace(/[.]+$/, "")}; ${reasonNoteIfAssisted}`;
      }
    }
  };

  // 1. Explanation Quality (result_interpretation)
  const interpPhases = SCORECARD_RUBRIC.explanationQuality.phases;
  const interpText = acceptedText(interpPhases);
  const interpWords = wordsOf(interpText);
  const hasContextMeaning = /\b(per|each|every|share|sharing|equally|equal|weight|spread|deviat|dispersion|expect|repetition|long|run|guarantee|chance|likely|likelihood|because|since|requires|table|both|either|subset|population|sample|means|indicates|represents|implies|context|observation|member|outcome|element|function|input|output|image|preimage)\b/i.test(interpText);
  if (interpWords.length < 5 || interpText.length < 20 || !hasContextMeaning) {
    capCriterion(
      score.explanationQuality,
      12,
      "Explain what the computed result means in the real context of the problem, including relevant units and limitations, rather than only restating the value.",
    );
  } else if (hasHeavySupport(interpPhases) || effectiveCorrections(interpPhases) >= 2) {
    capCriterion(
      score.explanationQuality,
      18,
      "Practice formulating the contextual interpretation and its limitations independently without relying on hints.",
      "needed assistance formulating the contextual interpretation.",
    );
  } else if (interpWords.length < 12 || interpText.length < 60) {
    capCriterion(
      score.explanationQuality,
      20,
      "To reach full mastery (21–25), expand your interpretation to cover units, domain scope, and what the result does or does not guarantee.",
    );
  }

  // 2. Method Selection (method_selection, formula_theorem_justification)
  const methodPhases = SCORECARD_RUBRIC.methodSelection.phases;
  const methodText = acceptedText(methodPhases);
  const methodWords = wordsOf(methodText);
  const hasJustificationLink = /\b(because|since|equal|equally|contribute|importance|weight|independent|population|sample|requires|condition|assum|disjoint|every|all|either|both|substitut|order|applies|given|rule|definition|theorem|principle)\b/i.test(methodText);
  if (methodWords.length < 4 || !hasJustificationLink) {
    capCriterion(
      score.methodSelection,
      14,
      "Justify why your selected formula or theorem applies by explicitly connecting its required conditions to the problem's givens.",
    );
  } else if (hasHeavySupport(methodPhases) || effectiveCorrections(methodPhases) >= 2) {
    capCriterion(
      score.methodSelection,
      18,
      "Identify and justify the governing formula or theorem conditions independently before proceeding to calculation.",
      "needed assistance justifying why the method conditions apply.",
    );
  } else if (methodWords.length < 10 || methodText.length < 50) {
    capCriterion(
      score.methodSelection,
      20,
      "Explicitly state every precondition of the chosen method and match each one to the given information.",
    );
  }

  // 3. Logical Validity (guided_computation_or_proof, verification_and_checking)
  const compPhases = SCORECARD_RUBRIC.logicalValidity.phases;
  const compText = acceptedText(compPhases);
  const compWords = wordsOf(compText);
  const hasExplicitCheck = /\b(check|verif|complement|sum|total|revers|substitut|confirm|table|consistent|because|since|therefore|thus|implies)\b/i.test(compText)
    || input.assessedResponses.some(r => r.phase === "verification_and_checking" && r.evaluation?.status === "accepted");
  if (hasHeavySupport(compPhases) || effectiveCorrections(compPhases) >= 2) {
    capCriterion(
      score.logicalValidity,
      18,
      "Write out each intermediate logical or algebraic step and verify it independently.",
      "needed assistance completing or verifying the computation steps.",
    );
  } else if (compWords.length < 10 && !hasExplicitCheck) {
    capCriterion(
      score.logicalValidity,
      20,
      "Include an explicit verification step (such as an inverse check, complement check, or case check) alongside your derivation.",
    );
  }

  // 4. Accuracy (mathematical correctness of results & intermediate calculation steps, decoupled from hint dependence and verification prose)
  if (input.math === "incorrect") {
    const hasIntermediateSteps = compWords.length >= 4
      || (/[+\-*/^=]/.test(compText) && compText.trim().split(/\s+/).length >= 3);
    if (hasIntermediateSteps) {
      const partialAdvice = "Check the final arithmetic step against your intermediate setup and givens.";
      capCriterion(score.accuracy, 12, partialAdvice);
      if (score.accuracy.score < 6) {
        score.accuracy.score = 6;
        if (!score.accuracy.improvementAdvice.trim() || /^(none|n\/?a|no improvement)/i.test(score.accuracy.improvementAdvice.trim())) {
          score.accuracy.improvementAdvice = partialAdvice;
        }
      }
    } else {
      score.accuracy.score = 0;
    }
  } else if (input.math === "correct" && compWords.length < 6) {
    capCriterion(
      score.accuracy,
      20,
      "Write out intermediate calculation steps leading to your result.",
    );
  } else if (input.math === "unsupported" && compWords.length < 4 && !/[+\-*/^=]/.test(compText)) {
    capCriterion(
      score.accuracy,
      20,
      "Show the complete mathematical steps leading to your result.",
    );
  }

  return score;
}
