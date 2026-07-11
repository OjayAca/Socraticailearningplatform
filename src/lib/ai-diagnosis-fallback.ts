import { sendMessage } from "./gemini";
import {
  buildAIDiagnosisFallbackPrompt,
  buildAIScorecardFallbackPrompt,
} from "./prompts";
import type {
  AIFallbackEvent,
  DiagnosisResult,
  MindGuidePhase,
  MindGuideProblem,
  MindGuideScorecard,
  MisconceptionErrorType,
  Session,
} from "@/types";

type ScoreCategory =
  | "accuracy"
  | "logicalValidity"
  | "methodSelection"
  | "justificationQuality"
  | "interpretationQuality";

interface AIDiagnosisFallbackResult {
  diagnosis: DiagnosisResult;
  fallbackEvent: AIFallbackEvent;
}

interface AIScorecardFallbackResult {
  scorecard: MindGuideScorecard;
  fallbackEvent: AIFallbackEvent;
}

const FALLBACK_SYSTEM_PROMPT =
  "You are a strict MINDGUIDE assessment helper. Return only the requested JSON. Do not include markdown or explanation outside JSON.";

const VALID_ERROR_TYPES: MisconceptionErrorType[] = [
  "wrong_formula",
  "invalid_logic",
  "misinterpreted_variable",
  "computational_error",
  "weak_justification",
  "skipped_reasoning",
  "none",
];

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

const SCORE_CATEGORIES: ScoreCategory[] = [
  "accuracy",
  "logicalValidity",
  "methodSelection",
  "justificationQuality",
  "interpretationQuality",
];

export function shouldUseAIDiagnosisFallback(
  response: string,
  problem: MindGuideProblem,
  phase: MindGuidePhase,
  ruleResult: DiagnosisResult
): boolean {
  if (ruleResult.errorType !== "none") return false;

  const normalizedResponse = normalize(response);
  const wordCount = normalizedResponse.split(" ").filter(Boolean).length;
  const conceptMatches = countConceptMatches(normalizedResponse, problem);
  const mentionsReasoning = hasReasoningLanguage(normalizedResponse);
  const phaseNeedsJustification = phase === "formula_theorem_justification";
  const isShortButNotEmpty = response.trim().length >= 10 && wordCount <= 8;
  const partiallyMatchesConcepts =
    conceptMatches > 0 && conceptMatches < Math.max(problem.expectedConcepts.length, 2);

  return (
    isShortButNotEmpty ||
    partiallyMatchesConcepts ||
    (phaseNeedsJustification && !mentionsReasoning)
  );
}

export async function aiAssistedDiagnosis(
  response: string,
  problem: MindGuideProblem,
  phase: MindGuidePhase,
  ruleResult: DiagnosisResult,
  signal?: AbortSignal
): Promise<AIDiagnosisFallbackResult> {
  const triggeredAt = Date.now();
  const reason = "Rule diagnosis returned none for an ambiguous prepared-problem response.";

  try {
    const prompt = buildAIDiagnosisFallbackPrompt({
      problemText: problem.problemText,
      expectedConcepts: problem.expectedConcepts,
      requiredFormula: problem.requiredFormula,
      requiredTheorem: problem.requiredTheorem,
      phase,
      studentResponse: response,
      ruleResult: ruleResult.errorType,
    });
    const rawResponse = await sendMessage(FALLBACK_SYSTEM_PROMPT, [], prompt, {
      signal,
    });
    const parsed = parseJsonObject(rawResponse);
    const errorType = parseErrorType(parsed?.errorType);
    const reasons = parseReasons(parsed?.reasons);

    if (!errorType) {
      return {
        diagnosis: ruleResult,
        fallbackEvent: buildFallbackEvent({
          kind: "diagnosis",
          triggeredAt,
          phase,
          reason: `${reason} AI returned an invalid error type.`,
          outcome: "failed",
          ruleResult: ruleResult.errorType,
          aiResult: rawResponse,
          changedResult: false,
        }),
      };
    }

    const diagnosis: DiagnosisResult = {
      errorType,
      correctivePrompt: CORRECTIVE_PROMPTS[errorType],
      phase,
      reasons: reasons.length > 0 ? reasons : [`AI fallback classified as ${errorType}.`],
      detectedAt: triggeredAt,
    };

    return {
      diagnosis,
      fallbackEvent: buildFallbackEvent({
        kind: "diagnosis",
        triggeredAt,
        phase,
        reason,
        outcome: "used_ai",
        ruleResult: ruleResult.errorType,
        aiResult: errorType,
        changedResult: errorType !== ruleResult.errorType,
      }),
    };
  } catch (error) {
    return {
      diagnosis: ruleResult,
      fallbackEvent: buildFallbackEvent({
        kind: "diagnosis",
        triggeredAt,
        phase,
        reason: `${reason} ${getErrorMessage(error)}`,
        outcome: "failed",
        ruleResult: ruleResult.errorType,
        aiResult: null,
        changedResult: false,
      }),
    };
  }
}

export function shouldUseAIScorecardFallback(
  session: Session,
  ruleScorecard: MindGuideScorecard
): boolean {
  if (!session.selectedProblem || !session.draft) return false;

  const relation = getAnswerRelation(
    session.draft.answer,
    session.selectedProblem.finalAnswer
  );
  const methodology = session.draft.methodology.trim();
  const reflection = session.draft.reflection.trim();
  const hasNearlyPerfectRuleScore = ruleScorecard.total >= 90;
  const hasThinDraftContext = methodology.length < 20 || reflection.length < 25;
  const isBorderlineAnswer =
    relation.expectedTokens > 0 &&
    relation.matchRatio >= 0.4 &&
    relation.matchRatio <= 0.6;

  return isBorderlineAnswer || (hasNearlyPerfectRuleScore && hasThinDraftContext);
}

export async function aiAssistedScorecard(
  session: Session,
  ruleScorecard: MindGuideScorecard,
  signal?: AbortSignal
): Promise<AIScorecardFallbackResult> {
  const triggeredAt = Date.now();
  const reason = "Rule scorecard confidence was ambiguous for a prepared-problem draft.";
  const problem = session.selectedProblem;
  const draft = session.draft;

  if (!problem || !draft) {
    return {
      scorecard: ruleScorecard,
      fallbackEvent: buildFallbackEvent({
        kind: "scorecard",
        triggeredAt,
        reason: "Scorecard fallback skipped because the session has no prepared problem or draft.",
        outcome: "failed",
        ruleResult: String(ruleScorecard.total),
        aiResult: null,
        changedResult: false,
      }),
    };
  }

  try {
    const prompt = buildAIScorecardFallbackPrompt({
      problemText: problem.problemText,
      finalAnswer: problem.finalAnswer,
      interpretation: problem.interpretation,
      expectedConcepts: problem.expectedConcepts,
      draft,
      ruleScorecardJson: JSON.stringify(ruleScorecard),
      diagnosesJson: JSON.stringify(getSessionDiagnoses(session)),
    });
    const rawResponse = await sendMessage(FALLBACK_SYSTEM_PROMPT, [], prompt, {
      signal,
    });
    const parsed = parseJsonObject(rawResponse);

    if (!parsed) {
      return {
        scorecard: ruleScorecard,
        fallbackEvent: buildFallbackEvent({
          kind: "scorecard",
          triggeredAt,
          reason: `${reason} AI returned invalid JSON.`,
          outcome: "failed",
          ruleResult: String(ruleScorecard.total),
          aiResult: rawResponse,
          changedResult: false,
        }),
      };
    }

    const scorecard = normalizeAIScorecard(parsed, ruleScorecard);

    return {
      scorecard,
      fallbackEvent: buildFallbackEvent({
        kind: "scorecard",
        triggeredAt,
        reason,
        outcome: "used_ai",
        ruleResult: String(ruleScorecard.total),
        aiResult: String(scorecard.total),
        changedResult: scorecard.total !== ruleScorecard.total,
      }),
    };
  } catch (error) {
    return {
      scorecard: ruleScorecard,
      fallbackEvent: buildFallbackEvent({
        kind: "scorecard",
        triggeredAt,
        reason: `${reason} ${getErrorMessage(error)}`,
        outcome: "failed",
        ruleResult: String(ruleScorecard.total),
        aiResult: null,
        changedResult: false,
      }),
    };
  }
}

function normalizeAIScorecard(
  parsed: Record<string, unknown>,
  ruleScorecard: MindGuideScorecard
): MindGuideScorecard {
  const categoryScores = SCORE_CATEGORIES.reduce(
    (result, category) => ({
      ...result,
      [category]: parseCategoryScore(parsed[category], ruleScorecard[category]),
    }),
    {} as Omit<MindGuideScorecard, "total" | "feedback">
  );
  const feedback =
    typeof parsed.feedback === "string" && parsed.feedback.trim()
      ? parsed.feedback.trim()
      : ruleScorecard.feedback;

  return {
    ...categoryScores,
    total: SCORE_CATEGORIES.reduce(
      (sum, category) => sum + categoryScores[category],
      0
    ),
    feedback,
  };
}

function parseCategoryScore(value: unknown, fallback: number): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(Math.max(Math.round(numericValue), 0), 20);
}

function getSessionDiagnoses(session: Session): DiagnosisResult[] {
  const messageDiagnoses = session.messages
    .map((message) => message.metadata?.diagnosis)
    .filter(isDiagnosisResult);

  return session.diagnosisResult
    ? [...messageDiagnoses, session.diagnosisResult]
    : messageDiagnoses;
}

function isDiagnosisResult(value: unknown): value is DiagnosisResult {
  if (!value || typeof value !== "object") return false;
  return "errorType" in value && "correctivePrompt" in value;
}

function getAnswerRelation(answer: string, expectedAnswer: string) {
  const normalizedAnswer = normalize(answer);
  const expectedTokens = normalize(expectedAnswer)
    .split(" ")
    .filter((token) => token.length > 1 && !isStopWord(token));

  if (expectedTokens.length === 0) {
    return { expectedTokens: 0, matchRatio: 1 };
  }

  const matchingTokens = expectedTokens.filter((token) =>
    normalizedAnswer.includes(token)
  );

  return {
    expectedTokens: expectedTokens.length,
    matchRatio: matchingTokens.length / expectedTokens.length,
  };
}

function countConceptMatches(
  normalizedResponse: string,
  problem: MindGuideProblem
): number {
  return problem.expectedConcepts.filter((concept) =>
    concept
      .toLowerCase()
      .split(/\s+/)
      .some((token) => token.length > 3 && normalizedResponse.includes(token))
  ).length;
}

function hasReasoningLanguage(normalizedResponse: string): boolean {
  return ["because", "since", "therefore", "applies", "given", "shows"].some(
    (word) => normalizedResponse.includes(word)
  );
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseErrorType(value: unknown): MisconceptionErrorType | null {
  return typeof value === "string" &&
    VALID_ERROR_TYPES.includes(value as MisconceptionErrorType)
    ? (value as MisconceptionErrorType)
    : null;
}

function parseReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => reason.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildFallbackEvent(
  event: Omit<AIFallbackEvent, "id">
): AIFallbackEvent {
  return {
    id: `ai-fallback-${event.kind}-${event.triggeredAt}`,
    ...event,
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStopWord(token: string): boolean {
  return ["the", "is", "are", "and", "or", "of", "to", "a", "an"].includes(
    token
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI fallback call failed.";
}
