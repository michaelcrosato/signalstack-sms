export type AiMessage = {
  direction: string;
  body: string;
};

export function fakeCampaignCopy(prompt: string) {
  return `Demo-safe campaign copy for: ${prompt}`;
}

export function fakeCampaignCopyVariants(input: {
  prompt: string;
  businessName?: string;
  tone?: string;
}) {
  const businessName = input.businessName ?? "SignalStack Demo Co";
  const tone = input.tone ?? "friendly";

  return {
    provider: "fake" as const,
    variants: [
      `${businessName}: ${fakeCampaignCopy(input.prompt)} Reply STOP to opt out.`,
      `${businessName} update: ${input.prompt} This demo-safe draft is ${tone}. Reply STOP to opt out.`
    ]
  };
}

export function fakeReplySuggestion(input: { messages: AiMessage[]; goal?: string }) {
  const latestInbound = [...input.messages].reverse().find((message) => message.direction === "INBOUND");
  const goal = input.goal ?? "help the customer";

  return {
    provider: "fake" as const,
    suggestion: `Thanks for reaching out. Based on "${latestInbound?.body ?? "your message"}", we can ${goal}. Reply STOP to opt out.`
  };
}

export function fakeConversationSummary(messages: AiMessage[]) {
  const inboundCount = messages.filter((message) => message.direction === "INBOUND").length;
  const latest = messages[messages.length - 1]?.body ?? "No messages yet.";

  return {
    provider: "fake" as const,
    summary: `Demo summary: ${messages.length} messages, ${inboundCount} inbound. Latest: ${latest}`
  };
}

export function fakeLeadQualification(messages: AiMessage[]) {
  const text = messages.map((message) => message.body.toLowerCase()).join(" ");
  const score = text.includes("pricing") || text.includes("quote") ? 82 : text.includes("help") ? 64 : 40;
  const stage = score >= 80 ? "HOT" : score >= 60 ? "WARM" : "NURTURE";

  return {
    provider: "fake" as const,
    score,
    stage,
    reasons: [
      score >= 80 ? "Asked about pricing or quote." : "No strong purchase signal found.",
      "Deterministic fake AI output for demo/test mode."
    ]
  };
}

export function assertFakeAiProvider() {
  if ((process.env.AI_PROVIDER ?? "fake") !== "fake") {
    throw new Error("Live AI providers are not enabled in this milestone.");
  }
}

export type ConversationSentiment = {
  provider: "fake" | "live";
  sentiment: string;
  category: string;
};

export function fakeConversationSentiment(messages: AiMessage[]): ConversationSentiment {
  const text = messages.map((message) => message.body.toLowerCase()).join(" ");
  const sentiment =
    text.includes("pricing") || text.includes("yes") || text.includes("join")
      ? "POSITIVE"
      : text.includes("stop") || text.includes("unsubscribe") || text.includes("cancel")
        ? "NEGATIVE"
        : "NEUTRAL";
  const category =
    text.includes("stop") || text.includes("unsubscribe")
      ? "OPT_OUT"
      : text.includes("help") || text.includes("support")
        ? "SUPPORT"
        : text.includes("pricing") || text.includes("quote")
          ? "INQUIRY"
          : "SALUTATION";

  return {
    provider: "fake" as const,
    sentiment,
    category
  };
}

