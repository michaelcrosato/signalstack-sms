export type InboundKeywordAction = "OPT_OUT" | "OPT_IN" | "HELP" | "NONE";

const optOutKeywords = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const optInKeywords = new Set(["YES", "JOIN", "CONFIRM", "Y", "START", "UNSTOP"]);
const helpKeywords = new Set(["HELP", "INFO"]);

export function classifyInboundKeyword(body: string): InboundKeywordAction {
  const keyword = body.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "").toUpperCase();

  if (!keyword) {
    return "NONE";
  }
  if (optOutKeywords.has(keyword)) {
    return "OPT_OUT";
  }
  if (optInKeywords.has(keyword)) {
    return "OPT_IN";
  }
  if (helpKeywords.has(keyword)) {
    return "HELP";
  }

  return "NONE";
}
