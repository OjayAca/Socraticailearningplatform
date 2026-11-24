import type {
  HintLevelNumber,
  ReasoningPhase,
  ScorecardCategory,
  Subject,
  SupportSummary,
} from "../packages/contracts/src/index";
import { hasExplicitVerification } from "./tutor-dialogue";

/** Four equal criteria; score demonstrated learner mastery against observable process and outcome evidence. */
export const SCORECARD_RUBRIC = {
  accuracy: {
    phases:["guided_computation_or_proof","verification_and_checking"],
    strong:"21–25: Complete, accurate computations or proof conclusion matching the mathematical reference without repeated errors or heavy hints.",
    adequate:"16–20: Substantially correct mathematical work with a single corrected slip, light hint, or minor notation omission.",
    weak:"6–15: Partial credit for valid intermediate calculation or proof steps despite an incorrect result, multiple errors, or strategic hint support.",
    incorrect:"0–5: Incorrect result with no valid intermediate steps, or no usable mathematical evidence.",
  },
  logicalValidity: {
    phases:["guided_computation_or_proof","verification_and_checking"],
    strong:"21–25: Every material implication is supported; assumptions and independent verification are explicit.",
    adequate:"16–20: Sound argument or calculation with a minor unstated link or verification omission.",
    weak:"6–15: Some valid steps but substantial gaps, missing verification, repeated errors, or heavy hint reliance.",
    incorrect:"0–5: Circular, contradictory or invalid argument; no usable chain of reasoning.",
  },
  methodSelection: {
    phases:["method_selection","formula_theorem_justification"],
    strong:"21–25: Appropriate method with conditions explicitly linked to the actual givens on initial reasoning; valid alternatives receive equal credit.",
    adequate:"16–20: Appropriate method with a concise justification, single corrected slip, or minor omission in applicability reasoning.",
    weak:"6–15: Relevant method named after wrong-formula attempts, weak justification, or strategic/procedural hint reliance.",
    incorrect:"0–5: Inapplicable method or no usable method evidence.",
  },
  explanationQuality: {
    phases:["verification_and_checking","result_interpretation"],
    strong:"21–25: Thorough learner explanation of the result in context, including relevant units, scope and limitations.",
    adequate:"16–20: Understandable contextual explanation with a minor omission in scope, units, or limitations.",
    weak:"6–15: Brief, surface-level, or partial explanation with an unsupported, heavily hinted, or unclear contextual interpretation.",
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
  // Completed independently if all stages were accepted without Level 2/3 hints or multiple substantive hints across any stage.
  const substantiveHints = supportHistory.filter(h => h.level && h.level !== "socratic_prompt");
  const anyHeavyHint = substantiveHints.some(h => h.level === "stronger_hint" || h.level === "partial_step") || substantiveHints.length >= 2;
  const completedIndependentlyAfterSupport = allAccepted && !anyHeavyHint;

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
 * Deterministically bounds AI-generated criterion scores against observable process and outcome evidence
 * so gate completion alone never inflates scores when earlier errors, heavy hints, omitted verification,
 * or shallow explanations occurred.
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

  const stageCorrections = (phases: readonly ReasoningPhase[]) =>
    phases.reduce((sum, p) => sum + Number(input.gateEvaluations?.[p]?.correctiveCycleCount ?? 0), 0);

  const stageSubstantiveHints = (phases: readonly ReasoningPhase[]) =>
    (input.supportHistory ?? []).filter(
      h => h.phase && phases.includes(h.phase) && h.level && h.level !== "socratic_prompt",
    );

  const highestStageHint = (phases: readonly ReasoningPhase[]) =>
    stageSubstantiveHints(phases).reduce<number>((max, h) => Math.max(max, hintLevelNumberFor(h.level)), 0);

  const processCap = (
    phases: readonly ReasoningPhase[],
    cleanSelfCorrectionCeiling = 21,
  ): { ceiling: number; note: string; advice: string } | null => {
    const corrections = stageCorrections(phases);
    const hints = stageSubstantiveHints(phases);
    const maxHint = highestStageHint(phases);
    const cleanSelfCorrection = corrections === 1
      && hints.length === 0
      && phases.some(p => Boolean(input.gateEvaluations?.[p]?.selfCorrected));

    if (corrections >= 3 || maxHint >= 3) {
      return {
        ceiling: 8,
        note: "required repeated corrective attempts or procedural hint support",
        advice: "Practice completing this reasoning stage independently before advancing.",
      };
    }
    if (corrections >= 2 || maxHint >= 2 || hints.length >= 2) {
      return {
        ceiling: 12,
        note: "required multiple corrections or strategic hint guidance",
        advice: "Review the underlying rules and work through similar steps without hints.",
      };
    }
    if (cleanSelfCorrection) {
      return {
        ceiling: cleanSelfCorrectionCeiling,
        note: "corrected an earlier mistake independently",
        advice: "Double-check your initial reasoning before submitting to catch slips on the first try.",
      };
    }
    if (corrections === 1 || maxHint === 1) {
      return {
        ceiling: 16,
        note: "required correction or hint assistance",
        advice: "Verify each condition and step carefully before submitting.",
      };
    }
    return null;
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
      if (reasonNoteIfAssisted && !/assist|hint|guidance|correction|corrected/i.test(criterion.reason)) {
        criterion.reason = `${criterion.reason.replace(/[.]+$/, "")}; ${reasonNoteIfAssisted}`;
      }
    }
  };

  // 1. Explanation Quality (verification_and_checking, result_interpretation)
  const interpPhases = SCORECARD_RUBRIC.explanationQuality.phases;
  const interpOnlyText = acceptedText(["result_interpretation"]) || acceptedText(interpPhases);
  const interpWords = wordsOf(interpOnlyText);
  const hasContextMeaning = /\b(?:per\s+\w+|share|equally|equal[\s-]share|weight|spread|variability|dispersion|deviat|expect|long[\s-]run|guarantee|chance|likel(?:y|ihood)|proportion|percent|average|typical|most\s+common|most\s+frequent|hours?|minutes?|days?|learners?|students?|units?|scope|limit(?:ation)?|context|represents?|describes?|indicates?|summariz|population|sample|subset|member|observation|outcome|element|event|image|preimage|equivalence|contradiction|conjunction|disjunction|implies)\b/i.test(interpOnlyText);

  const interpProcess = processCap(interpPhases);
  if (interpProcess) {
    capCriterion(
      score.explanationQuality,
      interpProcess.ceiling,
      interpProcess.advice,
      `${interpProcess.note} in the final stage.`,
    );
  }
  const stage1Phases: readonly ReasoningPhase[] = ["problem_understanding", "relevant_information_identification"];
  if (stageCorrections(stage1Phases) >= 2 || highestStageHint(stage1Phases) >= 2) {
    capCriterion(
      score.explanationQuality,
      18,
      "Identify the problem goal and givens clearly before interpreting the result.",
      "needed guidance clarifying the initial problem givens.",
    );
  }
  if (interpWords.length < 5 || interpOnlyText.length < 20 || !hasContextMeaning) {
    capCriterion(
      score.explanationQuality,
      10,
      "Explain what the computed result means in the real context of the problem, including relevant units and limitations, rather than only restating the value.",
    );
  } else if (interpWords.length < 12 || interpOnlyText.length < 60) {
    capCriterion(
      score.explanationQuality,
      18,
      "To reach full mastery (21–25), expand your interpretation to cover units, domain scope, and what the result does or does not guarantee.",
    );
  }

  // 2. Method Selection (method_selection, formula_theorem_justification)
  const methodPhases = SCORECARD_RUBRIC.methodSelection.phases;
  const methodText = acceptedText(methodPhases);
  const methodWords = wordsOf(methodText);
  const hasJustificationLink = /\b(?:because|since|requires?|propositions?|connectives?|conjunction|disjunction|negation|biconditional|truth\s+value|equal(?:ly)?|weight|contribute|importance|independent|population|sample|bessel|condition|assum|disjoint|mutually\s+exclusive|order|replacement|distinct|frequency|probability|substitut|implication|truth\s+table|contrapositive|definition|theorem|principle|precondition|complete)\b/i.test(methodText);

  const methodProcess = processCap(methodPhases);
  if (methodProcess) {
    capCriterion(
      score.methodSelection,
      methodProcess.ceiling,
      methodProcess.advice,
      `${methodProcess.note} justifying why the method conditions apply.`,
    );
  }
  if (methodWords.length < 4 || !hasJustificationLink) {
    capCriterion(
      score.methodSelection,
      12,
      "Justify why your selected formula or theorem applies by explicitly connecting its required conditions to the problem's givens.",
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
  const verificationCheckText = acceptedText(["guided_computation_or_proof", "verification_and_checking", "result_interpretation"]);
  const hasExplicitCheck = hasExplicitVerification({ plainText: verificationCheckText });

  const logicProcess = processCap(compPhases);
  if (logicProcess) {
    capCriterion(
      score.logicalValidity,
      logicProcess.ceiling,
      logicProcess.advice,
      `${logicProcess.note} completing or verifying the computation steps.`,
    );
  }
  if (!hasExplicitCheck) {
    capCriterion(
      score.logicalValidity,
      16,
      "Include an explicit verification step (such as an inverse check, complement check, or case check) alongside your derivation.",
    );
  }

  // 4. Accuracy (Process + Outcome: mathematical correctness of final result AND errors/hints during computation)
  const compOnlyPhases: readonly ReasoningPhase[] = ["guided_computation_or_proof"];
  const compOnlyText = acceptedText(compOnlyPhases) || compText;
  const compOnlyWords = wordsOf(compOnlyText);
  if (input.math === "incorrect") {
    const hasIntermediateSteps = compOnlyWords.length >= 4
      || (/[+\-*/^=]/.test(compOnlyText) && compOnlyText.trim().split(/\s+/).length >= 3);
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
  } else {
    const accuracyProcess = processCap(compOnlyPhases, 20);
    if (accuracyProcess) {
      capCriterion(
        score.accuracy,
        accuracyProcess.ceiling,
        "Check each intermediate arithmetic or algebraic step carefully before submitting.",
        `${accuracyProcess.note} during computation.`,
      );
    }
    if (input.math === "correct" && compOnlyWords.length < 6) {
      capCriterion(
        score.accuracy,
        20,
        "Write out intermediate calculation steps leading to your result.",
      );
    } else if (input.math === "unsupported" && compOnlyWords.length < 4 && !/[+\-*/^=]/.test(compOnlyText)) {
      capCriterion(
        score.accuracy,
        20,
        "Show the complete mathematical steps leading to your result.",
      );
    }
  }

  return score;
}
