import { evaluateAiHardGate, readAiHardGateInput } from "@/lib/ai/ai-gate";
import {
  fakeLeadQualification,
  fakeReplySuggestion,
  fakeCampaignCopyVariants,
  fakeConversationSummary,
  fakeConversationSentiment,
  type ConversationSentiment,
  type AiMessage
} from "@/lib/ai/fake-ai-provider";
import { redactValue } from "@/lib/observability/logger";

export type ReplyDraftInput = {
  messages: AiMessage[];
  goal?: string;
};

export type ReplyDraft = {
  provider: "fake" | "live";
  suggestion: string;
};

export type LeadQualification = {
  provider: "fake" | "live";
  score: number;
  stage: string;
  reasons: string[];
};

export type CampaignCopyInput = {
  prompt: string;
  businessName?: string;
  tone?: string;
};

export type CampaignCopy = {
  provider: "fake" | "live";
  variants: string[];
};

export type ConversationSummaryInput = {
  messages: AiMessage[];
};

export type ConversationSummary = {
  provider: "fake" | "live";
  summary: string;
};

export type ConversationSentimentInput = {
  messages: AiMessage[];
};

export interface AiProvider {
  readonly name: "fake" | "live";
  generateReplyDraft(input: ReplyDraftInput): Promise<ReplyDraft>;
  qualifyLead(input: { messages: AiMessage[] }): Promise<LeadQualification>;
  generateCampaignCopy(input: CampaignCopyInput): Promise<CampaignCopy>;
  summarizeConversation(input: ConversationSummaryInput): Promise<ConversationSummary>;
  analyzeConversationSentiment(input: ConversationSentimentInput): Promise<ConversationSentiment>;
}

export const fakeAiProvider: AiProvider = {
  name: "fake",
  async generateReplyDraft(input) {
    // Byte-for-byte the prior deterministic suggestion shape: { provider: "fake", suggestion }.
    return fakeReplySuggestion(input);
  },
  async qualifyLead(input) {
    // Byte-for-byte the prior deterministic shape: { provider: "fake", score, stage, reasons }.
    return fakeLeadQualification(input.messages);
  },
  async generateCampaignCopy(input) {
    // Byte-for-byte the prior deterministic campaign variants shape
    return fakeCampaignCopyVariants(input);
  },
  async summarizeConversation(input) {
    // Byte-for-byte the prior deterministic summary shape
    return fakeConversationSummary(input.messages);
  },
  async analyzeConversationSentiment(input) {
    return fakeConversationSentiment(input.messages);
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

// Defensive parse of the model's lead-qualification JSON (analysis only; never trusts shape blindly).
function parseLeadQualification(text: string): { score: number; stage: string; reasons: string[] } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as {
      score?: unknown;
      stage?: unknown;
      reasons?: unknown;
    };
    const raw = Number(parsed.score);
    if (!Number.isFinite(raw)) {
      throw new Error("non-numeric score");
    }
    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const stage = typeof parsed.stage === "string" && parsed.stage.length > 0 ? parsed.stage : "NURTURE";
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map((reason) => String(reason)) : [];
    return { score, stage, reasons };
  } catch {
    throw new Error("Live AI returned an unparseable lead qualification.");
  }
}

// Defensive parse of the model's campaign copy variants JSON (analysis only; never trusts shape blindly).
function parseCampaignCopy(text: string): { variants: string[] } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as {
      variants?: unknown;
    };
    if (Array.isArray(parsed.variants)) {
      const variants = parsed.variants.map((v) => String(v).trim());
      if (variants.length >= 2) {
        return { variants };
      }
    }
    throw new Error("expected at least 2 variants in array");
  } catch {
    throw new Error("Live AI returned an unparseable campaign copy.");
  }
}

// Defensive parse of the model's conversation summary JSON (analysis only; never trusts shape blindly).
function parseConversationSummary(text: string): { summary: string } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as {
      summary?: unknown;
    };
    if (typeof parsed.summary === "string" && parsed.summary.trim().length > 0) {
      return { summary: parsed.summary.trim() };
    }
    throw new Error("missing summary field");
  } catch {
    throw new Error("Live AI returned an unparseable conversation summary.");
  }
}

// Defensive parse of the model's conversation sentiment JSON (analysis only; never trusts shape blindly).
function parseConversationSentiment(text: string): { sentiment: string; category: string } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as {
      sentiment?: unknown;
      category?: unknown;
    };
    const sentiment =
      typeof parsed.sentiment === "string" && parsed.sentiment.length > 0 ? parsed.sentiment : "NEUTRAL";
    const category =
      typeof parsed.category === "string" && parsed.category.length > 0 ? parsed.category : "INQUIRY";
    return { sentiment, category };
  } catch {
    throw new Error("Live AI returned an unparseable conversation sentiment.");
  }
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
  },
  async qualifyLead(input) {
    const apiKey = process.env.AI_API_KEY ?? "";
    const transcript = input.messages
      .map((message) => `${message.direction}: ${redactValue(message.body) as string}`)
      .join("\n");
    const prompt = [
      'Qualify this SMS lead. Return ONLY compact JSON: {"score": <0-100 integer>, "stage": "HOT|WARM|NURTURE", "reasons": ["short reason"]}.',
      "Analysis only — do not send anything.",
      "",
      "Conversation:",
      transcript
    ].join("\n");

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Live AI request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = (data.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return { provider: "live", ...parseLeadQualification(text) };
  },
  async generateCampaignCopy(input) {
    const apiKey = process.env.AI_API_KEY ?? "";
    const businessName = redactValue(input.businessName ?? "SignalStack Demo Co") as string;
    const tone = redactValue(input.tone ?? "friendly") as string;
    const prompt = redactValue(input.prompt) as string;

    const promptText = [
      `Generate two marketing/promotional SMS variants for a campaign. The business name is "${businessName}" and the tone should be "${tone}".`,
      `Campaign prompt/topic: "${prompt}"`,
      `Each SMS variant must end with "Reply STOP to opt out." and be under 320 characters.`,
      `Return ONLY compact JSON: {"variants": ["first variant SMS here", "second variant SMS here"]}.`
    ].join("\n");

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: promptText }]
      })
    });

    if (!response.ok) {
      throw new Error(`Live AI request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = (data.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return { provider: "live", ...parseCampaignCopy(text) };
  },
  async summarizeConversation(input) {
    const apiKey = process.env.AI_API_KEY ?? "";
    const transcript = input.messages
      .map((message) => `${message.direction}: ${redactValue(message.body) as string}`)
      .join("\n");
    const promptText = [
      `Summarize the following SMS conversation in under 320 characters.`,
      `Return ONLY compact JSON: {"summary": "your concise summary here"}.`,
      "",
      "Conversation:",
      transcript
    ].join("\n");

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: promptText }]
      })
    });

    if (!response.ok) {
      throw new Error(`Live AI request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = (data.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return { provider: "live", ...parseConversationSummary(text) };
  },
  async analyzeConversationSentiment(input) {
    const apiKey = process.env.AI_API_KEY ?? "";
    const transcript = input.messages
      .map((message) => `${message.direction}: ${redactValue(message.body) as string}`)
      .join("\n");
    const promptText = [
      'Analyze the sentiment and category of this SMS conversation. Return ONLY compact JSON: {"sentiment": "POSITIVE|NEGATIVE|NEUTRAL", "category": "INQUIRY|OPT_OUT|SUPPORT|SALUTATION"}.',
      "Analysis only — do not send anything.",
      "",
      "Conversation:",
      transcript
    ].join("\n");

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: promptText }]
      })
    });

    if (!response.ok) {
      throw new Error(`Live AI request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = (data.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return { provider: "live", ...parseConversationSentiment(text) };
  }
};

export function resolveAiProvider(env: Record<string, string | undefined> = process.env): AiProvider {
  return evaluateAiHardGate(readAiHardGateInput(env)).allowed ? liveAiProvider : fakeAiProvider;
}
