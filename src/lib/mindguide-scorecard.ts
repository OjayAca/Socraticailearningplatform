import type {
  AIFallbackEvent,
  DiagnosisResult,
  MindGuideScorecard,
  MisconceptionErrorType,
  Session,
} from "@/types";
import {
  aiAssistedScorecard,
  shouldUseAIScorecardFallback,
} from "./ai-diagnosis-fallback";
import { sendMessage } from "./gemini";

type ScoreCategory =
  | "accuracy"
  | "logicalValidity"
  | "methodSelection"
  | "justificationQuality"
  | "interpretationQuality";

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  accuracy: "accuracy",
  logicalValidity: "logical validity",
  methodSelection: "method selection",
  justificationQuality: "formula/theorem justification",
  interpretationQuality: "interpretation quality",
};

export function generateMindGuideScorecard(session: Session): MindGuideScorecard {
  const diagnoses = getSessionDiagnoses(session);
  const draft = session.draft;
  const problem = session.selectedProblem;

  let accuracy = 20;
  let logicalValidity = 20;
  let methodSelection = 20;
  let justificationQuality = 20;
  let interpretationQuality = 20;

  if (!draft?.answer.trim()) {
    accuracy = 0;
  } else if (problem && !answerLooksRelated(draft.answer, problem.finalAnswer)) {
    accuracy = 12;
  } else if (!draft.methodology.trim()) {
    accuracy = 16;
  }

  if (hasDiagnosis(diagnoses, "invalid_logic")) {
    logicalValidity -= 8;
  }
  if (hasDiagnosis(diagnoses, "skipped_reasoning")) {
    logicalValidity -= 6;
  }

  if (hasDiagnosis(diagnoses, "wrong_formula")) {
    methodSelection = 10;
  }

  if (hasDiagnosis(diagnoses, "weak_justification")) {
    justificationQuality = 10;
  }

  const interpretation = draft?.reflection.trim() ?? "";
  if (!interpretation) {
    interpretationQuality = 0;
  } else if (interpretation.length < 25) {
    interpretationQuality = 12;
  }

  const scorecard = {
    accuracy: clampCategoryScore(accuracy),
    logicalValidity: clampCategoryScore(logicalValidity),
    methodSelection: clampCategoryScore(methodSelection),
    justificationQuality: clampCategoryScore(justificationQuality),
    interpretationQuality: clampCategoryScore(interpretationQuality),
  };

  return {
    ...scorecard,
    total:
      scorecard.accuracy +
      scorecard.logicalValidity +
      scorecard.methodSelection +
      scorecard.justificationQuality +
      scorecard.interpretationQuality,
    feedback: buildFeedback(scorecard, diagnoses, Boolean(problem)),
  };
}

export async function generateMindGuideScorecardWithFallback(
  session: Session,
  options: { signal?: AbortSignal } = {}
): Promise<{
  scorecard: MindGuideScorecard;
  fallbackEvent?: AIFallbackEvent;
}> {
  if (session.problemMode === "free_form") {
    return generateFreeFormScorecard(session, options.signal);
  }

  const ruleScorecard = generateMindGuideScorecard(session);

  if (!shouldUseAIScorecardFallback(session, ruleScorecard)) {
    return { scorecard: ruleScorecard };
  }

  const result = await aiAssistedScorecard(
    session,
    ruleScorecard,
    options.signal
  );
  return {
    scorecard: result.scorecard,
    fallbackEvent: result.fallbackEvent,
  };
}

async function generateFreeFormScorecard(
  session: Session,
  signal?: AbortSignal
): Promise<{
  scorecard: MindGuideScorecard;
  fallbackEvent: AIFallbackEvent;
}> {
  const triggeredAt = Date.now();
  const context = session.problemContext;
  const draft = session.draft;

  if (context.mode !== "free_form" || !draft) {
    throw new Error(
      "This free-form session is missing its validated rubric or final draft."
    );
  }

  if (
    context.analysis.validationStatus !== "validated" ||
    !context.analysis.isSupported ||
    !context.analysis.isSolvable
  ) {
    throw new Error(
      "This question does not have a validated analysis for formative scoring."
    );
  }

  const assessmentContext = JSON.stringify({
    question: context.question,
    referenceAnswer: context.analysis.referenceAnswer,
    solutionOutline: context.analysis.solutionOutline,
    expectedConcepts: context.analysis.expectedConcepts,
    interpretation: context.analysis.interpretation,
    rubric: context.analysis.rubric,
    studentDraft: draft,
    phaseResponses: session.phaseResponses,
    diagnoses: getSessionDiagnoses(session),
    recentConversation: session.messages.slice(-20).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  }).slice(0, 22_000);

  const raw = await sendMessage(
    "You are MINDGUIDE's strict formative assessment engine. Evaluate only against the supplied validated reference and rubric. Return one JSON object and no Markdown. Never award points merely because a field is non-empty.",
    [],
    `Evaluate this free-form learning session. Each category must be an integer from 0 to 20. Evidence must identify a concrete strength or gap from the student's work.\n\n${assessmentContext}\n\nReturn exactly:\n{"accuracy":0,"logicalValidity":0,"methodSelection":0,"justificationQuality":0,"interpretationQuality":0,"evidence":{"accuracy":"...","logicalValidity":"...","methodSelection":"...","justificationQuality":"...","interpretationQuality":"..."},"feedback":"Specific formative feedback..."}`,
    { retryTransient: true, signal }
  );

  const scorecard = parseFreeFormScorecard(raw);
  return {
    scorecard,
    fallbackEvent: {
      id: `ai-scorecard-${session.id}-${triggeredAt}`,
      kind: "scorecard",
      triggeredAt,
      reason: "Free-form sessions require rubric-grounded structured AI scoring.",
      outcome: "used_ai",
      ruleResult: "not_applicable",
      aiResult: String(scorecard.total),
      changedResult: true,
    },
  };
}

function parseFreeFormScorecard(raw: string): MindGuideScorecard {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      "Gemini returned a malformed scorecard. Please retry the review."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error(
      "Gemini returned a malformed scorecard. Please retry the review."
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "Gemini returned an invalid scorecard. Please retry the review."
    );
  }

  const record = parsed as Record<string, unknown>;
  const categories: ScoreCategory[] = [
    "accuracy",
    "logicalValidity",
    "methodSelection",
    "justificationQuality",
    "interpretationQuality",
  ];
  const scores = {} as Record<ScoreCategory, number>;
  for (const category of categories) {
    const score = record[category];
    if (
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > 20
    ) {
      throw new Error(
        "Gemini returned out-of-range scorecard values. Please retry the review."
      );
    }
    scores[category] = score;
  }

  const evidence = record.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(
      "Gemini did not ground the scorecard in evidence. Please retry the review."
    );
  }
  for (const category of categories) {
    const detail = (evidence as Record<string, unknown>)[category];
    if (typeof detail !== "string" || detail.trim().length < 4) {
      throw new Error(
        "Gemini did not ground every score in evidence. Please retry the review."
      );
    }
  }

  const feedback = record.feedback;
  if (typeof feedback !== "string" || feedback.trim().length < 12) {
    throw new Error(
      "Gemini returned incomplete formative feedback. Please retry the review."
    );
  }

  return {
    ...scores,
    total: categories.reduce((total, category) => total + scores[category], 0),
    feedback: feedback.trim().slice(0, 4_000),
  };
}

function getSessionDiagnoses(session: Session): DiagnosisResult[] {
  const messageDiagnoses = session.messages
    .map((message) => message.metadata?.diagnosis)
    .filter(isDiagnosisResult);

  return session.diagnosisResult
    ? [...messageDiagnoses, session.diagnosisResult]
    : messageDiagnoses;
}

function buildFeedback(
  scorecard: Omit<MindGuideScorecard, "total" | "feedback">,
  diagnoses: DiagnosisResult[],
  hasExpectedAnswer: boolean
): string {
  const weakestCategory = (Object.keys(scorecard) as ScoreCategory[]).reduce(
    (weakest, category) =>
      scorecard[category] < scorecard[weakest] ? category : weakest,
    "accuracy"
  );

  const strength = findStrongCategory(scorecard, weakestCategory);
  const reason = getFeedbackReason(
    weakestCategory,
    diagnoses,
    hasExpectedAnswer
  );

  return `Your ${CATEGORY_LABELS[strength]} is correct, but your ${CATEGORY_LABELS[weakestCategory]} needs improvement because ${reason}.`;
}

function findStrongCategory(
  scorecard: Omit<MindGuideScorecard, "total" | "feedback">,
  weakestCategory: ScoreCategory
): ScoreCategory {
  const categories = Object.keys(scorecard) as ScoreCategory[];
  return (
    categories.find(
      (category) => category !== weakestCategory && scorecard[category] >= 18
    ) ?? weakestCategory
  );
}

function getFeedbackReason(
  category: ScoreCategory,
  diagnoses: DiagnosisResult[],
  hasExpectedAnswer: boolean
): string {
  if (category === "accuracy") {
    return hasExpectedAnswer
      ? "your final answer was missing or did not clearly match the problem's expected result"
      : "your final answer was missing or did not clearly address your original question";
  }

  if (category === "logicalValidity") {
    return hasDiagnosis(diagnoses, "skipped_reasoning")
      ? "some reasoning steps were skipped before reaching a conclusion"
      : "your conclusion did not include enough logical support";
  }

  if (category === "methodSelection") {
    return "the selected formula or method did not match the quantity being asked";
  }

  if (category === "justificationQuality") {
    return "you did not explain why the selected method applies to the given problem";
  }

  return "your final interpretation was missing or too brief to explain what the answer means";
}

function hasDiagnosis(
  diagnoses: DiagnosisResult[],
  errorType: MisconceptionErrorType
): boolean {
  return diagnoses.some((diagnosis) => diagnosis.errorType === errorType);
}

function answerLooksRelated(answer: string, expectedAnswer: string): boolean {
  const normalizedAnswer = normalize(answer);
  const expectedTokens = normalize(expectedAnswer)
    .split(" ")
    .filter((token) => token.length > 1 && !isStopWord(token));
  const expectedNumberTokens = expectedTokens.filter((token) => /\d/.test(token));

  if (
    expectedNumberTokens.length > 0 &&
    expectedNumberTokens.every((token) => normalizedAnswer.includes(token))
  ) {
    return true;
  }

  if (expectedTokens.length === 0) return true;

  const matchingTokens = expectedTokens.filter((token) =>
    normalizedAnswer.includes(token)
  );

  return matchingTokens.length >= Math.ceil(expectedTokens.length / 2);
}

function isDiagnosisResult(value: unknown): value is DiagnosisResult {
  if (!value || typeof value !== "object") return false;
  return "errorType" in value && "correctivePrompt" in value;
}

function clampCategoryScore(score: number): number {
  return Math.min(Math.max(score, 0), 20);
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
