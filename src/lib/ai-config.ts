/**
 * AI provider configuration module.
 *
 * Centralizes the selection between Gemini API (cloud) and Ollama (local)
 * based on environment variables. Components and services import the
 * resolved config from here rather than reading env vars directly.
 *
 * @module lib/ai-config
 */

import type { AIProvider, AIProviderConfig } from "@/types";

/**
 * Resolves the AI provider configuration from environment variables.
 *
 * @returns The fully resolved AI provider configuration object.
 */
function resolveAIConfig(): AIProviderConfig {
  const provider = (import.meta.env.VITE_AI_PROVIDER as AIProvider) || "gemini";

  return {
    provider,
    geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || "",
    ollamaBaseUrl:
      import.meta.env.VITE_OLLAMA_BASE_URL || "http://localhost:11434",
    ollamaModel: import.meta.env.VITE_OLLAMA_MODEL || "gemma3",
  };
}

/** The resolved AI provider configuration, read once at module load. */
export const aiConfig: AIProviderConfig = resolveAIConfig();

/**
 * Checks whether a valid AI provider is configured.
 *
 * For Gemini, this means an API key is present.
 * For Ollama, we assume it's available if the base URL is set.
 *
 * @returns `true` if the selected provider appears correctly configured.
 */
export function isAIConfigured(): boolean {
  if (aiConfig.provider === "gemini") {
    return Boolean(aiConfig.geminiApiKey && aiConfig.geminiApiKey !== "your_gemini_api_key");
  }
  return Boolean(aiConfig.ollamaBaseUrl);
}
