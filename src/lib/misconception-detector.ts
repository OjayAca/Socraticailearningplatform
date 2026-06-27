import type {
  DiagnosisResult,
  MindGuidePhase,
  MindGuideProblem,
  MisconceptionErrorType,
} from "@/types";

const CORRECTIVE_PROMPTS: Record<MisconceptionErrorType, string> = {
  wrong_formula:
    "Check the problem requirement again. What quantity is being asked, and which formula matches it?",
  invalid_logic:
    "Your conclusion needs a logical basis. What statement supports your conclusion?",
  misinterpreted_variable:
    "Pause on the variables. What does each symbol or value represent in the problem?",
  computational_error:
    "Check the arithmetic step by step. Which calculation should be verified first?",
  weak_justification:
    "Your answer needs stronger justification. Which part of the problem shows that this formula or theorem applies?",
  skipped_reasoning:
    "MINDGUIDE needs to see your reasoning before the answer. What is the first idea or step you would use?",
  none: "",
};

const SKIPPED_REASONING_PATTERNS = [
  /\bi\s*don'?t\s+know\b/i,
  /\bidk\b/i,
  /\bjust\s+give\s+(the\s+)?answer\b/i,
  /\banswer\s+only\b/i,
];

const LOGIC_BASIS_WORDS = ["because", "therefore", "implies", "since", "proof"];

const QUANTITATIVE_FORMULA_KEYWORDS = [
  "mean",
  "median",
  "mode",
  "variance",
  "standard deviation",
  "probability",
  "permutation",
  "combination",
  "correlation",
  "regression",
  "slope",
  "sample space",
  "favorable outcomes",
];

export function diagnoseResponse(
  response: string,
  problem: MindGuideProblem,
  phase: MindGuidePhase
): DiagnosisResult {
  const trimmedResponse = response.trim();
  const normalizedResponse = normalize(trimmedResponse);

  if (trimmedResponse.length < 10) {
    return buildDiagnosis("skipped_reasoning", phase, [
      "Response is empty or shorter than 10 characters.",
    ]);
  }

  if (SKIPPED_REASONING_PATTERNS.some((pattern) => pattern.test(response))) {
    return buildDiagnosis("skipped_reasoning", phase, [
      "Response asks to skip reasoning or states uncertainty without an attempt.",
    ]);
  }

  if (
    phase === "formula_theorem_justification" &&
    !mentionsExpectedConceptOrRequiredArea(normalizedResponse, problem)
  ) {
    return buildDiagnosis("weak_justification", phase, [
      "Formula/theorem justification does not mention an expected concept or required formula/theorem.",
    ]);
  }

  if (
    problem.subject === "Discrete Mathematics" &&
    containsConclusion(normalizedResponse) &&
    !LOGIC_BASIS_WORDS.some((word) => normalizedResponse.includes(` ${word} `))
  ) {
    return buildDiagnosis("invalid_logic", phase, [
      "Discrete Mathematics response gives a conclusion without a logical basis word.",
    ]);
  }

  if (
    problem.subject === "Quantitative Methods" &&
    usesUnrelatedFormulaKeyword(normalizedResponse, problem)
  ) {
    return buildDiagnosis("wrong_formula", phase, [
      "Quantitative Methods response uses a formula keyword not tied to the expected concepts.",
    ]);
  }

  return buildDiagnosis("none", phase, []);
}

function buildDiagnosis(
  errorType: MisconceptionErrorType,
  phase: MindGuidePhase,
  reasons: string[]
): DiagnosisResult {
  return {
    errorType,
    correctivePrompt: CORRECTIVE_PROMPTS[errorType],
    phase,
    reasons,
    detectedAt: Date.now(),
  };
}

function mentionsExpectedConceptOrRequiredArea(
  normalizedResponse: string,
  problem: MindGuideProblem
): boolean {
  const expectedConcepts = problem.expectedConcepts.some((concept) =>
    includesPhraseOrKeyword(normalizedResponse, concept)
  );
  const requiredArea = [problem.requiredFormula, problem.requiredTheorem].some(
    (required) => required && includesPhraseOrKeyword(normalizedResponse, required)
  );

  return expectedConcepts || requiredArea;
}

function usesUnrelatedFormulaKeyword(
  normalizedResponse: string,
  problem: MindGuideProblem
): boolean {
  const usedKeywords = QUANTITATIVE_FORMULA_KEYWORDS.filter((keyword) =>
    normalizedResponse.includes(` ${keyword} `)
  );

  if (usedKeywords.length === 0) return false;

  const allowedText = normalize(
    [
      ...problem.expectedConcepts,
      problem.requiredFormula,
      problem.requiredTheorem,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return usedKeywords.some((keyword) => !allowedText.includes(` ${keyword} `));
}

function containsConclusion(normalizedResponse: string): boolean {
  return [
    /\b(the\s+)?(answer|conclusion|result|statement|proposition|compound\s+proposition|truth\s+value)\s+(is|=)\s+(true|false)\b/,
    /\b(it|this)\s+(is|=)\s+(true|false)\b/,
    /\b(so|thus)\s+(it\s+is\s+)?(true|false)\b/,
  ].some((pattern) => pattern.test(normalizedResponse));
}

function includesPhraseOrKeyword(normalizedResponse: string, value: string): boolean {
  const normalizedValue = normalize(value).trim();
  if (!normalizedValue) return false;

  if (normalizedResponse.includes(` ${normalizedValue} `)) return true;

  return normalizedValue
    .split(" ")
    .filter((token) => token.length >= 4 && !isStopWord(token))
    .some((token) => normalizedResponse.includes(` ${token} `));
}

function normalize(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function isStopWord(token: string): boolean {
  return [
    "when",
    "then",
    "only",
    "with",
    "from",
    "that",
    "this",
    "another",
    "both",
    "possible",
    "outcomes",
    "formula",
    "theorem",
    "principle",
  ].includes(token);
}
