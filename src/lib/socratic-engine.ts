/**
 * Socratic Engine — the orchestration layer for AI-guided learning.
 *
 * This module sits between the UI components and the raw AI client (`gemini.ts`).
 * It applies the correct prompts, parses structured responses, manages the
 * answer-block filter, and extracts logic map updates.
 *
 * @module lib/socratic-engine
 */

import { sendMessage } from "./gemini";
import {
  SOCRATIC_SYSTEM_PROMPT,
  buildTriggerPrompt,
  buildAnswerCheckPrompt,
  buildPhaseGuidancePrompt,
  buildHintPrompt,
  buildLogicMapPrompt,
  buildSummaryPrompt,
} from "./prompts";
import { diagnoseResponse } from "./misconception-detector";
import { getSessionDifficultyAdjustment } from "./adaptive-difficulty";
import {
  aiAssistedDiagnosis,
  shouldUseAIDiagnosisFallback,
} from "./ai-diagnosis-fallback";
import type {
  AIFallbackEvent,
  ChatMessage,
  DiagnosisResult,
  FreeFormProblemAnalysis,
  LogicMapNode,
  MindGuidePhase,
  MindGuideProblem,
  PhaseResponseRecord,
  ProblemMode,
  SessionDifficultyAdjustment,
  UnlockLevel,
} from "@/types";

export const MINDGUIDE_PHASE_ORDER: MindGuidePhase[] = [
  "problem_understanding",
  "method_selection",
  "formula_theorem_justification",
  "guided_computation_or_reasoning",
  "error_diagnosis",
  "progressive_unlock",
  "scorecard",
];

export const MINDGUIDE_PHASE_LABELS: Record<MindGuidePhase, string> = {
  problem_understanding: "Problem Understanding",
  method_selection: "Method Selection",
  formula_theorem_justification: "Formula/Theorem Justification",
  guided_computation_or_reasoning: "Guided Computation or Reasoning",
  error_diagnosis: "Error Diagnosis",
  progressive_unlock: "Progressive Solution Unlock",
  scorecard: "Critical Thinking Scorecard",
};

const FORMULA_THEOREM_JUSTIFICATION_PROMPT =
  "Why is this formula, theorem, or method appropriate for this problem?";

const JUSTIFICATION_REASONING_WORDS = [
  "because",
  "since",
  "applies",
  "appropriate",
  "given",
  "asks",
  "represents",
  "shows",
  "therefore",
];

// ─── Public API ──────────────────────────────────────────────

/**
 * Starts a new Socratic session by sending the student's original question
 * through the trigger prompt.
 *
 * @param subject - The learning subject (e.g., "Mathematics").
 * @param topic - The curriculum topic selected by the student.
 * @param question - The student's original question or problem.
 * @returns The AI's opening Socratic probe.
 */
export async function startSession(
  subject: string,
  topic: string,
  question: string,
  selectedProblem?: MindGuideProblem | null
): Promise<string> {
  if (selectedProblem) {
    return getMindGuidePhasePrompt(selectedProblem, "problem_understanding");
  }

  const triggerPrompt = buildTriggerPrompt(subject, topic, question);
  const systemPrompt = SOCRATIC_SYSTEM_PROMPT;

  const response = await sendMessage(systemPrompt, [], triggerPrompt);
  return cleanResponse(response);
}

/**
 * Sends a student's response to the AI and gets the next Socratic question.
 *
 * Includes answer-block detection: if the student appears to be pasting an
 * answer without reasoning, the AI will redirect them.
 *
 * @param conversationHistory - All previous messages in the session.
 * @param studentResponse - The student's latest message.
 * @returns An object with the AI response and whether the answer was blocked.
 */
export async function sendStudentResponse(
  conversationHistory: ChatMessage[],
  studentResponse: string,
  options: {
    currentPhase?: MindGuidePhase;
    selectedProblem?: MindGuideProblem | null;
    subject?: string;
    topic?: string;
    originalQuestion?: string;
    phaseResponses?: PhaseResponseRecord[];
    hintsUsed?: number;
    unlockLevel?: UnlockLevel;
    problemMode?: ProblemMode;
    freeFormAnalysis?: FreeFormProblemAnalysis;
    signal?: AbortSignal;
  } = {}
): Promise<{
  message: string;
  isBlocked: boolean;
  nextPhase?: MindGuidePhase;
  diagnosis?: DiagnosisResult;
  aiFallbackEvent?: AIFallbackEvent;
}> {
  const currentPhase = options.currentPhase ?? "problem_understanding";
  const selectedProblem = options.selectedProblem ?? null;

  if (
    selectedProblem &&
    options.problemMode === "free_form" &&
    options.freeFormAnalysis
  ) {
    if (isPrematureFinalAnswer(studentResponse, selectedProblem, currentPhase)) {
      return {
        message:
          "Let's hold the final answer for now. Explain the reasoning requested in this phase before moving to the solution.",
        isBlocked: true,
        nextPhase: currentPhase,
        diagnosis: {
          errorType: "skipped_reasoning",
          correctivePrompt:
            "Explain the reasoning requested in this phase before moving to the solution.",
          phase: currentPhase,
          reasons: ["A final result was supplied before the reasoning phases were complete."],
          detectedAt: Date.now(),
        },
      };
    }

    return evaluateFreeFormPhaseResponse({
      conversationHistory,
      studentResponse,
      currentPhase,
      selectedProblem,
      analysis: options.freeFormAnalysis,
      phaseResponses: options.phaseResponses ?? [],
      signal: options.signal,
    });
  }

  if (selectedProblem) {
    let diagnosis = diagnoseResponse(studentResponse, selectedProblem, currentPhase);
    let aiFallbackEvent: AIFallbackEvent | undefined;

    if (
      shouldUseAIDiagnosisFallback(
        studentResponse,
        selectedProblem,
        currentPhase,
        diagnosis
      )
    ) {
      const fallbackResult = await aiAssistedDiagnosis(
        studentResponse,
        selectedProblem,
        currentPhase,
        diagnosis,
        options.signal
      );
      diagnosis = fallbackResult.diagnosis;
      aiFallbackEvent = fallbackResult.fallbackEvent;
    }

    const phaseResponses = [
      ...(options.phaseResponses ?? []),
      buildCurrentPhaseResponse(currentPhase, studentResponse, diagnosis),
    ];
    const adjustment = getSessionDifficultyAdjustment({
      phaseResponses,
      currentDiagnosis: diagnosis,
      hintsUsed: options.hintsUsed ?? 0,
      unlockLevel: options.unlockLevel ?? 0,
    });

    if (diagnosis.errorType !== "none") {
      return {
        message: diagnosis.correctivePrompt,
        isBlocked: true,
        nextPhase: currentPhase,
        diagnosis,
        aiFallbackEvent,
      };
    }

    if (isPrematureFinalAnswer(studentResponse, selectedProblem, currentPhase)) {
      return {
        message:
          "Let's hold the final answer for now. MINDGUIDE needs your reasoning first, so answer the current phase question before we unlock the solution.",
        isBlocked: true,
        nextPhase: currentPhase,
        diagnosis,
        aiFallbackEvent,
      };
    }

    const nextPhase = getNextMindGuidePhase(currentPhase);

    return {
      message: nextPhase
        ? getMindGuidePhasePrompt(selectedProblem, nextPhase, adjustment)
        : "You have completed the required Socratic phases. You may now draft your final answer.",
      isBlocked: false,
      nextPhase: nextPhase ?? currentPhase,
      diagnosis,
      aiFallbackEvent,
    };
  }

  const checkPrompt = buildAnswerCheckPrompt(studentResponse);
  const nextPhase = getNextMindGuidePhase(currentPhase) ?? currentPhase;
  const phasePrompt = buildPhaseGuidancePrompt({
    subject: options.subject ?? "the selected subject",
    topic: options.topic ?? "the selected topic",
    originalQuestion:
      options.originalQuestion ??
      conversationHistory.find((message) => message.role === "student")?.content ??
      studentResponse,
    currentPhase,
    nextPhase,
  });
  const combinedSystemPrompt = `${SOCRATIC_SYSTEM_PROMPT}\n\n${checkPrompt}\n\n${phasePrompt}`;

  const rawResponse = await sendMessage(
    combinedSystemPrompt,
    conversationHistory,
    studentResponse,
    { signal: options.signal }
  );

  const isBlocked = rawResponse.includes("[BLOCKED]");
  const cleanedMessage = rawResponse
    .replace("[BLOCKED]", "")
    .replace("[GENUINE]", "")
    .trim();

  return {
    message: cleanResponse(cleanedMessage),
    isBlocked,
    nextPhase: isBlocked ? currentPhase : nextPhase,
  };
}

async function evaluateFreeFormPhaseResponse(options: {
  conversationHistory: ChatMessage[];
  studentResponse: string;
  currentPhase: MindGuidePhase;
  selectedProblem: MindGuideProblem;
  analysis: FreeFormProblemAnalysis;
  phaseResponses: PhaseResponseRecord[];
  signal?: AbortSignal;
}): Promise<{
  message: string;
  isBlocked: boolean;
  nextPhase: MindGuidePhase;
  diagnosis: DiagnosisResult;
}> {
  const nextPhase = getNextMindGuidePhase(options.currentPhase);
  const context = JSON.stringify({
    question: options.selectedProblem.problemText,
    currentPhase: options.currentPhase,
    nextPhase,
    expectedConcepts: options.analysis.expectedConcepts,
    requiredFormula: options.analysis.requiredFormula,
    requiredTheorem: options.analysis.requiredTheorem,
    solutionOutline: options.analysis.solutionOutline,
    referenceAnswer: options.analysis.referenceAnswer,
    phaseResponses: options.phaseResponses.slice(-8),
    recentConversation: options.conversationHistory.slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    studentResponse: options.studentResponse,
  }).slice(0, 22_000);

  const raw = await sendMessage(
    "You are MINDGUIDE's strict Socratic phase evaluator. Use the private reference only to assess reasoning; never reveal the final answer. Return exactly one JSON object with no Markdown.",
    [],
    `Evaluate whether the student's response demonstrates the current phase well enough to advance. Diagnose one misconception when present. The message must be one concise Socratic question: either corrective guidance for the same phase or the next-phase prompt.\n\n${context}\n\nReturn exactly:\n{"advance":boolean,"blocked":boolean,"errorType":"wrong_formula|invalid_logic|misinterpreted_variable|computational_error|weak_justification|skipped_reasoning|none","reasons":["specific reason"],"message":"Socratic question"}`,
    { retryTransient: true, signal: options.signal }
  );

  const parsed = parseFreeFormPhaseEvaluation(raw);
  const detectedAt = Date.now();
  const diagnosis: DiagnosisResult = {
    errorType: parsed.errorType,
    correctivePrompt: parsed.errorType === "none" ? "" : parsed.message,
    phase: options.currentPhase,
    reasons: parsed.reasons,
    detectedAt,
  };
  const mayAdvance = parsed.advance && !parsed.blocked && parsed.errorType === "none";

  return {
    message: parsed.message,
    isBlocked: !mayAdvance,
    nextPhase: mayAdvance && nextPhase ? nextPhase : options.currentPhase,
    diagnosis,
  };
}

const FREE_FORM_ERROR_TYPES = [
  "wrong_formula",
  "invalid_logic",
  "misinterpreted_variable",
  "computational_error",
  "weak_justification",
  "skipped_reasoning",
  "none",
] as const;

function parseFreeFormPhaseEvaluation(raw: string): {
  advance: boolean;
  blocked: boolean;
  errorType: DiagnosisResult["errorType"];
  reasons: string[];
  message: string;
} {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Gemini returned malformed phase feedback. Please retry.");
  }

  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    throw new Error("Gemini returned malformed phase feedback. Please retry.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini returned invalid phase feedback. Please retry.");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.advance !== "boolean" ||
    typeof record.blocked !== "boolean" ||
    typeof record.errorType !== "string" ||
    !FREE_FORM_ERROR_TYPES.includes(
      record.errorType as (typeof FREE_FORM_ERROR_TYPES)[number]
    ) ||
    typeof record.message !== "string" ||
    record.message.trim().length < 5
  ) {
    throw new Error("Gemini returned incomplete phase feedback. Please retry.");
  }

  const reasons = Array.isArray(record.reasons)
    ? record.reasons
        .filter((reason): reason is string => typeof reason === "string")
        .map((reason) => reason.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    advance: record.advance,
    blocked: record.blocked,
    errorType: record.errorType as DiagnosisResult["errorType"],
    reasons: reasons.length ? reasons : ["Gemini supplied no detailed reason."],
    message: cleanResponse(record.message).slice(0, 4_000),
  };
}

export function getInitialMindGuidePhase(): MindGuidePhase {
  return "problem_understanding";
}

export function getNextMindGuidePhase(
  currentPhase: MindGuidePhase
): MindGuidePhase | null {
  const currentIndex = MINDGUIDE_PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex < 0 || currentIndex === MINDGUIDE_PHASE_ORDER.length - 1) {
    return null;
  }

  return MINDGUIDE_PHASE_ORDER[currentIndex + 1];
}

export function getMindGuidePhaseLabel(phase: MindGuidePhase): string {
  return MINDGUIDE_PHASE_LABELS[phase];
}

export function getMindGuidePhasePrompt(
  problem: MindGuideProblem,
  phase: MindGuidePhase,
  adjustment: SessionDifficultyAdjustment = "maintain"
): string {
  let prompt: string;

  if (phase === "formula_theorem_justification") {
    const requiredAreas = [
      problem.requiredFormula
        ? `Required formula/method area: ${problem.requiredFormula}`
        : null,
      problem.requiredTheorem
        ? `Required theorem/concept area: ${problem.requiredTheorem}`
        : null,
    ].filter(Boolean);

    prompt = [FORMULA_THEOREM_JUSTIFICATION_PROMPT, ...requiredAreas].join("\n\n");
  } else {
    prompt = problem.socraticPrompts[phase];
  }

  return applyDifficultyAdjustment(prompt, phase, adjustment);
}

export function validateFormulaTheoremJustification(
  studentResponse: string,
  problem: MindGuideProblem
): { isAccepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const trimmed = studentResponse.trim();

  if (!trimmed) {
    reasons.push("Response is empty.");
  }

  if (trimmed.length < 20) {
    reasons.push("Response is shorter than 20 characters.");
  }

  const normalizedResponse = normalizeForConceptCheck(trimmed);
  const mentionsExpectedConcept = problem.expectedConcepts.some((concept) =>
    includesConcept(normalizedResponse, concept)
  );
  const mentionsRequiredArea = [
    problem.requiredFormula,
    problem.requiredTheorem,
  ].some((requiredArea) =>
    requiredArea ? includesRequiredArea(normalizedResponse, requiredArea) : false
  );

  if (!mentionsExpectedConcept && !mentionsRequiredArea) {
    reasons.push("Response does not mention an expected concept or required area.");
  }

  const includesReasoningWord = JUSTIFICATION_REASONING_WORDS.some((word) =>
    normalizedResponse.includes(word)
  );

  if (!includesReasoningWord) {
    reasons.push("Response does not include a reasoning word.");
  }

  return {
    isAccepted: reasons.length === 0,
    reasons,
  };
}

export function getMindGuidePhaseProgress(phase: MindGuidePhase): number {
  const phaseIndex = MINDGUIDE_PHASE_ORDER.indexOf(phase);
  if (phaseIndex < 0) return 0;
  return Math.round(((phaseIndex + 1) / MINDGUIDE_PHASE_ORDER.length) * 100);
}

export function isFinalAnswerUnlocked(phase: MindGuidePhase): boolean {
  return phase === "scorecard";
}

/**
 * Generates progressive hints based on the current conversation context.
 *
 * @param hintLevel - The hint level (1 = subtle, 2 = moderate, 3 = strong).
 * @param originalQuestion - The student's original question.
 * @param conversationHistory - Messages so far.
 * @returns The hint text.
 */
export async function generateHint(
  hintLevel: number,
  originalQuestion: string,
  conversationHistory: ChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const clampedLevel = Math.min(Math.max(hintLevel, 1), 3);
  const conversationSummary = conversationHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join(" | ");

  const hintPrompt = buildHintPrompt(
    clampedLevel,
    originalQuestion,
    conversationSummary
  );

  const response = await sendMessage(
    SOCRATIC_SYSTEM_PROMPT,
    [],
    hintPrompt,
    { signal }
  );

  return cleanResponse(response);
}

/**
 * Extracts the current logic map from the conversation.
 *
 * The AI analyzes the discussion and identifies the reasoning steps
 * the student has taken (completed) and still needs to take.
 *
 * @param originalQuestion - The student's original question.
 * @param conversationHistory - All messages so far.
 * @returns An array of logic map nodes.
 */
export async function extractLogicMap(
  originalQuestion: string,
  conversationHistory: ChatMessage[],
  signal?: AbortSignal
): Promise<LogicMapNode[]> {
  const messages = getRecentMessageViews(conversationHistory);

  const prompt = buildLogicMapPrompt(originalQuestion, messages);

  const response = await sendMessage(SOCRATIC_SYSTEM_PROMPT, [], prompt, {
    signal,
  });
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Gemini returned a malformed logic map. Please retry.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Gemini returned a malformed logic map. Please retry.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 12) {
    throw new Error("Gemini returned an invalid logic map. Please retry.");
  }

  return parsed.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Gemini returned an invalid logic-map step. Please retry.");
    }
    const node = value as Record<string, unknown>;
    if (
      typeof node.title !== "string" ||
      typeof node.description !== "string" ||
      typeof node.completed !== "boolean"
    ) {
      throw new Error("Gemini returned an incomplete logic-map step. Please retry.");
    }
    return {
      step: index + 1,
      title: node.title.trim().slice(0, 160) || `Step ${index + 1}`,
      description: node.description.trim().slice(0, 1_000),
      completed: node.completed,
    };
  });
}

/**
 * Generates the AI summary of the completed session.
 *
 * @param originalQuestion - The student's original question.
 * @param conversationHistory - All messages from the session.
 * @param draft - The student's draft answer and reflections.
 * @returns The AI-generated summary text.
 */
export async function generateSummary(
  originalQuestion: string,
  conversationHistory: ChatMessage[],
  draft: { answer: string; methodology: string; reflection: string },
  signal?: AbortSignal
): Promise<string> {
  const messages = getRecentMessageViews(conversationHistory);

  const prompt = buildSummaryPrompt(originalQuestion, messages, draft);
  const response = await sendMessage(SOCRATIC_SYSTEM_PROMPT, [], prompt, {
    signal,
  });
  return cleanResponse(response);
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Cleans up an AI response by removing unwanted formatting artifacts.
 *
 * @param response - The raw AI response text.
 * @returns A cleaned string.
 */
function cleanResponse(response: string): string {
  return response
    .replace(/^\*\*/gm, "")
    .replace(/\*\*$/gm, "")
    .replace(/^##\s*/gm, "")
    .replace(/^#\s*/gm, "")
    .trim();
}

function buildCurrentPhaseResponse(
  phase: MindGuidePhase,
  response: string,
  diagnosisResult: DiagnosisResult
): PhaseResponseRecord {
  return {
    id: `current-${diagnosisResult.detectedAt}`,
    phase,
    response,
    submittedAt: diagnosisResult.detectedAt,
    diagnosisResult,
  };
}

function getRecentMessageViews(
  conversationHistory: ChatMessage[],
  characterLimit = 24_000
): Array<{ role: ChatMessage["role"]; content: string }> {
  const selected: Array<{ role: ChatMessage["role"]; content: string }> = [];
  let remaining = characterLimit;
  for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
    if (remaining <= 0) break;
    const message = conversationHistory[index];
    const content = message.content.slice(-remaining);
    selected.push({ role: message.role, content });
    remaining -= content.length;
  }
  return selected.reverse();
}

function applyDifficultyAdjustment(
  prompt: string,
  phase: MindGuidePhase,
  adjustment: SessionDifficultyAdjustment
): string {
  if (adjustment === "maintain") return prompt;

  if (adjustment === "simplify") {
    return [
      prompt,
      getSimplifiedPromptSupport(phase),
    ].join("\n\n");
  }

  return [
    prompt,
    getDeepenedPromptSupport(phase),
  ].join("\n\n");
}

function getSimplifiedPromptSupport(phase: MindGuidePhase): string {
  const supports: Partial<Record<MindGuidePhase, string>> = {
    problem_understanding:
      "Break it down first: list only the given values or statements, then name what the problem is asking.",
    method_selection:
      "Use one small clue from the wording of the problem to choose the method. You do not need to compute yet.",
    formula_theorem_justification:
      "Start with this sentence frame: This method applies because the problem gives ___ and asks for ___.",
    guided_computation_or_reasoning:
      "Take just the next step. Write the calculation or logical move before trying to finish the whole solution.",
    error_diagnosis:
      "Check one possible error at a time: first the setup, then the calculation or truth-value step.",
    progressive_unlock:
      "Use the support one level at a time and explain the next missing step in your own words.",
    scorecard:
      "Name one part of your reasoning that is strongest and one part you should verify before the final answer.",
  };

  return supports[phase] ?? "Break the prompt into one small reasoning step.";
}

function getDeepenedPromptSupport(phase: MindGuidePhase): string {
  const supports: Partial<Record<MindGuidePhase, string>> = {
    problem_understanding:
      "Also identify one detail that might be easy to overlook and explain why it matters.",
    method_selection:
      "Compare your method with one tempting alternative and explain why your method fits better.",
    formula_theorem_justification:
      "Go further by connecting the formula or theorem to a specific phrase, value, or condition in the problem.",
    guided_computation_or_reasoning:
      "After the next step, add a quick verification showing why the result is reasonable.",
    error_diagnosis:
      "Predict the most likely mistake someone would make here and explain how your reasoning avoids it.",
    progressive_unlock:
      "Use the unlocked support to justify the next step, not just to copy it.",
    scorecard:
      "Evaluate your solution against accuracy, logic, method choice, justification, and interpretation.",
  };

  return supports[phase] ?? "Add one extra justification or verification step.";
}

function isPrematureFinalAnswer(
  studentResponse: string,
  selectedProblem: MindGuideProblem,
  currentPhase: MindGuidePhase
): boolean {
  if (isFinalAnswerUnlocked(currentPhase)) return false;

  const response = normalizeForAnswerCheck(studentResponse);
  const finalAnswer = normalizeForAnswerCheck(selectedProblem.finalAnswer);
  if (!response || !finalAnswer) return false;

  const answerTokens = finalAnswer
    .split(" ")
    .filter((token) => token.length > 1 && !["the", "is", "are"].includes(token));

  return answerTokens.length > 0 && answerTokens.every((token) => response.includes(token));
}

function normalizeForAnswerCheck(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9./\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForConceptCheck(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function includesConcept(normalizedResponse: string, concept: string): boolean {
  const normalizedConcept = normalizeForConceptCheck(concept).trim();
  return normalizedConcept
    ? normalizedResponse.includes(` ${normalizedConcept} `)
    : false;
}

function includesRequiredArea(
  normalizedResponse: string,
  requiredArea: string
): boolean {
  const requiredTokens = normalizeForConceptCheck(requiredArea)
    .trim()
    .split(" ")
    .filter((token) => token.length >= 4 && !isStopWord(token));

  return requiredTokens.some((token) => normalizedResponse.includes(` ${token} `));
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
  ].includes(token);
}
