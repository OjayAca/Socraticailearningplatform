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

  if (misinterpretsKnownValue(response, normalizedResponse, problem, phase)) {
    return buildDiagnosis("misinterpreted_variable", phase, [
      "Response assigns a known value or symbol to a different role than the problem states.",
    ]);
  }

  if (hasComputationalMismatch(response, problem)) {
    return buildDiagnosis("computational_error", phase, [
      "Response gives a numeric result that conflicts with the expected final answer.",
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

function misinterpretsKnownValue(
  response: string,
  normalizedResponse: string,
  problem: MindGuideProblem,
  phase: MindGuidePhase
): boolean {
  if (
    ![
      "problem_understanding",
      "method_selection",
      "formula_theorem_justification",
    ].includes(phase)
  ) {
    return false;
  }

  if (contradictsTruthAssignment(normalizedResponse, problem.problemText)) {
    return true;
  }

  return contradictsLabeledQuantity(response, problem.problemText);
}

function contradictsTruthAssignment(
  normalizedResponse: string,
  problemText: string
): boolean {
  const assignments = extractTruthAssignments(problemText);

  return assignments.some(({ symbol, truthValue }) => {
    const opposite = truthValue === "true" ? "false" : "true";
    const symbolPattern = escapeRegExp(symbol);
    return new RegExp(`\\b${symbolPattern}\\s*(is|=|be)\\s*${opposite}\\b`).test(
      normalizedResponse
    );
  });
}

function extractTruthAssignments(
  value: string
): Array<{ symbol: string; truthValue: "true" | "false" }> {
  const assignments: Array<{ symbol: string; truthValue: "true" | "false" }> = [];
  const normalizedValue = normalize(value);
  const pattern = /\b([a-z])\s*(is|=|be)\s*(true|false)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedValue)) !== null) {
    assignments.push({
      symbol: match[1],
      truthValue: match[3] as "true" | "false",
    });
  }

  return assignments;
}

function contradictsLabeledQuantity(response: string, problemText: string): boolean {
  const quantities = extractLabeledQuantities(problemText);
  if (quantities.length < 2) return false;

  const normalizedResponse = normalize(response);

  return quantities.some((quantity) =>
    quantities.some((otherQuantity) => {
      if (quantity.number === otherQuantity.number) return false;

      const numberPattern = escapeRegExp(quantity.number);
      const labelPattern = escapeRegExp(otherQuantity.label);

      return new RegExp(`\\b${numberPattern}\\s+${labelPattern}\\b`).test(
        normalizedResponse
      );
    })
  );
}

function extractLabeledQuantities(
  value: string
): Array<{ number: string; label: string }> {
  const normalizedValue = normalize(value);
  const quantities: Array<{ number: string; label: string }> = [];
  const pattern = /\b(\d+(?:\.\d+)?)\s+([a-z][a-z0-9]*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedValue)) !== null) {
    const label = match[2];
    if (!isQuantityLabel(label)) continue;
    quantities.push({ number: match[1], label });
  }

  return quantities;
}

function hasComputationalMismatch(
  response: string,
  problem: MindGuideProblem
): boolean {
  if (problem.subject !== "Quantitative Methods") return false;
  if (!looksLikeFinalNumericClaim(response)) return false;

  const responseClaims = extractLabeledNumericClaims(response);
  const expectedClaims = extractLabeledNumericClaims(problem.finalAnswer);

  for (const responseClaim of responseClaims) {
    const expectedClaim = expectedClaims.find(
      (claim) => claim.label === responseClaim.label
    );

    if (
      expectedClaim &&
      !numbersApproximatelyEqual(responseClaim.value, expectedClaim.value)
    ) {
      return true;
    }
  }

  const responseValues = extractNumericValues(response);
  const expectedValues = extractNumericValues(problem.finalAnswer);

  if (responseValues.length === 0 || expectedValues.length === 0) {
    return false;
  }

  return !responseValues.some((responseValue) =>
    expectedValues.some((expectedValue) =>
      numbersApproximatelyEqual(responseValue, expectedValue)
    )
  );
}

function looksLikeFinalNumericClaim(response: string): boolean {
  const normalizedResponse = normalize(response);

  return [
    "answer",
    "result",
    "final",
    "mean",
    "median",
    "mode",
    "variance",
    "standard deviation",
    "probability",
    "total",
  ].some((word) => includesPhraseOrKeyword(normalizedResponse, word));
}

function extractNumericValues(value: string): number[] {
  const values: number[] = [];
  const seen = new Set<string>();
  let remainingValue = value.toLowerCase();

  for (const match of remainingValue.matchAll(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/g)) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator !== 0) {
      addNumericValue(values, seen, numerator / denominator);
    }
  }
  remainingValue = remainingValue.replace(
    /\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/g,
    " "
  );

  for (const match of remainingValue.matchAll(/\b(\d+(?:\.\d+)?)\s*%/g)) {
    addNumericValue(values, seen, Number(match[1]) / 100);
  }
  remainingValue = remainingValue.replace(/\b\d+(?:\.\d+)?\s*%/g, " ");

  for (const match of remainingValue.matchAll(/\b\d+(?:\.\d+)?\b/g)) {
    addNumericValue(values, seen, Number(match[0]));
  }

  return values;
}

function extractLabeledNumericClaims(
  value: string
): Array<{ label: string; value: number }> {
  const claims: Array<{ label: string; value: number }> = [];
  const normalizedValue = value.toLowerCase();
  const labelPattern =
    "(mean|median|mode|variance|standard\\s+deviation|probability|answer|result|final|total)";
  const numberPattern =
    "(\\d+(?:\\.\\d+)?\\s*\\/\\s*\\d+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?\\s*%|\\d+(?:\\.\\d+)?)";
  const pattern = new RegExp(
    `\\b${labelPattern}\\b(?:\\s+\\w+){0,3}?\\s*(?:is|=|:)?\\s*${numberPattern}`,
    "g"
  );
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalizedValue)) !== null) {
    const parsedValue = parseNumericValue(match[2]);
    if (parsedValue === null) continue;

    claims.push({
      label: match[1].replace(/\s+/g, " "),
      value: parsedValue,
    });
  }

  return claims;
}

function parseNumericValue(value: string): number | null {
  const normalizedValue = value.replace(/\s+/g, "");

  const fractionMatch = normalizedValue.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    return denominator === 0 ? null : numerator / denominator;
  }

  const percentMatch = normalizedValue.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    return Number(percentMatch[1]) / 100;
  }

  const decimalValue = Number(normalizedValue);
  return Number.isFinite(decimalValue) ? decimalValue : null;
}

function addNumericValue(values: number[], seen: Set<string>, value: number): void {
  if (!Number.isFinite(value)) return;

  const key = value.toFixed(6);
  if (seen.has(key)) return;

  seen.add(key);
  values.push(value);
}

function numbersApproximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000001;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isQuantityLabel(label: string): boolean {
  return ![
    "and",
    "or",
    "from",
    "with",
    "find",
    "what",
    "which",
    "how",
    "students",
    "student",
    "members",
    "people",
    "values",
    "items",
  ].includes(label);
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
