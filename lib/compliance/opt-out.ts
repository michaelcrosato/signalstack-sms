export type InboundKeywordAction = "OPT_OUT" | "HELP" | "NONE";

const optOutKeywords = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const helpKeywords = new Set(["HELP"]);

export function classifyInboundKeyword(body: string): InboundKeywordAction {
  const keyword = body.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "").toUpperCase();

  if (!keyword) {
    return "NONE";
  }
  if (optOutKeywords.has(keyword)) {
    return "OPT_OUT";
  }
  if (helpKeywords.has(keyword)) {
    return "HELP";
  }

  return "NONE";
}
