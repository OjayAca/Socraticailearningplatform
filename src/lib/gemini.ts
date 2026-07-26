/**
 * Legacy compatibility shim.
 *
 * Browser-side AI providers were removed in schema v3 and remain disabled in schema v4. Authoritative learning
 * operations use Firebase callable Functions through `secure-api.ts`.
 */

import type { ChatMessage } from "@/types";

export type AIRequestErrorCode = "server_authority_required";

export class AIRequestError extends Error {
  constructor(
    public readonly code: AIRequestErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

export interface AIRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retryTransient?: boolean;
}

export async function sendMessage(
  _systemPrompt: string,
  _conversationHistory: ChatMessage[],
  _userMessage: string,
  _options: AIRequestOptions = {}
): Promise<string> {
  throw new AIRequestError(
    "server_authority_required",
    "This legacy browser AI path is disabled. Start or resume a secure schema-v4 session."
  );
}
