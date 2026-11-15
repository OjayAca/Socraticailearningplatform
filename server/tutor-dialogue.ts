import {
  solverStageForPhase,
  type DiagnosisCategory,
  type MathResponse,
  type ReasoningPhase,
  type ResponseOutcome,
  type SolverStage,
  type Subject,
} from "../packages/contracts/src/index";
import type { MethodReference } from "../src/lib/learning/method-references";
import type { Turn } from "./gemini";

// Recognize standalone help requests. A reply that also contains mathematical work
// goes through ordinary assessment, even if it asks for confirmation or help.
export function asksForHint(plainText: string, latex?: string) {
  if (latex?.trim()) return false;
  const words = plainText.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:(?:i dont know|im stuck|i am stuck)(?:\s+|$))?(?:(?:please )?(?:help(?: me)?|can you help(?: me)?|(?:can i (?:have|get)|i need|give me) (?:a |another )?hint|hint)(?: please)?)?$/.test(words) && !!words;
}

export interface StageReference {
  expectedConcepts?: string[];
  requiredFormula?: string | null;
  requiredTheorem?: string | null;
  formulaTheoremConditions?: string[];
  methodReference?: MethodReference | null;
  sourceGuidance?: {
    assumptions?: string;
    approvedStatements?: string[];
    alternativeMethods?: unknown;
    commonMisconceptions?: unknown[];
  };
  socraticPrompts?: Partial<Record<ReasoningPhase, string>>;
  safeHints?: Partial<Record<ReasoningPhase, Partial<Record<string, string[]>>>>;
}

export interface HintContext {
  subject?: Subject;
  problemText?: string;
  demonstrated?: string[];
  lastDiagnosis?: {
    category?: DiagnosisCategory;
    incorrectStep?: string | null;
    explanation?: string;
    resolutionStatus?: string;
  } | null;
  recoveryMode?: boolean;
}

const METHOD_FILLER_WORDS = new Set([
  "i", "will", "would", "want", "to", "should", "can", "use", "apply", "select", "choose", "try",
  "the", "a", "an", "formula", "method", "theorem", "principle", "rule", "measure", "solve", "find",
  "calculate", "this", "problem", "here", "is", "for", "dataset", "data", "set",
]);

const CONDITION_STOPWORDS = new Set([
  "each", "that", "with", "from", "this", "have", "has", "are", "when", "must", "only", "into",
  "over", "does", "not", "data", "set", "sets", "value", "values", "given", "problem", "they",
  "their", "there", "these", "those", "every", "both", "more", "than", "then",
]);

/** Canonical semantic equivalence classes for formula/theorem conditions across QM and DM. */
const SEMANTIC_EQUIVALENCE_CLASSES: readonly (readonly string[])[] = [
  ["equal weight", "equal weights", "equally weighted", "contribute equally", "contributes equally", "same importance", "equal importance", "uniform weight", "equal share", "shared equally", "weighted equally", "same weight"],
  ["full population", "entire population", "entire group", "every member", "all members", "whole population", "whole group", "complete population"],
  ["sample", "subset of the population", "subset of the group", "bessel correction", "n minus 1", "n - 1", "sample variance"],
  ["equally likely", "equal probability", "uniform probability", "same chance", "equal chance", "fair die", "fair coin", "unbiased"],
  ["order matters", "arrangement matters", "sequence matters", "distinct positions", "different order", "ordered selection"],
  ["order does not matter", "unordered", "order is irrelevant", "order doesnt matter", "committee", "subset selection"],
  ["without replacement", "no replacement", "cannot repeat", "no repetition", "distinct objects"],
  ["mutually exclusive", "disjoint", "cannot occur together", "no overlap", "empty intersection"],
  ["in either set", "at least one set", "in a or b", "combine elements", "union"],
  ["in both sets", "common elements", "shared elements", "in a and b", "simultaneous membership"],
  ["truth table", "truth assignment", "logical equivalence", "contrapositive", "both propositions are true", "at least one proposition is true"],
];

export interface ConditionEquivalenceEvaluation {
  matched: boolean;
  contradicted: boolean;
  matchedCondition?: string;
  contradictionReason?: string;
  alternativeRecognized?: boolean;
}

function tokenizeWords(text?: string | null): string[] {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function normalizePhrase(text?: string | null): string {
  return (text ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Evaluates whether a learner response expresses a mathematically equivalent condition,
 * an accepted alternative method, or a negated/contradictory condition.
 *
 * @param response - Learner response containing plain text and/or LaTeX.
 * @param reference - Optional private problem reference with conditions and equivalences.
 * @returns Structured equivalence evaluation accounting for negation and contradiction.
 */
export function evaluateConditionEquivalence(
  response: MathResponse,
  reference?: StageReference,
): ConditionEquivalenceEvaluation {
  const rawText = [response.plainText, response.latex ?? ""].join(" ").trim();
  const normalized = normalizePhrase(rawText);
  if (!normalized) return { matched: false, contradicted: false };

  const methodName = normalizePhrase(reference?.requiredFormula || reference?.requiredTheorem || reference?.methodReference?.name);

  // 1. Check explicit contradictions against the method's required conditions
  if (methodName.includes("mean")) {
    if (/\b(?:not|never|dont|do not|cannot)\s+(?:have\s+)?(?:equal\s+weight|contribute\s+equally|same\s+importance|equally\s+weighted)\b|\b(?:unequal|different)\s+(?:weight|weights|importance)\b/i.test(normalized)) {
      return {
        matched: false,
        contradicted: true,
        contradictionReason: "The response states that observations have unequal weights, which contradicts the equal-weighting condition of the arithmetic mean.",
      };
    }
  }
  if (methodName.includes("population variance") || methodName.includes("population standard deviation")) {
    if (/\b(?:only\s+a\s+sample|just\s+a\s+sample|is\s+a\s+sample|subset\s+of\s+the\s+(?:population|group)|not\s+the\s+(?:full|entire|whole)\s+(?:population|group))\b/i.test(normalized)
      && !/\b(?:not\s+(?:only\s+)?a\s+sample|rather\s+than\s+a\s+sample|instead\s+of\s+a\s+sample)\b/i.test(normalized)) {
      return {
        matched: false,
        contradicted: true,
        contradictionReason: "The response claims the observations are only a sample, which contradicts the full-population condition.",
      };
    }
  }
  if (methodName.includes("sample variance") || methodName.includes("sample standard deviation")) {
    if (/\b(?:entire\s+population|full\s+population|whole\s+population|every\s+member\s+of\s+the\s+population)\b/i.test(normalized)
      && !/\b(?:not\s+the\s+(?:entire|full|whole)\s+population|subset\s+of\s+the\s+(?:entire|full)\s+population|sample\s+from\s+the\s+population)\b/i.test(normalized)) {
      return {
        matched: false,
        contradicted: true,
        contradictionReason: "The response claims the dataset is the full population rather than a sample.",
      };
    }
  }
  if (methodName.includes("permutation")) {
    if (/\b(?:order\s+does\s+not\s+matter|order\s+doesnt\s+matter|order\s+is\s+irrelevant|unordered|with\s+replacement)\b/i.test(normalized)) {
      return {
        matched: false,
        contradicted: true,
        contradictionReason: "Permutations without replacement require that order matters and items cannot repeat.",
      };
    }
  }
  if (methodName.includes("combination")) {
    if (/\b(?:order\s+matters|arrangement\s+matters|sequence\s+matters)\b/i.test(normalized)
      && !/\b(?:not|does\s+not|doesnt|never|without)\b/i.test(normalized)) {
      return {
        matched: false,
        contradicted: true,
        contradictionReason: "Combinations apply when selection order does not matter.",
      };
    }
  }
  if (methodName.includes("probability")) {
    if (/\b(?:not\s+equally\s+likely|unequal\s+chance|different\s+probabilities|biased)\b/i.test(normalized)) {
      return {
        matched: false,
        contradicted: true,
        contradictionReason: "The ratio of favorable to total outcomes requires equally likely outcomes.",
      };
    }
  }

  // Generic negation guard before a matched phrase
  const isNegatedPhrase = (phrase: string) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (phrase.includes("not ") || phrase.includes("no ") || phrase.includes("without ")) {
      return new RegExp(`\\b(?:not|never|false\\s+that)\\s+${escaped}\\b`, "i").test(normalized);
    }
    return new RegExp(`\\b(?:not|no|never|without|unequal|neither|nor|dont|do not|does not|doesnt|cannot|cant|isnt|arent)\\s+(?:[a-z]+\\s+){0,2}${escaped}\\b`, "i").test(normalized);
  };

  // 2. Check method-specific equivalent condition phrases from MethodReference
  const methodEquivalences = reference?.methodReference?.equivalentConditions ?? [];
  for (const group of methodEquivalences) {
    for (const phrase of group) {
      const normPhrase = normalizePhrase(phrase);
      if (normPhrase && normalized.includes(normPhrase) && !isNegatedPhrase(normPhrase)) {
        return { matched: true, contradicted: false, matchedCondition: phrase };
      }
    }
  }

  // 3. Check global semantic equivalence classes when relevant to reference conditions
  const referenceConditionsText = normalizePhrase([
    ...(reference?.formulaTheoremConditions ?? []),
    ...(reference?.methodReference?.conditions ?? []),
    ...(reference?.sourceGuidance?.approvedStatements ?? []),
    reference?.sourceGuidance?.assumptions ?? "",
  ].join(" "));

  for (const eqClass of SEMANTIC_EQUIVALENCE_CLASSES) {
    const classAppliesToProblem = !referenceConditionsText
      || eqClass.some(p => referenceConditionsText.includes(normalizePhrase(p)))
      || (methodName.includes("mean") && eqClass[0] === "equal weight");
    if (!classAppliesToProblem) continue;
    for (const phrase of eqClass) {
      const normPhrase = normalizePhrase(phrase);
      if (normPhrase && normalized.includes(normPhrase) && !isNegatedPhrase(normPhrase)) {
        return { matched: true, contradicted: false, matchedCondition: phrase };
      }
    }
  }

  // 4. Check alternative methods recognition
  const alternatives: string[] = [
    ...(reference?.methodReference?.alternativeMethods ?? []),
    ...(Array.isArray(reference?.sourceGuidance?.alternativeMethods)
      ? reference!.sourceGuidance!.alternativeMethods.map(String)
      : typeof reference?.sourceGuidance?.alternativeMethods === "string"
        ? [reference.sourceGuidance.alternativeMethods]
        : []),
  ];
  for (const alt of alternatives) {
    const altWords = tokenizeWords(alt).filter(w => w.length >= 4 && !METHOD_FILLER_WORDS.has(w));
    if (altWords.length > 0 && altWords.some(w => normalized.includes(w)) && tokenizeWords(normalized).length >= 5) {
      return { matched: true, contradicted: false, alternativeRecognized: true, matchedCondition: alt };
    }
  }

  return { matched: false, contradicted: false };
}

/**
 * Generates a condition-probing question tailored to the specific formula, theorem, or subject
 * when a student names a method without explaining why its conditions hold.
 *
 * @param reference - Optional stage reference with formula/theorem metadata.
 * @param subject - Optional subject ("Quantitative Methods" or "Discrete Mathematics").
 * @returns A targeted Socratic question asking why the method's conditions apply.
 */
export function conditionPromptForMethod(reference?: StageReference, subject?: Subject): string {
  if (reference?.socraticPrompts?.formula_theorem_justification) {
    return reference.socraticPrompts.formula_theorem_justification;
  }
  const rawName = (reference?.methodReference?.name || reference?.requiredFormula || reference?.requiredTheorem || "").trim();
  const lowerName = rawName.toLowerCase();
  if (lowerName.includes("mean")) {
    return "Why is the arithmetic mean appropriate for this dataset?";
  }
  if (lowerName.includes("variance") || lowerName.includes("standard deviation")) {
    return `Why is the ${lowerName} formula appropriate for these observations, and how do the givens determine the denominator?`;
  }
  if (lowerName.includes("permutation") || lowerName.includes("combination")) {
    return `Why does ${lowerName} apply here—specifically, how do order and replacement behave in this problem?`;
  }
  if (lowerName.includes("probability")) {
    return "Why is the equally likely probability formula appropriate for the outcomes in this problem?";
  }
  const domain = subject ?? reference?.methodReference?.domain;
  if (domain === "Discrete Mathematics") {
    return rawName && rawName.length <= 45
      ? `Which definition or theorem conditions make ${rawName} applicable to the given statements or sets?`
      : "Which definition or theorem conditions are satisfied by the given statements, and how do they support your proof strategy?";
  }
  if (domain === "Quantitative Methods") {
    return rawName && rawName.length <= 45
      ? `Why is ${rawName} appropriate for this dataset, and how do the given variables satisfy its assumptions?`
      : "How do the given variables and assumptions make your chosen formula appropriate for this problem?";
  }
  return "How does the method you chose connect the given information to what you need to find?";
}

/**
 * Validates subject-specific and formula/theorem-specific justification dimensions.
 * Quantitative Methods checks variable identification, formula applicability, assumption checking, statistical interpretation.
 * Discrete Mathematics checks definition applicability, theorem conditions, logical implications, proof validity.
 */
export function validateJustificationBySubject(
  response: MathResponse,
  reference?: StageReference,
  subject?: Subject,
): { valid: boolean; contradicted: boolean; missingDimension?: string; contradictionReason?: string } {
  const equivalence = evaluateConditionEquivalence(response, reference);
  if (equivalence.contradicted) {
    return {
      valid: false,
      contradicted: true,
      missingDimension: "assumption_checking",
      contradictionReason: equivalence.contradictionReason,
    };
  }
  if (equivalence.matched) {
    return { valid: true, contradicted: false };
  }
  const bare = isBareMethodSelection(response, reference);
  if (!bare) {
    return { valid: true, contradicted: false };
  }
  const domain = subject ?? reference?.methodReference?.domain;
  return {
    valid: false,
    contradicted: false,
    missingDimension: domain === "Discrete Mathematics" ? "theorem_conditions" : "formula_applicability",
  };
}

/**
 * Performs a two-stage Stage 2 check: an initial word-count/filler filter paired with semantic
 * equivalence matching against justification markers and reference applicability conditions.
 *
 * @param response - Learner response containing plain text and/or LaTeX.
 * @param reference - Optional private problem reference supplying formula names and preconditions.
 * @returns True when the submission only names a method without connecting it to problem conditions.
 */
export function isBareMethodSelection(response: MathResponse, reference?: StageReference): boolean {
  const text = [response.plainText, response.latex ?? ""].join(" ").trim();
  const words = tokenizeWords(text);
  if (words.length === 0) return true;

  const equivalence = evaluateConditionEquivalence(response, reference);
  if (equivalence.contradicted) return false; // Contradictions are handled as conceptual/condition errors, not bare naming
  if (equivalence.matched) return false;

  const methodWords = new Set([
    ...tokenizeWords(reference?.requiredFormula),
    ...tokenizeWords(reference?.requiredTheorem),
    ...tokenizeWords(reference?.methodReference?.name),
  ]);
  const conditionKeywords = [
    ...(reference?.formulaTheoremConditions ?? []),
    ...(reference?.methodReference?.conditions ?? []),
  ]
    .flatMap(condition => tokenizeWords(condition))
    .filter(word => word.length >= 4 && !methodWords.has(word) && !CONDITION_STOPWORDS.has(word));
  const hasConditionMatch = conditionKeywords.some(keyword =>
    words.some(word => word === keyword || (word.length >= 4 && (word.startsWith(keyword) || keyword.startsWith(word)))),
  );
  const hasJustification = /\b(because|since|as|so|therefore|given|condition|requires|applies|equal|equally|contribute|importance|weight|independent|disjoint|population|sample|subset|every|all|either|both|substitut|connect|rule|theorem|principle|when|if|where|for|implies|definition|assum)\b/i.test(text);
  const remainingWords = words.filter(word => !METHOD_FILLER_WORDS.has(word) && !methodWords.has(word));
  return (words.length <= 4 || remainingWords.length <= 1) && !hasJustification && !hasConditionMatch;
}

export function responseOutcome(turn: Turn): ResponseOutcome {
  if (turn.accepted) return "correct_complete";
  if (turn.confidence !== "high" || !turn.evidence.some(e => e.trim()) || ["unsupported_response", "unrecognized_alternative"].includes(turn.category)) return "unclear";
  if (["none", "weak_justification", "skipped_reasoning"].includes(turn.category)) {
    return turn.outcome === "unclear" ? "unclear" : "correct_incomplete";
  }
  return "incorrect";
}

// Only recognize whole, unambiguous statements about a verified operation.
// Qualifiers, further claims, mathematical notation, and other paraphrases go to
// the ordinary assessment, where the tutor can consider them in context.
export function verifiedConceptTurn(operation: string | undefined, phase: ReasoningPhase, response: MathResponse): Turn | undefined {
  if (response.latex?.trim()) return;
  const statement = response.plainText.toLowerCase().trim().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  const evidence = [response.plainText.trim()];
  const base = {confidence:"high", evidence, intent:"answer", leaksSolution:false} as const;
  const stage = solverStageForPhase(phase);
  if (operation === "union" && stage === "problem_understanding") {
    const goal = /^(?:as i said[, ]+)?(?:(?:i|we) (?:need|have|want) to |(?:the )?goal is to )?(?:find|get|determine) (?:the )?union of (?:the (?:numbers|elements|values) (?:inside|in|within) (?:the |these |both )?(?:curly )?(?:braces?|brackets?)|(?:the |these |both )?(?:two |given )*sets)$/;
    if (goal.test(statement)) return {...base, accepted:true, outcome:"correct_complete", category:"none", questionStage:"method_selection",
      feedback:"You identified the union as the goal and the sets inside the braces as the givens.",
      question:"How will you handle a value that appears in both sets when forming the union?"};
  }
  if (operation === "population variance" && stage === "method_selection") {
    const spreadOnly = /^(?:because )?(?:(?:we (?:need|want) to|to) measure|(?:it|variance) measures) (?:the )?(?:spread|variability|dispersion) (?:of|in) (?:the |these )?(?:data|values|observations)$/;
    if (spreadOnly.test(statement)) return {...base, accepted:false, outcome:"correct_incomplete", category:"none", questionStage:stage, missingCriterion:"formula_theorem_justification",
      feedback:"You identified what variance measures: the spread of the data.",
      question:"Do the observations cover every member of the group being studied or only a sample?"};
    const sizeRule = /^(?:because )?(?:(?:it|population variance|the population variance formula) is used (?:when|if) )?(?:there are|we (?:only )?have|the (?:data ?set|group) (?:only )?has) (?:only |just )?(?:a few|very few|few) (?:numbers|values|observations|members)$/;
    if (sizeRule.test(statement)) return {...base, accepted:false, outcome:"incorrect", category:"conceptual_error", questionStage:stage, missingCriterion:"formula_theorem_justification",
      incorrectStep:evidence[0], explanation:"Group size does not determine whether the data represent a population or a sample.",
      feedback:"Both a population and a sample can contain just a few values.",
      question:"Does the data set cover everyone in the group being studied or only some members?",
      recommendedAction:"Identify who was observed and compare that with the group being studied."};
  }
}

/**
 * Checks whether a proposed hint or tutor text leaks information belonging to a later checkpoint
 * (such as naming the target formula/theorem during Stage 1 `problem_understanding`, or revealing
 * the explicit formula equation during a Strategic Hint before procedural guidance).
 *
 * @param text - Candidate hint or tutor message text.
 * @param stage - Current visible solver stage.
 * @param level - Support level being generated.
 * @param reference - Problem reference containing formulas, theorems, and statements.
 * @returns True if the text discloses protected future-checkpoint material.
 */
export function leaksFutureCheckpoint(
  text: string,
  stage: SolverStage,
  level: string | undefined,
  reference?: StageReference,
): boolean {
  if (!text.trim() || !reference) return false;
  const lowered = text.toLowerCase();

  // Stage 1 (problem_understanding) must never reveal the target theorem, formula name, or equation statement
  if (stage === "problem_understanding") {
    const methodNames = [
      reference.requiredFormula,
      reference.requiredTheorem,
      reference.methodReference?.name,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length >= 4)
      .map(v => v.trim().toLowerCase());

    for (const method of methodNames) {
      // Only block specific theorem/formula names that aren't generic words like "logic" or "product"
      if (method.includes("theorem") || method.includes("formula") || method.includes("bayes") || method.includes("pigeonhole") || method.includes("induction") || method.includes("bessel")) {
        if (lowered.includes(method)) return true;
      }
      if (new RegExp(`\\b(?:use|apply|select|choose|meanings? of)\\s+(?:the\\s+)?${method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
        return true;
      }
    }
    const statement = reference.methodReference?.statement?.trim();
    const compactLower = lowered.replace(/\s+/g, "");
    const compactStatement = statement ? statement.toLowerCase().replace(/\s+/g, "") : "";
    if (compactStatement && compactStatement.length >= 6 && compactLower.includes(compactStatement)) {
      return true;
    }
    if (/(?:\b(?:mean|variance|median|probability|combination|permutation)\s*=|x̄\s*=|\\bar\{x\}\s*=)/i.test(text)) {
      return true;
    }
  }

  // Level 1 (Conceptual) and Level 2 (Strategic) hints in Stage 2 must not reveal the explicit algebraic formula equation
  if (stage === "method_selection" && (level === "socratic_prompt" || level === "targeted_hint" || level === "stronger_hint")) {
    const statement = reference.methodReference?.statement?.trim();
    const compactLower = lowered.replace(/\s+/g, "");
    const compactStatement = statement ? statement.toLowerCase().replace(/\s+/g, "") : "";
    if (compactStatement && compactStatement.includes("=") && compactLower.includes(compactStatement)) {
      return true;
    }
  }

  return false;
}

// Each row moves from a single question to a concrete, unfinished task.
const questions: Record<ReasoningPhase, readonly string[]> = {
  problem_understanding: ["What is the problem asking you to find?", "Which word in the problem names the goal?", "Are you looking for a value, a collection, or a statement to prove?", "How would you finish “I need to find ___” for this problem?"],
  relevant_information_identification: ["Which information has the problem given you?", "Which one of the stated facts will you use?", "Which part is already known and which part is the unknown?", "How would you finish “One given I can use is ___”?"],
  method_selection: ["Which method would you try?", "What feature of the givens suggests a method?", "Which operation or rule would connect one given to the goal?", "How would you finish “I would use ___ because ___”?"],
  formula_theorem_justification: ["What condition makes your rule applicable?", "Which given supports one condition of your rule?", "Would your rule still work if that condition were missing?", "How would you finish “This rule needs ___, and the problem tells me ___”?"],
  guided_computation_or_proof: ["What is the first step you can write down?", "Which given belongs in the next step?", "Which single operation or inference can you carry out now?", "What goes in the first blank if you write your next step as “___ gives ___”?"],
  verification_and_checking: ["How could you check one step?", "Which step can you check independently?", "What would happen if you reversed the last step or tried a small case?", "What do you get when you check just that one step?"],
  result_interpretation: ["What does your result describe?", "Looking at your result, what could you say about what it represents?", "What would you tell someone who asked what this result means here?", "How would you finish “For the group or objects in this problem, my result means ___”?"],
};
const unionGoalQuestions = ["Which two collections does the problem give you?", "Does the word union ask for a single number or a set?", "Point to one pair of braces. What does it enclose?", "How would you finish “The two sets are given, and I need to find ___”?"];
const unionMethodQuestions = ["How will you handle a value that appears in both sets?", "Does a value have to occur in both sets to belong to their union?", "Pick a value in either set. What does the union rule tell you about that value?", "Start with one set. For one value in the other set, how will you decide whether to add it?"];
const varianceQuestions = ["Who is the group being studied?", "Do the data cover every member of that group or only some members?", "Which matters for this choice: the number of observations or who was observed?", "How would you finish “These observations cover ___, so I would use ___ variance”?"];
const levels = ["socratic_prompt", "targeted_hint", "stronger_hint", "partial_step"];

export function stageHint(
  phase: ReasoningPhase,
  level: string,
  reference: StageReference = {},
  previousPrompt = "",
  context?: HintContext,
) {
  const ref: StageReference = reference ?? {};
  const step = Math.max(0, levels.indexOf(level));
  const stage = solverStageForPhase(phase);
  const union = ref.requiredFormula === "union" && ["problem_understanding", "method_selection"].includes(stage);
  const variance = ref.requiredFormula === "population variance" && stage === "method_selection";
  let prompts = questions[phase];
  if (union) prompts = stage === "method_selection" ? unionMethodQuestions : unionGoalQuestions;
  if (variance) prompts = varianceQuestions;
  const reviewed = !union && !variance && step === 0 && ref.socraticPrompts?.[phase];
  let question = reviewed || prompts[step];
  if (sameQuestion(question, previousPrompt)) {
    question = step === 3 ? "Which part would you like to work through together first?" : prompts[step + 1];
  }
  const rawSafeHint = !union && !variance ? ref.safeHints?.[phase]?.[level]?.[0] : undefined;
  const safeHint = rawSafeHint && !leaksFutureCheckpoint(String(rawSafeHint), stage, level, ref)
    ? String(rawSafeHint)
    : undefined;
  const methodNames = [ref.requiredFormula, ref.requiredTheorem, ref.methodReference?.name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => value.trim().toLowerCase());
  const rawConcept = (ref.expectedConcepts ?? []).find(entry => {
    if (typeof entry !== "string" || !entry.trim()) return false;
    if (stage !== "problem_understanding") return true;
    const lowered = entry.trim().toLowerCase();
    return !methodNames.some(method => lowered.includes(method) || method.includes(lowered));
  });
  const concept = rawConcept ? rawConcept.trim() : "";
  const condition = stage !== "problem_understanding" && typeof ref.formulaTheoremConditions?.[0] === "string"
    ? ref.formulaTheoremConditions[0].trim()
    : "";
  const methodLabel = stage !== "problem_understanding" && typeof (ref.requiredFormula || ref.requiredTheorem) === "string"
    ? String(ref.requiredFormula || ref.requiredTheorem).trim()
    : "";

  const openDiagnosis = context?.lastDiagnosis?.resolutionStatus === "open" && context.lastDiagnosis.category && context.lastDiagnosis.category !== "none"
    ? context.lastDiagnosis
    : null;
  const diagnosisContextPrefix = openDiagnosis?.explanation && !leaksFutureCheckpoint(openDiagnosis.explanation, stage, level, ref)
    ? `${openDiagnosis.explanation} `
    : "";

  let feedback = safeHint
    ? safeHint
    : step >= 2 && union
      ? "A union includes values that belong to either set."
      : step >= 2 && variance
        ? "Population variance describes a whole group. Sample variance uses a subset to estimate the group's variance."
        : step === 3 && context?.recoveryMode && condition
          ? `Recovery step: Start with the condition (${condition}) and fill in one part of the setup.`
          : step >= 2 && condition
            ? `Try just one part of this step. Keep in mind: ${condition}`
            : step >= 2 && stage === "method_selection" && methodLabel
              ? `Try just one part of this step. Consider how the conditions for ${methodLabel} match the givens.`
              : step >= 2
                ? "Try just one part of this step."
                : step === 1 && concept
                  ? `Let's focus on one detail connected to ${concept}.`
                  : "Let's focus on one detail.";

  if (diagnosisContextPrefix && step >= 1 && !safeHint && !union && !variance) {
    feedback = `${diagnosisContextPrefix}${feedback}`.trim();
  }

  return { feedback, question };
}

export function sameQuestion(left: string, right: string) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const a = normalize(left), b = normalize(right);
  if (a === b) return true;
  const [shorter,longer] = a.length < b.length ? [a,b] : [b,a];
  return shorter.split(" ").length >= 6 && longer.startsWith(shorter + " ");
}
