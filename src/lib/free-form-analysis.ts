import { sendMessage } from "./gemini";
import { SUBJECT_TOPICS } from "@/types";
import type {
  FreeFormProblemAnalysis,
  Subject,
  Topic,
} from "@/types";

const ANALYSIS_SYSTEM_PROMPT = `You are the validation and rubric engine for MINDGUIDE, a formative Socratic learning tool.
Analyze only Quantitative Methods and Discrete Mathematics problems. Do not chat and do not use Markdown.
Return exactly one JSON object with the requested fields. Build a correct private reference answer and solution outline so later formative feedback can be consistent.`;

const RUBRIC_CATEGORIES = [
  "accuracy",
  "logicalValidity",
  "methodSelection",
  "justificationQuality",
  "interpretationQuality",
] as const;

export async function analyzeFreeFormProblem(options: {
  subject: Subject;
  topic: Topic;
  question: string;
  signal?: AbortSignal;
}): Promise<FreeFormProblemAnalysis> {
  const question = options.question.trim();
  if (question.length < 10) {
    throw new Error("Enter a complete problem with at least 10 characters.");
  }
  if (question.length > 2_000) {
    throw new Error("The problem must be 2,000 characters or fewer.");
  }

  const prompt = `Selected subject: ${options.subject}
Selected topic: ${options.topic}
Student problem: ${question}

Return JSON with this exact shape:
{
  "isSupported": boolean,
  "isSolvable": boolean,
  "rejectionReason": string | null,
  "normalizedQuestion": string,
  "expectedConcepts": string[],
  "requiredFormula": string | null,
  "requiredTheorem": string | null,
  "solutionOutline": string[],
  "referenceAnswer": string,
  "interpretation": string,
  "rubric": [
    {"category":"accuracy","criterion":"...","maxScore":20},
    {"category":"logicalValidity","criterion":"...","maxScore":20},
    {"category":"methodSelection","criterion":"...","maxScore":20},
    {"category":"justificationQuality","criterion":"...","maxScore":20},
    {"category":"interpretationQuality","criterion":"...","maxScore":20}
  ]
}

Mark unsupported when the problem is outside the selected topic, asks for prohibited/non-educational content, lacks enough information, or is not a reasoning problem. If rejected, still return all fields but arrays may be empty and reference strings may be blank.`;

  const raw = await sendMessage(ANALYSIS_SYSTEM_PROMPT, [], prompt, {
    signal: options.signal,
    retryTransient: true,
  });
  const parsed = parseJsonObject(raw);
  return validateFreeFormProblemAnalysis(parsed, {
    subject: options.subject,
    topic: options.topic,
    originalQuestion: question,
  });
}

export function validateFreeFormProblemAnalysis(
  value: unknown,
  context: { subject: Subject; topic: Topic; originalQuestion: string }
): FreeFormProblemAnalysis {
  if (!isRecord(value)) {
    throw new Error("Gemini returned an invalid problem analysis. Please try again.");
  }

  const isSupported = value.isSupported === true;
  const isSolvable = value.isSolvable === true;
  const rejectionReason = asNullableString(value.rejectionReason);
  const normalizedQuestion = asString(value.normalizedQuestion) || context.originalQuestion;
  const expectedConcepts = asStringArray(value.expectedConcepts).slice(0, 8);
  const solutionOutline = asStringArray(value.solutionOutline).slice(0, 10);
  const referenceAnswer = asString(value.referenceAnswer);
  const interpretation = asString(value.interpretation);
  const rubric = normalizeRubric(value.rubric);

  if (isSupported && isSolvable) {
    if (
      expectedConcepts.length === 0 ||
      solutionOutline.length < 2 ||
      !referenceAnswer ||
      rubric.length !== RUBRIC_CATEGORIES.length
    ) {
      throw new Error(
        "Gemini could not build a complete learning rubric for this problem. Rephrase it and try again."
      );
    }
  }

  if (!SUBJECT_TOPICS[context.subject].includes(context.topic as never)) {
    throw new Error("The selected topic does not belong to the selected subject.");
  }

  return {
    analysisVersion: 1,
    validationStatus: "validated",
    isSupported,
    isSolvable,
    rejectionReason:
      rejectionReason ??
      (!isSupported || !isSolvable
        ? "This question could not be validated for the selected topic."
        : null),
    normalizedQuestion: normalizedQuestion.slice(0, 2_000),
    subject: context.subject,
    topic: context.topic,
    expectedConcepts,
    requiredFormula: asNullableString(value.requiredFormula),
    requiredTheorem: asNullableString(value.requiredTheorem),
    solutionOutline,
    referenceAnswer: referenceAnswer.slice(0, 4_000),
    interpretation: interpretation.slice(0, 2_000),
    rubric,
  };
}

function normalizeRubric(value: unknown): FreeFormProblemAnalysis["rubric"] {
  if (!Array.isArray(value)) return [];

  return RUBRIC_CATEGORIES.flatMap((category) => {
    const source = value.find(
      (item) => isRecord(item) && item.category === category
    );
    if (!source || !isRecord(source)) return [];
    const criterion = asString(source.criterion);
    if (!criterion) return [];
    return [{ category, criterion: criterion.slice(0, 600), maxScore: 20 }];
  });
}

function parseJsonObject(value: string): unknown {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Gemini returned an invalid problem analysis. Please try again.");
  }
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    const malformed = new Error(
      "Gemini returned malformed analysis data. Please try again."
    );
    (malformed as Error & { cause?: unknown }).cause = error;
    throw malformed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const result = asString(value);
  return result ? result : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}
