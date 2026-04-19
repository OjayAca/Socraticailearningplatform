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
  userMessage: string
): Promise<string> {
  if (aiConfig.provider === "ollama") {
    return sendToOllama(systemPrompt, conversationHistory, userMessage);
  }
  return sendToGemini(systemPrompt, conversationHistory, userMessage);
}

/**
 * Sends a message to the Google Gemini API.
 */
async function sendToGemini(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  userMessage: string
): Promise<string> {
  const client = getGeminiClient();

  const contents = conversationHistory.map((msg) => ({
    role: msg.role === "student" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return text;
}

/**
 * Sends a message to a local Ollama instance.
 *
 * Uses the Ollama REST API (`/api/chat`) with streaming disabled.
 */
async function sendToOllama(
  systemPrompt: string,
  conversationHistory: ChatMessage[],
  userMessage: string
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: msg.role === "student" ? "user" : "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch(
    `${aiConfig.ollamaBaseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: aiConfig.ollamaModel,
        messages,
        stream: false,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama request failed (${response.status}): ${await response.text()}`
    );
  }

  const data = await response.json();
  return data.message?.content ?? "";
}
