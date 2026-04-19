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
  buildHintPrompt,
  buildLogicMapPrompt,
  buildSummaryPrompt,
  buildCTScorePrompt,
} from "./prompts";
import type { ChatMessage, LogicMapNode } from "@/types";

// ─── Public API ──────────────────────────────────────────────

/**
 * Starts a new Socratic session by sending the student's original question
 * through the trigger prompt.
 *
 * @param subject - The learning subject (e.g., "Mathematics").
 * @param question - The student's original question or problem.
 * @returns The AI's opening Socratic probe.
 */
export async function startSession(
  subject: string,
  question: string
): Promise<string> {
  const triggerPrompt = buildTriggerPrompt(subject, question);
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
  studentResponse: string
): Promise<{ message: string; isBlocked: boolean }> {
  const checkPrompt = buildAnswerCheckPrompt(studentResponse);
  const combinedSystemPrompt = `${SOCRATIC_SYSTEM_PROMPT}\n\n${checkPrompt}`;

  const rawResponse = await sendMessage(
    combinedSystemPrompt,
    conversationHistory,
    studentResponse
  );

  const isBlocked = rawResponse.includes("[BLOCKED]");
  const cleanedMessage = rawResponse
    .replace("[BLOCKED]", "")
    .replace("[GENUINE]", "")
    .trim();

  return {
    message: cleanResponse(cleanedMessage),
    isBlocked,
  };
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
  conversationHistory: ChatMessage[]
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
    hintPrompt
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
  conversationHistory: ChatMessage[]
): Promise<LogicMapNode[]> {
  const messages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const prompt = buildLogicMapPrompt(originalQuestion, messages);

  try {
    const response = await sendMessage(SOCRATIC_SYSTEM_PROMPT, [], prompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("Logic map: AI did not return valid JSON, using fallback");
      return getDefaultLogicMap();
    }

    const parsed = JSON.parse(jsonMatch[0]) as LogicMapNode[];
    return parsed.map((node, index) => ({
      step: index + 1,
      title: String(node.title || `Step ${index + 1}`),
      description: String(node.description || ""),
      completed: Boolean(node.completed),
    }));
  } catch (err) {
    console.error("Logic map extraction failed:", err);
    return getDefaultLogicMap();
  }
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
  draft: { answer: string; methodology: string; reflection: string }
): Promise<string> {
  const messages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const prompt = buildSummaryPrompt(originalQuestion, messages, draft);
  const response = await sendMessage(SOCRATIC_SYSTEM_PROMPT, [], prompt);
  return cleanResponse(response);
}

/**
 * Evaluates the student's critical thinking score for the session.
 *
 * @param conversationHistory - All messages from the session.
 * @param hintsUsed - Number of hints the student requested.
 * @returns A score from 0 to 100.
 */
export async function evaluateCTScore(
  conversationHistory: ChatMessage[],
  hintsUsed: number
): Promise<number> {
  const messages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const prompt = buildCTScorePrompt(messages, hintsUsed);

  try {
    const response = await sendMessage(SOCRATIC_SYSTEM_PROMPT, [], prompt);
    const score = parseInt(response.trim(), 10);
    if (isNaN(score) || score < 0 || score > 100) {
      console.warn("CT Score: AI returned invalid score, using default 70");
      return 70;
    }
    return score;
  } catch (err) {
    console.error("CT Score evaluation failed:", err);
    return 70;
  }
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

/**
 * Returns a default logic map when AI extraction fails.
 *
 * @returns A generic 3-step logic map.
 */
function getDefaultLogicMap(): LogicMapNode[] {
  return [
    {
      step: 1,
      title: "Identify the Problem",
      description: "Understand what is being asked",
      completed: true,
    },
    {
      step: 2,
      title: "Choose a Method",
      description: "Select the appropriate approach",
      completed: false,
    },
    {
      step: 3,
      title: "Execute & Verify",
      description: "Apply the method and check the answer",
      completed: false,
    },
  ];
}
