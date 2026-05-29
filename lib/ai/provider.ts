// AI provider seam (SPEC-007). `resolveAiProvider` returns the live provider only when the AI hard gate
// allows, otherwise the deterministic fake. Both return a DRAFT and never send a message — a human reviews
// and sends via the demo-safe outbound path. Live prompts strip phone-like PII; nothing is logged here.

import { evaluateAiHardGate, readAiHardGateInput } from "@/lib/ai/ai-gate";
import { fakeReplySuggestion, type AiMessage } from "@/lib/ai/fake-ai-provider";
import { redactValue } from "@/lib/observability/logger";

export type ReplyDraftInput = {
  messages: AiMessage[];
  goal?: string;
};

export type ReplyDraft = {
  provider: "fake" | "live";
  suggestion: string;
};

export interface AiProvider {
  readonly name: "fake" | "live";
  generateReplyDraft(input: ReplyDraftInput): Promise<ReplyDraft>;
}

export const fakeAiProvider: AiProvider = {
  name: "fake",
  async generateReplyDraft(input) {
    // Byte-for-byte the prior deterministic suggestion shape: { provider: "fake", suggestion }.
    return fakeReplySuggestion(input);
  }
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

function buildPrompt(input: ReplyDraftInput): string {
  const goal = input.goal ?? "help the customer";
  // Redact phone-like runs from each body before it enters the prompt (no raw PII leaves the system).
  const transcript = input.messages
    .map((message) => `${message.direction}: ${redactValue(message.body) as string}`)
    .join("\n");

  return [
    "You draft a concise SMS reply for a business. Do not send it — a human will review.",
    `Goal: ${goal}.`,
    'Reply to the latest inbound message in under 320 characters and end with "Reply STOP to opt out."',
    "",
    "Conversation:",
    transcript
  ].join("\n");
}

export const liveAiProvider: AiProvider = {
  name: "live",
  async generateReplyDraft(input) {
    const apiKey = process.env.AI_API_KEY ?? "";
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: 320,
        messages: [{ role: "user", content: buildPrompt(input) }]
      })
    });

    if (!response.ok) {
      throw new Error(`Live AI request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const suggestion = (data.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!suggestion) {
      throw new Error("Live AI returned an empty draft.");
    }

    return { provider: "live", suggestion };
  }
};

export function resolveAiProvider(env: Record<string, string | undefined> = process.env): AiProvider {
  return evaluateAiHardGate(readAiHardGateInput(env)).allowed ? liveAiProvider : fakeAiProvider;
}
