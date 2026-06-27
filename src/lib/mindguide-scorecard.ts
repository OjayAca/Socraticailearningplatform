import type {
  DiagnosisResult,
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
