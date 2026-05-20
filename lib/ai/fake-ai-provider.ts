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
