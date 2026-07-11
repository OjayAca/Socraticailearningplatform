/**
 * Gemini / Ollama AI client module.
 *
 * Provides a unified `sendMessage` function that routes to either the
 * Google Gemini API or a local Ollama instance based on `ai-config`.
 *
 * @module lib/gemini
 */

import { GoogleGenAI } from "@google/genai";
import { aiConfig } from "./ai-config";
import type { ChatMessage } from "@/types";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CONTEXT_CHARACTERS = 24_000;
const MAX_AI_RESPONSE_CHARACTERS = 4_000;

export type AIRequestErrorCode =
  | "not_configured"
  | "timeout"
  | "cancelled"
  | "quota"
  | "safety"
  | "network"
  | "empty_response"
  | "unknown";

export class AIRequestError extends Error {
  constructor(
    public readonly code: AIRequestErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "AIRequestError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export interface AIRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retryTransient?: boolean;
}

/** Lazy-initialized Gemini client (only created when using Gemini provider). */
let geminiClient: GoogleGenAI | null = null;

/**
 * Returns the Gemini client singleton, creating it on first call.
 *
 * @returns The GoogleGenAI instance configured with the user's API key.
 * @throws Error if no Gemini API key is configured.
 */
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    if (!aiConfig.geminiApiKey) {
      throw new Error(
        "Gemini API key is not configured. Set VITE_GEMINI_API_KEY in your .env file."
      );
    }
    geminiClient = new GoogleGenAI({ apiKey: aiConfig.geminiApiKey });
  }
  return geminiClient;
}

/**
 * Sends a message to the configured AI provider and returns the response.
 *
 * Handles both Gemini API (cloud) and Ollama (local) transparently.
 * The conversation history is included for multi-turn context.
 *
 * @param systemPrompt - The system instruction defining AI behavior.
 * @param conversationHistory - Previous messages for context.
 * @param userMessage - The latest message from the student.
 * @returns The AI's text response.
 */
export async function sendMessage(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  userMessage: string,
  options: AIRequestOptions = {}
): Promise<string> {
  const attempts = options.retryTransient === false ? 1 : 2;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const text =
        aiConfig.provider === "ollama"
          ? await sendToOllama(systemPrompt, conversationHistory, userMessage, options)
          : await sendToGemini(systemPrompt, conversationHistory, userMessage, options);

      const normalized = text.trim().slice(0, MAX_AI_RESPONSE_CHARACTERS);
      if (!normalized) {
        throw new AIRequestError(
          "empty_response",
          "The AI returned an empty response. Please try again."
        );
      }
      return normalized;
    } catch (error) {
      const normalized = normalizeAIError(error);
      lastError = normalized;
      if (attempt + 1 >= attempts || !isTransient(normalized)) {
        throw normalized;
      }
    }
  }

  throw normalizeAIError(lastError);
}

/**
 * Sends a message to the Google Gemini API.
 */
async function sendToGemini(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  userMessage: string,
  options: AIRequestOptions
): Promise<string> {
  const client = getGeminiClient();
  const request = createRequestSignal(options);

  const contents = trimConversationHistory(conversationHistory).map((msg) => ({
    role: msg.role === "student" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  contents.push({ role: "user", parts: [{ text: userMessage }] });

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 1024,
        abortSignal: request.signal,
      },
    });

    return response.text ?? "";
  } catch (error) {
    if (request.didTimeout()) {
      throw new AIRequestError(
        "timeout",
        "The AI request timed out. Please try again.",
        error
      );
    }
    if (options.signal?.aborted) {
      throw new AIRequestError(
        "cancelled",
        "The AI request was cancelled.",
        error
      );
    }
    throw error;
  } finally {
    request.dispose();
  }
}

/**
 * Sends a message to a local Ollama instance.
 *
 * Uses the Ollama REST API (`/api/chat`) with streaming disabled.
 */
async function sendToOllama(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  userMessage: string,
  options: AIRequestOptions
): Promise<string> {
  const request = createRequestSignal(options);
  const messages = [
    { role: "system", content: systemPrompt },
    ...trimConversationHistory(conversationHistory).map((msg) => ({
      role: msg.role === "student" ? "user" : "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await fetch(`${aiConfig.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: request.signal,
      body: JSON.stringify({
        model: aiConfig.ollamaModel,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed (${response.status}): ${await response.text()}`
      );
    }

    const data = await response.json();
    return data.message?.content ?? "";
  } catch (error) {
    if (request.didTimeout()) {
      throw new AIRequestError(
        "timeout",
        "The AI request timed out. Please try again.",
        error
      );
    }
    if (options.signal?.aborted) {
      throw new AIRequestError(
        "cancelled",
        "The AI request was cancelled.",
        error
      );
    }
    throw error;
  } finally {
    request.dispose();
  }
}

function trimConversationHistory(history: ChatMessage[]): ChatMessage[] {
  const selected: ChatMessage[] = [];
  let totalCharacters = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const remaining = MAX_CONTEXT_CHARACTERS - totalCharacters;
    if (remaining <= 0) break;

    selected.push(
      message.content.length <= remaining
        ? message
        : { ...message, content: message.content.slice(-remaining) }
    );
    totalCharacters += Math.min(message.content.length, remaining);
  }

  return selected.reverse();
}

function createRequestSignal(options: AIRequestOptions): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("AI request timed out", "TimeoutError"));
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const handleExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    handleExternalAbort();
  } else {
    options.signal?.addEventListener("abort", handleExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", handleExternalAbort);
      if (timedOut && !controller.signal.aborted) controller.abort();
    },
  };
}

function normalizeAIError(error: unknown): AIRequestError {
  if (error instanceof AIRequestError) return error;

  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("api key") || normalized.includes("not configured")) {
    return new AIRequestError(
      "not_configured",
      "Gemini is not configured. Add a valid VITE_GEMINI_API_KEY and restart the app.",
      error
    );
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return new AIRequestError(
      "timeout",
      "The AI request timed out. Please try again.",
      error
    );
  }
  if (normalized.includes("abort")) {
    return new AIRequestError("cancelled", "The AI request was cancelled.", error);
  }
  if (
    normalized.includes("429") ||
    normalized.includes("quota") ||
    normalized.includes("resource_exhausted")
  ) {
    return new AIRequestError(
      "quota",
      "Gemini is temporarily rate-limited. Wait a moment and try again.",
      error
    );
  }
  if (normalized.includes("safety") || normalized.includes("blocked")) {
    return new AIRequestError(
      "safety",
      "The AI could not process that content safely. Rephrase the learning question and try again.",
      error
    );
  }
  if (
    normalized.includes("fetch") ||
    normalized.includes("network") ||
    normalized.includes("503") ||
    normalized.includes("500")
  ) {
    return new AIRequestError(
      "network",
      "The AI service is unavailable. Check the connection and try again.",
      error
    );
  }

  return new AIRequestError(
    "unknown",
    message || "The AI request failed. Please try again.",
    error
  );
}

function isTransient(error: AIRequestError): boolean {
  return error.code === "network" || error.code === "timeout" || error.code === "quota";
}
